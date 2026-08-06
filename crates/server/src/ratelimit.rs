use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::sync::Mutex;

// Threshold for triggering a sweep of expired entries. A personal site portfolio with this
// many concurrent or recently-active visitors is generous. We sweep when exceeded to prevent
// unbounded growth without needing a background task or external cache crate.
const THRESHOLD: usize = 10_000;

#[allow(dead_code)]
pub struct RateLimiter {
    max: usize,
    window_secs: u64,
    hits: Mutex<HashMap<String, Vec<u64>>>,
}

#[allow(dead_code)]
impl RateLimiter {
    pub fn new(max: usize, window_secs: u64) -> Self {
        RateLimiter {
            max,
            window_secs,
            hits: Mutex::new(HashMap::new()),
        }
    }

    pub fn check(&self, key: &str, now_secs: u64) -> bool {
        let mut hits = self.hits.lock().expect("rate limiter mutex");

        // Sweep expired entries if map exceeds threshold, preventing unbounded growth
        // without removing live timestamps or resetting active visitors' budgets.
        if hits.len() > THRESHOLD {
            hits.retain(|_, entry| {
                entry.retain(|at| now_secs.saturating_sub(*at) < self.window_secs);
                !entry.is_empty()
            });
        }

        let key_str = key.to_string();

        match hits.entry(key_str) {
            Entry::Occupied(mut occ) => {
                let entry = occ.get_mut();
                entry.retain(|at| now_secs.saturating_sub(*at) < self.window_secs);

                if entry.len() >= self.max {
                    return false;
                }

                entry.push(now_secs);
                true
            }
            Entry::Vacant(vac) => {
                vac.insert(vec![now_secs]);
                true
            }
        }
    }

    pub fn len(&self) -> usize {
        let hits = self.hits.lock().expect("rate limiter mutex");
        hits.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_up_to_the_limit_then_refuses() {
        let limiter = RateLimiter::new(3, 3600);
        assert!(limiter.check("abc", 0));
        assert!(limiter.check("abc", 1));
        assert!(limiter.check("abc", 2));
        assert!(!limiter.check("abc", 3));
    }

    #[test]
    fn the_window_slides() {
        let limiter = RateLimiter::new(1, 60);
        assert!(limiter.check("abc", 0));
        assert!(!limiter.check("abc", 59));
        assert!(limiter.check("abc", 61));
        // The call at t=61 was the uncounted call in the previous fix. Verify it's now counted.
        assert!(!limiter.check("abc", 62));
    }

    #[test]
    fn keys_do_not_share_a_budget() {
        let limiter = RateLimiter::new(1, 60);
        assert!(limiter.check("abc", 0));
        assert!(limiter.check("def", 0));
    }

    #[test]
    fn expired_window_resets_budget_to_exactly_max() {
        let limiter = RateLimiter::new(3, 60);
        // Window 0-60
        assert!(limiter.check("abc", 0));
        assert!(limiter.check("abc", 1));
        assert!(limiter.check("abc", 2));
        assert!(!limiter.check("abc", 3));

        // All timestamps expired at t=61 (60-0=60, not < 60)
        assert!(limiter.check("abc", 61));
        assert!(limiter.check("abc", 62));
        assert!(limiter.check("abc", 63));
        assert!(!limiter.check("abc", 64));
    }

    #[test]
    fn sweep_removes_expired_entries_when_threshold_exceeded() {
        let limiter = RateLimiter::new(1, 60);

        // Create 10,500 entries at t=0
        for i in 0..10_500 {
            assert!(limiter.check(&format!("key{}", i), 0));
        }
        assert_eq!(limiter.len(), 10_500);

        // At t=61, all are expired. The next check() will trigger sweep since len > THRESHOLD.
        limiter.check("sweep_trigger", 61);

        // After sweep, almost all old entries should be gone
        let after = limiter.len();
        assert!(
            after < 200,
            "Expected sweep to remove expired entries, but len() = {}",
            after
        );
    }

    #[test]
    fn sweep_preserves_live_timestamps() {
        let limiter = RateLimiter::new(1, 100);

        // Create 5,000 old entries at t=0
        for i in 0..5_000 {
            limiter.check(&format!("old{}", i), 0);
        }

        // Create 6,000 live entries at t=51 (still within their window at t=150)
        for i in 0..6_000 {
            limiter.check(&format!("live{}", i), 51);
        }

        let total_before = 5_000 + 6_000;
        assert_eq!(limiter.len(), total_before);

        // At t=150: old entries (t=0) are expired (150-0=150 >= 100)
        //           live entries (t=51) are NOT expired (150-51=99 < 100)
        limiter.check("sweep_trigger", 150);

        let after = limiter.len();
        // Live entries should all remain, old ones should be removed
        assert!(
            after >= 6_000,
            "Expected at least 6,000 live entries, but len() = {}",
            after
        );
        assert!(
            after < 6_500,
            "Expected most old entries removed, but len() = {}",
            after
        );
    }
}
