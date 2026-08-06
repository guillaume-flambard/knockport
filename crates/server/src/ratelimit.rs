use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::sync::Mutex;

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
        let key_str = key.to_string();

        match hits.entry(key_str) {
            Entry::Occupied(mut occ) => {
                let entry = occ.get_mut();
                entry.retain(|at| now_secs.saturating_sub(*at) < self.window_secs);

                // Clean up empty entries to avoid unbounded HashMap growth
                if entry.is_empty() {
                    occ.remove();
                    return true;
                }

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
    }

    #[test]
    fn keys_do_not_share_a_budget() {
        let limiter = RateLimiter::new(1, 60);
        assert!(limiter.check("abc", 0));
        assert!(limiter.check("def", 0));
    }

    #[test]
    fn expired_key_is_removed_from_map() {
        let limiter = RateLimiter::new(1, 60);
        assert!(limiter.check("xyz", 0));
        assert_eq!(limiter.len(), 1);
        // Window expired at t=60, check at t=120 removes the entry
        assert!(limiter.check("xyz", 120));
        assert_eq!(limiter.len(), 0);
    }

    #[test]
    fn key_checked_twice_within_window_keeps_budget() {
        let limiter = RateLimiter::new(2, 100);
        // First check at t=0: entry becomes [0]
        assert!(limiter.check("abc", 0));
        // Second check at t=50: entry still has [0], pushes 50 -> [0, 50]
        assert!(limiter.check("abc", 50));
        // Third check at t=75: entry still has [0, 50], len=2 >= max=2, rate-limited
        assert!(!limiter.check("abc", 75));
    }
}
