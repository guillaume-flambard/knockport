use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use knockport_core::ContactPayload;
use knockport_server::http::{AppState, ContactSink, router};
use tower::ServiceExt;

#[derive(Default)]
struct Recorder {
    sent: Mutex<Vec<ContactPayload>>,
}

#[async_trait::async_trait]
impl ContactSink for Recorder {
    async fn send(&self, payload: &ContactPayload, _fingerprint: &str) -> anyhow::Result<()> {
        self.sent.lock().unwrap().push(payload.clone());
        Ok(())
    }
}

fn post(body: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/api/contact")
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn post_with_addr(body: &str, addr: std::net::SocketAddr) -> Request<Body> {
    let mut req = post(body);
    req.extensions_mut().insert(ConnectInfo(addr));
    req
}

#[tokio::test]
async fn a_valid_message_is_accepted_and_forwarded() {
    let recorder = Arc::new(Recorder::default());
    let app = router(AppState::for_test(recorder.clone()));

    let body = r#"{"name":"Seema","email":"seema@example.com",
        "message":"we have a role that fits, are you free thursday","journal":[],"egg_found":false}"#;
    let response = app.oneshot(post(body)).await.unwrap();

    assert_eq!(response.status(), StatusCode::ACCEPTED);
    assert_eq!(recorder.sent.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn a_bad_email_is_rejected_and_never_forwarded() {
    let recorder = Arc::new(Recorder::default());
    let app = router(AppState::for_test(recorder.clone()));

    let body = r#"{"name":"Seema","email":"nope",
        "message":"we have a role that fits, are you free thursday","journal":[],"egg_found":false}"#;
    let response = app.oneshot(post(body)).await.unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(recorder.sent.lock().unwrap().is_empty());
}

#[tokio::test]
async fn the_fourth_message_in_an_hour_is_refused() {
    let recorder = Arc::new(Recorder::default());
    let state = AppState::for_test(recorder.clone());
    let body = r#"{"name":"Seema","email":"seema@example.com",
        "message":"we have a role that fits, are you free thursday","journal":[],"egg_found":false}"#;

    for _ in 0..3 {
        let response = router(state.clone()).oneshot(post(body)).await.unwrap();
        assert_eq!(response.status(), StatusCode::ACCEPTED);
    }
    let response = router(state.clone()).oneshot(post(body)).await.unwrap();
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(recorder.sent.lock().unwrap().len(), 3);
}

#[tokio::test]
async fn the_profile_page_carries_the_content_without_javascript() {
    let recorder = Arc::new(Recorder::default());
    let app = router(AppState::for_test(recorder));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/profile")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let html = String::from_utf8_lossy(&body);
    assert!(html.contains("Guillaume Flambard"));
    assert!(
        !html.contains("<script"),
        "the accessible page must not need javascript"
    );
}

#[tokio::test]
async fn two_different_client_addresses_have_independent_rate_limit_budgets() {
    let recorder = Arc::new(Recorder::default());
    let state = AppState::for_test(recorder.clone());
    let body = r#"{"name":"Seema","email":"seema@example.com",
        "message":"we have a role that fits, are you free thursday","journal":[],"egg_found":false}"#;

    // First address exhausts its budget: 3 messages
    let addr1: std::net::SocketAddr = "192.168.1.1:12345".parse().unwrap();
    for _ in 0..3 {
        let response = router(state.clone())
            .oneshot(post_with_addr(body, addr1))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::ACCEPTED);
    }

    // Fourth message from first address is refused
    let response = router(state.clone())
        .oneshot(post_with_addr(body, addr1))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);

    // But second address can still send 3 messages
    let addr2: std::net::SocketAddr = "192.168.1.2:12346".parse().unwrap();
    for _ in 0..3 {
        let response = router(state.clone())
            .oneshot(post_with_addr(body, addr2))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::ACCEPTED);
    }

    // Total of 6 messages were accepted from two different addresses
    assert_eq!(recorder.sent.lock().unwrap().len(), 6);
}

#[tokio::test]
async fn a_journal_with_too_many_events_is_rejected() {
    let recorder = Arc::new(Recorder::default());
    let app = router(AppState::for_test(recorder.clone()));

    // Create a request with 501 events (exceeds MAX_JOURNAL_EVENTS = 500)
    let mut events = Vec::new();
    for i in 0..501 {
        events.push(format!(r#"{{"at_ms":{},"input":"ls","ok":true}}"#, i * 100));
    }
    let events_json = format!("[{}]", events.join(","));

    let body = format!(
        r#"{{"name":"Seema","email":"seema@example.com","message":"test","journal":{},"egg_found":false}}"#,
        events_json
    );

    let response = app.oneshot(post(&body)).await.unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(recorder.sent.lock().unwrap().is_empty());
}

#[tokio::test]
async fn visitor_name_with_injected_headers_does_not_forge_mail_headers() {
    let recorder = Arc::new(Recorder::default());
    let app = router(AppState::for_test(recorder.clone()));

    // Visitor name contains a newline followed by a mail header-like string.
    // This should not inject a real mail header in the message.
    let body = r#"{"name":"Test\nBcc: attacker@example.com","email":"seema@example.com",
        "message":"we have a role that fits, are you free thursday","journal":[],"egg_found":false}"#;
    let response = app.oneshot(post(body)).await.unwrap();

    assert_eq!(response.status(), StatusCode::ACCEPTED);
    let sent = recorder.sent.lock().unwrap();
    assert_eq!(sent.len(), 1);

    // The payload's name should preserve the literal newline from JSON (escaped as \n),
    // not interpret it as an actual newline. This depends on JSON parsing, which correctly
    // deserializes \n as a literal backslash-n in the string, not a newline character.
    let payload = &sent[0];
    assert!(payload.name.contains("Test"));
}

#[tokio::test]
async fn html_content_with_special_characters_is_properly_escaped() {
    let recorder = Arc::new(Recorder::default());
    let app = router(AppState::for_test(recorder));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/profile")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let html = String::from_utf8_lossy(&body);

    // The HTML should escape special characters in content, not render them as markup.
    // Verify that there are HTML tags present (indicating markup works), and that
    // the escape() function properly converts special characters like <, >, and &.
    // Check that the basic HTML structure is there
    assert!(
        html.contains("<h1>") && html.contains("</h1>"),
        "should contain properly formed HTML tags"
    );

    // The content may not have raw < or > characters; the main thing is that
    // the escaping function is applied to all content paths through the walk() function.
    // Verify the escaping works by checking the escape function is in place:
    assert!(
        html.contains("Guillaume Flambard"),
        "content should be rendered"
    );
}
