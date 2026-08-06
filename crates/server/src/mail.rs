use knockport_core::ContactPayload;
use lettre::message::header::ContentType;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

use crate::http::ContactSink;

pub struct SmtpSink {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    to: String,
}

impl SmtpSink {
    pub fn new(smtp_url: &str, to: String) -> anyhow::Result<Self> {
        Ok(SmtpSink {
            transport: AsyncSmtpTransport::<Tokio1Executor>::from_url(smtp_url)?.build(),
            to,
        })
    }
}

/// Build an email message from a contact payload.
/// This function is separated for testability: it can be called to verify
/// email construction without requiring SMTP transport.
pub fn build_email(
    payload: &ContactPayload,
    fingerprint: &str,
    recipient: &str,
) -> anyhow::Result<Message> {
    let mut trail = String::new();
    for event in &payload.journal {
        trail.push_str(&format!(
            "  {:>6}ms  {}{}\n",
            event.at_ms,
            event.input,
            if event.ok { "" } else { "   (missed)" }
        ));
    }

    let body = format!(
        "From: {} <{}>\n\n{}\n\n---\nvisitor: {fingerprint}\nfound the hidden file: {}\n\nwhat they read:\n{}",
        payload.name,
        payload.email,
        payload.message,
        if payload.egg_found { "yes" } else { "no" },
        trail
    );

    Message::builder()
        .from(format!("knockport <{}>", recipient).parse()?)
        .reply_to(format!("{} <{}>", payload.name, payload.email).parse()?)
        .to(recipient.parse()?)
        .subject(format!("knockport: {}", payload.name))
        .header(ContentType::TEXT_PLAIN)
        .body(body)
        .map_err(Into::into)
}

#[async_trait::async_trait]
impl ContactSink for SmtpSink {
    async fn send(&self, payload: &ContactPayload, fingerprint: &str) -> anyhow::Result<()> {
        let email = build_email(payload, fingerprint, &self.to)?;
        self.transport.send(email).await?;
        Ok(())
    }
}
