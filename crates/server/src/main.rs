use std::sync::Arc;

use knockport_core::Content;
use knockport_server::config::Config;
use knockport_server::journal::Journal;
use knockport_server::{http, mail, ssh};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let config = Arc::new(Config::from_env()?);
    let content = Arc::new(Content::load());
    let journal = Arc::new(Journal::new(config.journal_path.clone()));
    let sink: Arc<dyn http::ContactSink> = Arc::new(mail::SmtpSink::new(
        &config.smtp_url,
        config.mail_to.clone(),
    )?);
    let limiter = Arc::new(knockport_server::ratelimit::RateLimiter::new(3, 3600));

    let state = http::AppState {
        sink: sink.clone(),
        limiter: limiter.clone(),
        journal: journal.clone(),
        content: content.clone(),
        salt: config.ip_salt.clone(),
        web_dir: config.web_dir.clone(),
        cv_file: config.cv_file.clone(),
        book_url: config.book_url.clone(),
    };

    let http_listener = tokio::net::TcpListener::bind(&config.http_addr).await?;
    let http_task = tokio::spawn(async move {
        axum::serve(
            http_listener,
            http::router(state).into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .await
    });

    let ssh_task = tokio::spawn(ssh::serve(config, content, journal, sink, limiter));

    tokio::select! {
        result = http_task => result??,
        result = ssh_task => result??,
    }
    Ok(())
}
