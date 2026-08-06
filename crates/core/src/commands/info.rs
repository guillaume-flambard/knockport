use crate::content::Content;
use crate::output::{Line, Output, Span, Style};
use crate::session::Session;

const COMMANDS: &[(&str, &str)] = &[
    ("ls", "list what is here, -a shows everything"),
    ("cd", "move around, .. goes up"),
    ("pwd", "where you are right now"),
    ("cat", "read a file"),
    ("whoami", "the short version"),
    ("stack", "what I build with"),
    ("cv", "the PDF, for your ATS"),
    ("contact", "leave me a message right here"),
    ("book", "put something in the calendar"),
    ("history", "what you have typed"),
    ("clear", "wipe the screen"),
    ("exit", "close the session"),
];

pub fn help() -> Output {
    let mut lines = vec![Line::styled("commands", Style::Bold), Line::blank()];
    for (name, description) in COMMANDS {
        lines.push(Line {
            spans: vec![
                Span {
                    text: format!("  {name:<9}"),
                    style: Style::Accent,
                },
                Span {
                    text: description.to_string(),
                    style: Style::Dim,
                },
            ],
        });
    }
    Output {
        lines,
        ..Output::default()
    }
}

pub fn history(session: &Session) -> Output {
    Output {
        lines: session
            .history
            .iter()
            .enumerate()
            .map(|(i, entry)| Line::plain(&format!("{:>3}  {entry}", i + 1)))
            .collect(),
        ..Output::default()
    }
}

pub fn show(content: &Content, name: &str) -> Output {
    match content.resolve_file(&[name.to_string()]) {
        Some(file) => Output {
            lines: file.body.lines().map(Line::plain).collect(),
            ..Output::default()
        },
        None => Output::failure(&format!("{name}: content is missing")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Session;

    fn flatten(out: &Output) -> String {
        out.lines
            .iter()
            .map(|l| l.spans.iter().map(|s| s.text.as_str()).collect::<String>())
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn help_lists_the_main_commands() {
        let rendered = flatten(&help());
        for name in [
            "ls", "cd", "pwd", "cat", "whoami", "stack", "cv", "contact", "book", "exit",
        ] {
            assert!(rendered.contains(name), "help is missing {name}");
        }
    }

    #[test]
    fn help_never_mentions_the_egg() {
        assert!(!flatten(&help()).contains("knock"));
    }

    #[test]
    fn history_numbers_the_lines() {
        let mut session = Session::new();
        session.history.push("ls".to_string());
        session.history.push("whoami".to_string());
        let rendered = flatten(&history(&session));
        assert!(rendered.contains("1  ls"));
        assert!(rendered.contains("2  whoami"));
    }
}
