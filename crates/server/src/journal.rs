use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use knockport_core::Event;
use serde::Serialize;

#[allow(dead_code)]
#[derive(Debug, Serialize)]
pub struct SessionRecord {
    pub fingerprint: String,
    pub started_at: u64,
    pub egg_found: bool,
    pub events: Vec<Event>,
}

#[allow(dead_code)]
pub fn fingerprint(ip: &str, salt: &str) -> String {
    let digest = blake3::hash(format!("{salt}:{ip}").as_bytes());
    digest.to_hex()[..16].to_string()
}

#[allow(dead_code)]
pub struct Journal {
    path: PathBuf,
    lock: Mutex<()>,
}

#[allow(dead_code)]
impl Journal {
    pub fn new(path: PathBuf) -> Self {
        Journal {
            path,
            lock: Mutex::new(()),
        }
    }

    pub fn append(&self, record: &SessionRecord) -> anyhow::Result<()> {
        let line = serde_json::to_string(record)?;
        let _guard = self.lock.lock().expect("journal mutex");
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        writeln!(file, "{line}")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_is_stable_and_hides_the_address() {
        let a = fingerprint("81.20.3.4", "pepper");
        let b = fingerprint("81.20.3.4", "pepper");
        assert_eq!(a, b);
        assert!(!a.contains("81.20"));
        assert_eq!(a.len(), 16);
    }

    #[test]
    fn a_different_salt_gives_a_different_fingerprint() {
        assert_ne!(
            fingerprint("81.20.3.4", "pepper"),
            fingerprint("81.20.3.4", "salt")
        );
    }

    #[test]
    fn append_writes_one_json_line_per_record() {
        let dir = std::env::temp_dir().join(format!("knockport-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sessions.jsonl");
        let journal = Journal::new(path.clone());

        let record = SessionRecord {
            fingerprint: "deadbeefdeadbeef".to_string(),
            started_at: 1_700_000_000,
            egg_found: true,
            events: vec![knockport_core::Event {
                at_ms: 12,
                input: "ls".to_string(),
                ok: true,
            }],
        };
        journal.append(&record).unwrap();
        journal.append(&record).unwrap();

        let written = std::fs::read_to_string(&path).unwrap();
        assert_eq!(written.lines().count(), 2);
        assert!(written.contains("deadbeefdeadbeef"));
        assert!(!written.contains("81.20"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
