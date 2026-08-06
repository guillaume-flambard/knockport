use std::sync::{Arc, Mutex};

use axum::body::Body;
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
