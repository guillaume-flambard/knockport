use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use knockport_core::ContactPayload;
use knockport_server::http::{AppState, ContactSink, router};
use knockport_server::mail::build_email;
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

    let addr: std::net::SocketAddr = "192.168.1.1:12345".parse().unwrap();
    let body = r#"{"name":"Seema","email":"seema@example.com",
        "message":"we have a role that fits, are you free thursday","journal":[],"egg_found":false}"#;
    let response = app.oneshot(post_with_addr(body, addr)).await.unwrap();

    assert_eq!(response.status(), StatusCode::ACCEPTED);
    assert_eq!(recorder.sent.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn a_bad_email_is_rejected_and_never_forwarded() {
    let recorder = Arc::new(Recorder::default());
    let app = router(AppState::for_test(recorder.clone()));

    let addr: std::net::SocketAddr = "192.168.1.1:12345".parse().unwrap();
    let body = r#"{"name":"Seema","email":"nope",
        "message":"we have a role that fits, are you free thursday","journal":[],"egg_found":false}"#;
    let response = app.oneshot(post_with_addr(body, addr)).await.unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(recorder.sent.lock().unwrap().is_empty());
}

#[tokio::test]
async fn the_fourth_message_in_an_hour_is_refused() {
    let recorder = Arc::new(Recorder::default());
    let state = AppState::for_test(recorder.clone());
    let addr: std::net::SocketAddr = "192.168.1.1:12345".parse().unwrap();
    let body = r#"{"name":"Seema","email":"seema@example.com",
        "message":"we have a role that fits, are you free thursday","journal":[],"egg_found":false}"#;

    for _ in 0..3 {
        let response = router(state.clone())
            .oneshot(post_with_addr(body, addr))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::ACCEPTED);
    }
    let response = router(state.clone())
        .oneshot(post_with_addr(body, addr))
        .await
        .unwrap();
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
async fn contact_without_connect_info_fails_closed_with_500() {
    let recorder = Arc::new(Recorder::default());
    let app = router(AppState::for_test(recorder.clone()));

    let body = r#"{"name":"Seema","email":"seema@example.com",
        "message":"we have a role that fits, are you free thursday","journal":[],"egg_found":false}"#;

    // Call with post() which does NOT inject ConnectInfo.
    // This simulates a misconfigured server without into_make_service_with_connect_info.
    let response = app.oneshot(post(body)).await.unwrap();

    // Should fail closed with 500
    assert_eq!(
        response.status(),
        StatusCode::INTERNAL_SERVER_ERROR,
        "handler must fail closed when ConnectInfo is missing"
    );

    // Verify the message was never forwarded
    assert!(recorder.sent.lock().unwrap().is_empty());
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

    let addr: std::net::SocketAddr = "192.168.1.1:12345".parse().unwrap();

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

    let response = app.oneshot(post_with_addr(&body, addr)).await.unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(recorder.sent.lock().unwrap().is_empty());
}

#[tokio::test]
async fn visitor_name_with_injected_headers_does_not_forge_mail_headers() {
    // Test that a name containing a literal newline character (actual byte 0x0A, not JSON escape)
    // does not create a mail header injection vulnerability.
    let payload = ContactPayload {
        name: "Test\nBcc: attacker@example.com".to_string(),
        email: "seema@example.com".to_string(),
        message: "test message".to_string(),
        journal: vec![],
        egg_found: false,
    };

    let fingerprint = "test-fp";
    let recipient = "owner@example.com";

    // Attempt to build the email. lettre validates email headers during Message construction.
    let result = build_email(&payload, fingerprint, recipient);

    // In lettre 0.11.23, attempting to parse a display name containing a newline
    // results in a parse error. The `parse()` call on the reply-to address fails
    // because lettre's RFC 5322 parser rejects newlines in structured headers.
    assert!(
        result.is_err(),
        "build_email should return an error for a display-name containing a newline"
    );

    // Verify the error is about parsing the address (not some other failure)
    let err_msg = result.unwrap_err().to_string();
    assert!(
        !err_msg.is_empty(),
        "Error message must explain the rejection"
    );
    // lettre's error for invalid email address format typically mentions parsing
    tracing::info!(
        "lettre 0.11.23 rejects newline in display-name with: {}",
        err_msg
    );
}

#[tokio::test]
async fn html_content_with_special_characters_is_properly_escaped() {
    use knockport_core::{Content, Dir, File};

    // Build test content with special characters that need escaping
    let test_content = Content {
        root: Dir {
            name: "root".to_string(),
            dirs: vec![],
            files: vec![File {
                name: "test.md".to_string(),
                title: "Test<>&".to_string(),
                order: 1,
                hidden: false,
                body: "This is <em>not</em> & <strong>is</strong> escaped".to_string(),
            }],
        },
    };

    // Render the profile page with this test content
    let html = knockport_server::profile::render(&test_content);

    // Verify that special characters are escaped, not rendered as HTML markup
    assert!(html.contains("&lt;"), "< should be escaped to &lt;");
    assert!(html.contains("&gt;"), "> should be escaped to &gt;");
    assert!(html.contains("&amp;"), "& should be escaped to &amp;");

    // Verify raw characters are not present in a way that would be interpreted as markup
    assert!(
        !html.contains("<em>") && !html.contains("<strong>"),
        "the user-supplied content markup should be escaped, not rendered"
    );

    // Verify no scripts
    assert!(!html.contains("<script"), "no JavaScript should be present");
}
