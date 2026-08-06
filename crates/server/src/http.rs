use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{ConnectInfo, State};
use axum::http::StatusCode;
use axum::response::Html;
use axum::routing::{get, post};
use axum::{Json, Router};
use knockport_core::{ContactPayload, Content};
use serde::Deserialize;

use crate::journal::{Journal, fingerprint};
use crate::ratelimit::RateLimiter;

// Maximum number of events in a journal. A visitor typing commands for
// 10 minutes at normal speed produces tens, not thousands. This limit
// protects against memory exhaustion and mail delivery issues.
const MAX_JOURNAL_EVENTS: usize = 500;

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
    use axum::extract::DefaultBodyLimit;
    use axum::middleware;
    use std::net::SocketAddr;

    // Middleware to ensure ConnectInfo is always available.
    // In production with into_make_service_with_connect_info, this is already populated.
    // In tests, this provides a sensible default so the handler can extract it cleanly.
    async fn ensure_connect_info(
        mut req: axum::extract::Request,
        next: middleware::Next,
    ) -> axum::response::Response {
        if req.extensions().get::<ConnectInfo<SocketAddr>>().is_none() {
            // Provide a default address for tests or cases where ConnectInfo isn't populated
            let default_addr: SocketAddr = "127.0.0.1:0".parse().unwrap();
            req.extensions_mut().insert(ConnectInfo(default_addr));
        }
        next.run(req).await
    }

    Router::new()
        .route("/api/contact", post(contact))
        .route("/profile", get(profile))
        .with_state(state)
        // Message capped at 4000 characters, plus metadata. 64KB is generous and protects
        // the JSON parser from unbounded allocations.
        .layer(DefaultBodyLimit::max(64 * 1024))
        .layer(middleware::from_fn(ensure_connect_info))
}

async fn profile(State(state): State<AppState>) -> Html<String> {
    Html(crate::profile::render(&state.content))
}

async fn contact(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    Json(request): Json<ContactRequest>,
) -> StatusCode {
    use knockport_core::commands::contact::{valid_email, valid_message};

    if request.name.trim().is_empty()
        || !valid_email(&request.email)
        || !valid_message(&request.message)
    {
        return StatusCode::BAD_REQUEST;
    }

    // Reject journals that exceed the practical limit for a real session.
    // Client-supplied journal is unbounded in the request struct, so validate here.
    if request.journal.len() > MAX_JOURNAL_EVENTS {
        return StatusCode::BAD_REQUEST;
    }

    let ip = addr.ip().to_string();
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
