use std::sync::Arc;
use std::time::Instant;

use knockport_core::{Content, Effect, Output, Session, complete, execute};
use russh::keys::PrivateKey;
use russh::server::{Auth, Config as SshConfig, Handler, Msg, Server as _, Session as SshSession};
use russh::{Channel, ChannelId};
use tokio::net::TcpListener;
use tokio::sync::mpsc::{UnboundedSender, unbounded_channel};

use crate::ansi;
use crate::config::Config;
use crate::editor::Decoder;
use crate::http::ContactSink;
use crate::journal::{Journal, SessionRecord, fingerprint};
use crate::ratelimit::RateLimiter;

pub fn substitute(marker: &str, cv_url: &str, book_url: &str) -> String {
    match marker {
        knockport_core::commands::contact::CV_URL => cv_url.to_string(),
        knockport_core::commands::contact::BOOK_URL => book_url.to_string(),
        other => other.to_string(),
    }
}

struct Writer {
    sender: UnboundedSender<Vec<u8>>,
}

impl Writer {
    fn start(handle: russh::server::Handle, channel: ChannelId) -> Self {
        let (sender, mut receiver) = unbounded_channel::<Vec<u8>>();
        tokio::spawn(async move {
            while let Some(data) = receiver.recv().await {
                if handle.data(channel, data).await.is_err() {
                    break;
                }
            }
        });
        Writer { sender }
    }

    fn send(&self, bytes: Vec<u8>) {
        let _ = self.sender.send(bytes);
    }
}

#[derive(Clone)]
pub struct KnockportServer {
    config: Arc<Config>,
    content: Arc<Content>,
    journal: Arc<Journal>,
    sink: Arc<dyn ContactSink>,
    limiter: Arc<RateLimiter>,
}

pub struct Connection {
    config: Arc<Config>,
    content: Arc<Content>,
    journal: Arc<Journal>,
    sink: Arc<dyn ContactSink>,
    limiter: Arc<RateLimiter>,
    session: Session,
    editor: crate::editor::LineEditor,
    decoder: Decoder,
    writer: Option<Writer>,
    started: Instant,
    peer: Option<std::net::SocketAddr>,
    persisted: bool,
}

impl russh::server::Server for KnockportServer {
    type Handler = Connection;

    fn new_client(&mut self, peer: Option<std::net::SocketAddr>) -> Connection {
        Connection {
            config: self.config.clone(),
            content: self.content.clone(),
            journal: self.journal.clone(),
            sink: self.sink.clone(),
            limiter: self.limiter.clone(),
            session: Session::new(),
            editor: crate::editor::LineEditor::default(),
            decoder: Decoder::new(),
            writer: None,
            started: Instant::now(),
            peer,
            persisted: false,
        }
    }
}

impl Connection {
    fn write(&self, bytes: Vec<u8>) {
        if let Some(writer) = &self.writer {
            writer.send(bytes);
        }
    }

    fn prompt(&self) {
        self.write(
            format!("\r\x1b[K{}{}", self.session.prompt(), self.editor.buffer()).into_bytes(),
        );
    }

    fn print(&mut self, output: &Output) {
        self.write(ansi::render(output));
    }

    fn banner(&self) -> Vec<u8> {
        let banner = include_str!("../../../brand/ascii-banner.txt");
        banner.replace('\n', "\r\n").into_bytes()
    }

    fn fingerprint(&self) -> String {
        let ip = self
            .peer
            .map(|p| p.ip().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        fingerprint(&ip, &self.config.ip_salt)
    }

    /// SSH and web share the same sink and rate limiter.
    /// Two delivery paths would mean two limits to maintain, so only one ever applies.
    async fn deliver(&self, payload: &knockport_core::ContactPayload) -> &'static str {
        let print = self.fingerprint();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or_default();

        if !self.limiter.check(&print, now) {
            return "That is a lot of messages for one hour. Try again later.";
        }

        match self.sink.send(payload, &print).await {
            Ok(()) => "Sent. I read everything, and I answer.",
            Err(error) => {
                tracing::error!(?error, "contact delivery failed over ssh");
                "The message did not go through. Reach me at g.flambard@gmail.com."
            }
        }
    }

    fn persist(&mut self) {
        // Don't persist if already done or if session is empty (no commands executed)
        if self.persisted || self.session.journal.is_empty() {
            return;
        }
        self.persisted = true;

        let record = SessionRecord {
            fingerprint: self.fingerprint(),
            started_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or_default(),
            egg_found: self.session.egg_found,
            events: self.session.journal.clone(),
        };
        if let Err(error) = self.journal.append(&record) {
            tracing::warn!(?error, "could not persist the session");
        }
    }
}

