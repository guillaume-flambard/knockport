mod terminal;

use dioxus::prelude::*;

fn main() {
    dioxus::LaunchBuilder::new().launch(app);
}

#[component]
fn app() -> Element {
    rsx! {
        terminal::Terminal {}
    }
}
