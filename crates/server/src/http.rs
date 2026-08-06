use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Html;
use axum::routing::{get, post};
use axum::{Json, Router};
use knockport_core::{ContactPayload, Content};
use serde::Deserialize;

use crate::journal::{Journal, fingerprint};
use crate::ratelimit::RateLimiter;

#[async_trait::async_trait]
pub trait ContactSink: Send + Sync {
    async fn send(&self, payload: &ContactPayload, fingerprint: &str) -> anyhow::Result<()>;
}

#[derive(Clone)]
pub struct AppState {
    pub sink: Arc<dyn ContactSink>,
    pub limiter: Arc<RateLimiter>,
    pub journal: Arc<Journal>,
    pub content: Arc<Content>,
    pub salt: String,
}

impl AppState {
    pub fn for_test(sink: Arc<dyn ContactSink>) -> Self {
        AppState {
            sink,
            limiter: Arc::new(RateLimiter::new(3, 3600)),
            journal: Arc::new(Journal::new(
                std::env::temp_dir().join("knockport-test.jsonl"),
            )),
            content: Arc::new(Content::load()),
            salt: "test-salt".to_string(),
        }
    }
}

#[derive(Deserialize)]
pub struct ContactRequest {
    pub name: String,
    pub email: String,
    pub message: String,
    #[serde(default)]
    pub journal: Vec<knockport_core::Event>,
    #[serde(default)]
    pub egg_found: bool,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/contact", post(contact))
        .route("/profile", get(profile))
        .with_state(state)
}

async fn profile(State(state): State<AppState>) -> Html<String> {
    Html(crate::profile::render(&state.content))
}

async fn contact(State(state): State<AppState>, Json(request): Json<ContactRequest>) -> StatusCode {
    use knockport_core::commands::contact::{valid_email, valid_message};

    if request.name.trim().is_empty()
        || !valid_email(&request.email)
        || !valid_message(&request.message)
    {
        return StatusCode::BAD_REQUEST;
    }

    let ip = "127.0.0.1".to_string();
    let print = fingerprint(&ip, &state.salt);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock before the epoch")
        .as_secs();

    if !state.limiter.check(&print, now) {
        return StatusCode::TOO_MANY_REQUESTS;
    }

    let payload = ContactPayload {
        name: request.name,
        email: request.email,
        message: request.message,
        journal: request.journal,
        egg_found: request.egg_found,
    };

    match state.sink.send(&payload, &print).await {
        Ok(()) => StatusCode::ACCEPTED,
        Err(error) => {
            tracing::error!(?error, "contact delivery failed");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}
