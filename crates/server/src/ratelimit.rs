use std::collections::HashMap;
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
        let entry = hits.entry(key.to_string()).or_default();
        entry.retain(|at| now_secs.saturating_sub(*at) < self.window_secs);
        if entry.len() >= self.max {
            return false;
        }
        entry.push(now_secs);
        true
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
}
