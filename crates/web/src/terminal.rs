use dioxus::prelude::*;
use knockport_core::{Content, Effect, Line, Output, Session, complete, execute};

#[component]
pub fn Terminal() -> Element {
    let content = use_signal(Content::load);
    let mut session = use_signal(Session::new);
    let mut printed = use_signal(Vec::<Line>::new);
    let mut input = use_signal(String::new);

    let submit = move |_| {
        let typed = input();
        let prompt = session.read().prompt();
        printed
            .write()
            .push(Line::plain(&format!("{prompt}{typed}")));

        let at_ms = now_ms();
        let output: Output = execute(&mut session.write(), &content.read(), &typed, at_ms);
        printed.write().extend(output.lines.clone());

        match output.effect {
            Some(Effect::Clear) => printed.write().clear(),
            Some(Effect::OpenUrl(marker)) => open(&marker),
            Some(Effect::SubmitContact(payload)) => post_contact(payload),
            Some(Effect::Quit) => printed
                .write()
                .push(Line::plain("Session closed. Reload to start again.")),
            None => {}
        }
        input.set(String::new());
    };

    rsx! {
        document::Link { rel: "stylesheet", href: asset!("/assets/main.css") }
        main { class: "terminal",
            a { class: "skip", href: "/profile", "Plain, accessible version of this page" }
            pre { class: "scrollback", "aria-live": "polite", "aria-atomic": "false",
                for line in printed.read().iter() {
                    for s in line.spans.iter() {
                        {render_span(s)}
                    }
                    "\n"
                }
            }
            form { class: "prompt", onsubmit: submit,
                label { r#for: "cmd", class: "visually-hidden", "Type a command" }
                span { class: "sigil", "{session.read().prompt()}" }
                input {
                    id: "cmd",
                    autofocus: true,
                    autocomplete: "off",
                    value: "{input}",
                    oninput: move |event| input.set(event.value()),
                    onkeydown: move |event| {
                        if event.key() == Key::Tab {
                            event.prevent_default();
                            let found = complete(&session.read(), &content.read(), &input());
                            if let [only] = found.as_slice() {
                                input.set(only.clone());
                            }
                        }
                    },
                }
            }
        }
    }
}

fn render_span(s: &knockport_core::Span) -> Element {
    match s.style {
        knockport_core::Style::Plain => rsx!(span { "{s.text}" }),
        knockport_core::Style::Dim => rsx!(span { class: "dim", "{s.text}" }),
        knockport_core::Style::Bold => rsx!(span { class: "bold", "{s.text}" }),
        knockport_core::Style::Accent => rsx!(span { class: "accent", "{s.text}" }),
    }
}

fn now_ms() -> u64 {
    web_sys::window()
        .and_then(|w| w.performance())
        .map(|p| p.now() as u64)
        .unwrap_or(0)
}

fn open(marker: &str) {
    // The core does not know about URLs; it emits a marker. The server
    // serves them on fixed paths, so the web facade has no configuration.
    let url = match marker {
        knockport_core::commands::contact::CV_URL => "/cv.pdf",
        knockport_core::commands::contact::BOOK_URL => "/book",
        other => other,
    };
    if let Some(window) = web_sys::window() {
        let _ = window.open_with_url_and_target(url, "_blank");
    }
}

fn post_contact(payload: knockport_core::ContactPayload) {
    let Ok(body) = serde_json::to_string(&payload) else {
        return;
    };
    let Some(window) = web_sys::window() else {
        return;
    };

    let headers = web_sys::Headers::new().expect("headers");
    let _ = headers.append("content-type", "application/json");

    let init = web_sys::RequestInit::new();
    init.set_method("POST");
    init.set_headers(&headers);
    init.set_body(&wasm_bindgen::JsValue::from_str(&body));

    let _ = window.fetch_with_str_and_init("/api/contact", &init);
}
