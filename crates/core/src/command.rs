use crate::content::Content;
use crate::output::{Line, Output, Style};
use crate::session::{Event, Mode, Session};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cmd {
    pub name: String,
    pub args: Vec<String>,
}

pub fn parse(input: &str) -> Option<Cmd> {
    let mut words = input.split_whitespace();
    let name = words.next()?.to_string();
    Some(Cmd {
        name,
        args: words.map(str::to_string).collect(),
    })
}

pub fn execute(session: &mut Session, content: &Content, input: &str, at_ms: u64) -> Output {
    if matches!(session.mode, Mode::Contact { .. }) {
        let output = crate::commands::contact::step(session, input);
        session.journal.push(Event {
            at_ms,
            input: "<contact>".to_string(),
            ok: true,
        });
        return output;
    }

    let Some(cmd) = parse(input) else {
        return Output::empty();
    };

    session.history.push(input.trim().to_string());

    let output = dispatch(session, content, &cmd);
    session.journal.push(Event {
        at_ms,
        input: input.trim().to_string(),
        ok: !output.failed,
    });
    output
}

fn dispatch(session: &mut Session, content: &Content, cmd: &Cmd) -> Output {
    use crate::commands::{fs, info};
    use crate::output::Effect;
    match cmd.name.as_str() {
        "ls" => fs::ls(session, content, &cmd.args),
        "cd" => fs::cd(session, content, &cmd.args),
        "pwd" => fs::pwd(session),
        "cat" => fs::cat(session, content, &cmd.args),
        "whoami" => info::show(content, "whoami"),
        "stack" => info::show(content, "stack"),
        "help" => info::help(),
        "history" => info::history(session),
        "clear" => Output::empty().with_effect(Effect::Clear),
        "exit" | "quit" | "logout" => Output::empty().with_effect(Effect::Quit),
        _ => unknown(&cmd.name),
    }
}

fn unknown(name: &str) -> Output {
    let mut output = Output::failure(&format!("{name}: no such command"));
    output.lines.push(Line::styled("try help", Style::Dim));
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_bare_command() {
        let cmd = parse("ls").expect("must parse");
        assert_eq!(cmd.name, "ls");
        assert!(cmd.args.is_empty());
    }

    #[test]
    fn parses_arguments_and_collapses_whitespace() {
        let cmd = parse("  cat   projects/knockport  ").expect("must parse");
        assert_eq!(cmd.name, "cat");
        assert_eq!(cmd.args, vec!["projects/knockport"]);
    }

    #[test]
    fn empty_input_is_not_a_command() {
        assert!(parse("   ").is_none());
    }

    #[test]
    fn execute_records_the_input_in_the_journal() {
        let content = Content::load();
        let mut session = Session::new();
        execute(&mut session, &content, "whoami", 1_500);
        assert_eq!(session.journal.len(), 1);
        assert_eq!(session.journal[0].input, "whoami");
        assert_eq!(session.journal[0].at_ms, 1_500);
    }

    #[test]
    fn empty_input_produces_nothing_and_is_not_journalled() {
        let content = Content::load();
        let mut session = Session::new();
        let out = execute(&mut session, &content, "", 10);
        assert!(out.lines.is_empty());
        assert!(session.journal.is_empty());
    }

    #[test]
    fn unknown_command_suggests_help_and_is_marked_failed() {
        let content = Content::load();
        let mut session = Session::new();
        let out = execute(&mut session, &content, "sudo rm -rf /", 20);
        let rendered = flatten(&out);
        assert!(rendered.contains("help"), "got: {rendered}");
        assert!(!session.journal[0].ok);
    }

    fn flatten(out: &Output) -> String {
        out.lines
            .iter()
            .map(|l| l.spans.iter().map(|s| s.text.as_str()).collect::<String>())
            .collect::<Vec<_>>()
            .join("\n")
    }
}
