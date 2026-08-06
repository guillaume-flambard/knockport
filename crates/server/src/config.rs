use std::path::PathBuf;

pub struct Config {
    pub ssh_addr: String,
    pub http_addr: String,
    pub host_key_path: PathBuf,
    pub ip_salt: String,
    pub journal_path: PathBuf,
    pub cv_url: String,
    pub book_url: String,
    pub smtp_url: String,
    pub mail_to: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        fn required(key: &str) -> anyhow::Result<String> {
            std::env::var(key).map_err(|_| anyhow::anyhow!("{key} must be set"))
        }
        fn optional(key: &str, fallback: &str) -> String {
            std::env::var(key).unwrap_or_else(|_| fallback.to_string())
        }

        Ok(Config {
            ssh_addr: optional("KNOCKPORT_SSH_ADDR", "0.0.0.0:22"),
            http_addr: optional("KNOCKPORT_HTTP_ADDR", "127.0.0.1:8080"),
            host_key_path: PathBuf::from(optional(
                "KNOCKPORT_HOST_KEY",
                "/var/lib/knockport/host_key",
            )),
            ip_salt: required("KNOCKPORT_IP_SALT")?,
            journal_path: PathBuf::from(optional(
                "KNOCKPORT_JOURNAL",
                "/var/lib/knockport/sessions.jsonl",
            )),
            cv_url: required("KNOCKPORT_CV_URL")?,
            book_url: required("KNOCKPORT_BOOK_URL")?,
            smtp_url: required("KNOCKPORT_SMTP_URL")?,
            mail_to: required("KNOCKPORT_MAIL_TO")?,
        })
    }
}
