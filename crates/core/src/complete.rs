use crate::content::Content;
use crate::session::Session;

const NAMES: &[&str] = &[
    "ls", "cd", "cat", "pwd", "whoami", "stack", "cv", "contact", "book", "history", "help",
    "clear", "exit",
];

pub fn complete(session: &Session, content: &Content, partial: &str) -> Vec<String> {
    match partial.split_once(' ') {
        None => NAMES
            .iter()
            .filter(|name| name.starts_with(partial))
            .map(|name| name.to_string())
            .collect(),
        Some((command, rest)) => {
            let prefix = rest.trim_start();
            let Some(dir) = content.resolve_dir(&session.cwd) else {
                return Vec::new();
            };
            let mut found: Vec<String> = dir
                .dirs
                .iter()
                .map(|d| d.name.clone())
                .chain(
                    dir.files
                        .iter()
                        .filter(|f| !f.hidden)
                        .map(|f| f.name.clone()),
                )
                .filter(|name| name.starts_with(prefix) && !prefix.is_empty())
                .map(|name| format!("{command} {name}"))
                .collect();
            found.sort();
            found
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::Content;
    use crate::session::Session;

    #[test]
    fn completes_a_command_name() {
        let content = Content::load();
        let session = Session::new();
        assert_eq!(
            complete(&session, &content, "wh"),
            vec!["whoami".to_string()]
        );
    }

    #[test]
    fn completes_a_path_argument() {
        let content = Content::load();
        let session = Session::new();
        let found = complete(&session, &content, "cd pro");
        assert!(found.contains(&"cd projects".to_string()), "got: {found:?}");
    }

    #[test]
    fn never_completes_the_hidden_file() {
        let content = Content::load();
        let session = Session::new();
        let found = complete(&session, &content, "cat .kn");
        assert!(
            found.is_empty(),
            "the egg must stay found by hand, got: {found:?}"
        );
    }

    #[test]
    fn no_match_returns_nothing() {
        let content = Content::load();
        let session = Session::new();
        assert!(complete(&session, &content, "xyz").is_empty());
    }
}
