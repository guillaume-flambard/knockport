use knockport_core::{Content, Session, execute};

fn render(input: &str) -> String {
    let content = Content::load();
    let mut session = Session::new();
    let out = execute(&mut session, &content, input, 0);
    out.lines
        .iter()
        .map(|l| l.spans.iter().map(|s| s.text.as_str()).collect::<String>())
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn snapshot_help() {
    insta::assert_snapshot!(render("help"));
}

#[test]
fn snapshot_ls_root() {
    insta::assert_snapshot!(render("ls"));
}

#[test]
fn snapshot_unknown_command() {
    insta::assert_snapshot!(render("deploy to prod"));
}