impl Handler for Connection {
    type Error = russh::Error;

    async fn auth_none(&mut self, _user: &str) -> Result<Auth, Self::Error> {
        Ok(Auth::Accept)
    }

    async fn auth_publickey(
        &mut self,
        _user: &str,
        _key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<Auth, Self::Error> {
        Ok(Auth::Accept)
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<Msg>,
        reply: russh::server::ChannelOpenHandle,
        session: &mut SshSession,
    ) -> Result<(), Self::Error> {
        self.writer = Some(Writer::start(session.handle(), channel.id()));
        reply.accept().await;
        Ok(())
    }

    async fn shell_request(
        &mut self,
        _channel: ChannelId,
        _session: &mut SshSession,
    ) -> Result<(), Self::Error> {
        let banner = self.banner();
        self.write(banner);
        self.prompt();
        Ok(())
    }

    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        session: &mut SshSession,
    ) -> Result<(), Self::Error> {
        for key in self.decoder.feed(data) {
            match self.editor.apply(key) {
                crate::editor::Action::Redraw => self.prompt(),
                crate::editor::Action::None => {}
                crate::editor::Action::Quit => {
                    self.persist();
                    session.close(channel)?;
                    return Ok(());
                }
                crate::editor::Action::Complete(partial) => {
                    let found = complete(&self.session, &self.content, &partial);
                    if let [only] = found.as_slice() {
                        self.editor.set_buffer(only);
                    } else if !found.is_empty() {
                        self.write(b"\r\n".to_vec());
                        self.print(&Output::text(&found.join("   ")));
                    }
                    self.prompt();
                }
                crate::editor::Action::Submit(line) => {
                    self.write(b"\r\n".to_vec());
                    if !line.trim().is_empty() {
                        self.editor.remember(&line);
                    }
                    let at_ms = self.started.elapsed().as_millis() as u64;
                    let output = execute(&mut self.session, &self.content, &line, at_ms);
                    self.print(&output);

                    match &output.effect {
                        Some(Effect::Clear) => self.write(ansi::CLEAR.to_vec()),
                        Some(Effect::Quit) => {
                            self.persist();
                            session.close(channel)?;
                            return Ok(());
                        }
                        Some(Effect::OpenUrl(marker)) => {
                            let url =
                                substitute(marker, &self.config.cv_url, &self.config.book_url);
                            self.print(&Output::text(&url));
                        }
                        Some(Effect::SubmitContact(payload)) => {
                            let message = self.deliver(payload).await;
                            self.print(&Output::text(message));
                        }
                        None => {}
                    }
                    self.prompt();
                }
            }
        }
        Ok(())
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        self.persist();
    }
}

pub async fn serve(
    config: Arc<Config>,
    content: Arc<Content>,
    journal: Arc<Journal>,
    sink: Arc<dyn ContactSink>,
    limiter: Arc<RateLimiter>,
) -> anyhow::Result<()> {
    let key = load_or_create_host_key(&config)?;
    let ssh_config = Arc::new(SshConfig {
        inactivity_timeout: Some(std::time::Duration::from_secs(900)),
        auth_rejection_time: std::time::Duration::from_secs(1),
        keys: vec![key],
        ..Default::default()
    });

    let listener = TcpListener::bind(&config.ssh_addr).await?;
    tracing::info!(addr = %config.ssh_addr, "ssh listening");

    let mut server = KnockportServer {
        config,
        content,
        journal,
        sink,
        limiter,
    };
    server.run_on_socket(ssh_config, &listener).await?;
    Ok(())
}

fn load_or_create_host_key(config: &Config) -> anyhow::Result<PrivateKey> {
    if config.host_key_path.exists() {
        let pem = std::fs::read_to_string(&config.host_key_path)?;
        return Ok(PrivateKey::from_openssh(&pem)?);
    }
    let key = PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519)?;
    if let Some(parent) = config.host_key_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(
        &config.host_key_path,
        key.to_openssh(russh::keys::ssh_key::LineEnding::LF)?
            .as_bytes(),
    )?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_url_effect_is_substituted_before_printing() {
        let rendered = substitute(
            "{{cv_url}}",
            "https://knockport.com/cv.pdf",
            "https://cal.example/g",
        );
        assert_eq!(rendered, "https://knockport.com/cv.pdf");
        let rendered = substitute(
            "{{book_url}}",
            "https://knockport.com/cv.pdf",
            "https://cal.example/g",
        );
        assert_eq!(rendered, "https://cal.example/g");
    }

    #[test]
    fn an_unknown_marker_is_returned_untouched() {
        assert_eq!(
            substitute("https://example.com", "a", "b"),
            "https://example.com"
        );
    }
}
