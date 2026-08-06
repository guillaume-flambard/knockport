use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{ConnectInfo, State};
use axum::http::StatusCode;
use axum::middleware;
use axum::response::{Html, Redirect};
use axum::routing::{get, post};
use axum::{Json, Router};
use knockport_core::{ContactPayload, Content};
use serde::Deserialize;
use tower_http::services::{ServeDir, ServeFile};

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
    pub web_dir: std::path::PathBuf,
    pub cv_file: std::path::PathBuf,
    pub book_url: String,
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
            web_dir: std::env::temp_dir(),
            cv_file: std::env::temp_dir().join("cv.pdf"),
            book_url: "https://example.com/book".to_string(),
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

    // Middleware that ensures ConnectInfo is present for the contact endpoint.
    // Fails closed: returns 500 if ConnectInfo is missing (server misconfiguration).
    async fn require_connect_info(
        req: axum::extract::Request,
        next: middleware::Next,
    ) -> Result<axum::response::Response, StatusCode> {
        if req.uri().path() == "/api/contact"
            && req
                .extensions()
                .get::<ConnectInfo<std::net::SocketAddr>>()
                .is_none()
        {
            tracing::error!(
                "contact handler called without ConnectInfo; \
             server must be started with into_make_service_with_connect_info::<SocketAddr>()"
            );
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        Ok(next.run(req).await)
    }

    let web_dir = state.web_dir.clone();
    let cv_file = state.cv_file.clone();
    let book_url = state.book_url.clone();

    Router::new()
        .route("/api/contact", post(contact))
        .route("/profile", get(profile))
        .route(
            "/book",
            get(move || async move { Redirect::temporary(&book_url) }),
        )
        .route_service("/cv.pdf", ServeFile::new(cv_file))
        .fallback_service(ServeDir::new(web_dir).append_index_html_on_directories(true))
        .with_state(state)
        // Message capped at 4000 characters, plus metadata. 64KB is generous and protects
        // the JSON parser from unbounded allocations.
        .layer(DefaultBodyLimit::max(64 * 1024))
        .layer(axum::middleware::from_fn(require_connect_info))
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
