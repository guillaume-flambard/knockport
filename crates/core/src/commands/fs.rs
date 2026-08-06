use crate::content::Content;
use crate::output::{Line, Output, Style};
use crate::session::Session;

pub fn resolve(session: &Session, arg: &str) -> Vec<String> {
    let mut path = if arg.starts_with('/') {
        Vec::new()
    } else {
        session.cwd.clone()
    };
    for segment in arg.trim_start_matches('/').split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                path.pop();
            }
            other => path.push(other.to_string()),
        }
    }
    path
}

pub fn pwd(session: &Session) -> Output {
    Output::text(&format!("~/{}", session.cwd.join("/")))
}

pub fn ls(session: &Session, content: &Content, args: &[String]) -> Output {
    let show_all = args.iter().any(|a| a == "-a");
    let target: Vec<String> = match args.iter().find(|a| !a.starts_with('-')) {
        Some(arg) => resolve(session, arg),
        None => session.cwd.clone(),
    };

    let Some(dir) = content.resolve_dir(&target) else {
        return Output::failure(&format!("ls: {}: no such directory", target.join("/")));
    };

    let mut lines: Vec<Line> = dir
        .dirs
        .iter()
        .map(|d| Line::styled(&format!("{}/", d.name), Style::Accent))
        .collect();

    for file in &dir.files {
        if file.hidden && !show_all {
            continue;
        }
        lines.push(Line {
            spans: vec![
                crate::output::Span {
                    text: file.display_name(),
                    style: Style::Plain,
                },
                crate::output::Span {
                    text: format!("   {}", file.title),
                    style: Style::Dim,
                },
            ],
        });
    }

    if lines.is_empty() {
        return Output::text("(empty)");
    }
    Output {
        lines,
        ..Output::default()
    }
}

pub fn cd(session: &mut Session, content: &Content, args: &[String]) -> Output {
    let Some(arg) = args.first() else {
        session.cwd.clear();
        return Output::empty();
    };
    let target = resolve(session, arg);
    if content.resolve_dir(&target).is_none() {
        return Output::failure(&format!("cd: {arg}: no such directory"));
    }
    session.cwd = target;
    Output::empty()
}

pub fn cat(session: &mut Session, content: &Content, args: &[String]) -> Output {
    let Some(arg) = args.first() else {
        return Output::failure("cat: which file? try ls");
    };
    let path = resolve(session, arg);

    if content.resolve_dir(&path).is_some() {
        return Output::failure(&format!("cat: {arg}: is a directory"));
    }

    let Some(file) = content.resolve_file(&path) else {
        return Output::failure(&format!("cat: {arg}: no such file"));
    };

    if file.hidden {
        session.egg_found = true;
    }

    Output {
        lines: file.body.lines().map(Line::plain).collect(),
        ..Output::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::Content;
    use crate::session::Session;

    fn flatten(out: &Output) -> String {
        out.lines
            .iter()
            .map(|l| l.spans.iter().map(|s| s.text.as_str()).collect::<String>())
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn ls_lists_directories_then_files() {
        let content = Content::load();
        let session = Session::new();
        let rendered = flatten(&ls(&session, &content, &[]));
        assert!(rendered.contains("projects/"));
        assert!(rendered.contains("whoami"));
    }

    #[test]
    fn ls_hides_the_egg_by_default() {
        let content = Content::load();
        let session = Session::new();
        let rendered = flatten(&ls(&session, &content, &[]));
        assert!(!rendered.contains(".knock"));
    }

    #[test]
    fn ls_dash_a_reveals_the_egg() {
        let content = Content::load();
        let session = Session::new();
        let rendered = flatten(&ls(&session, &content, &["-a".to_string()]));
        assert!(rendered.contains(".knock"));
    }

    #[test]
    fn cd_moves_and_pwd_reports() {
        let content = Content::load();
        let mut session = Session::new();
        cd(&mut session, &content, &["projects".to_string()]);
        assert_eq!(session.cwd, vec!["projects".to_string()]);
        assert!(flatten(&pwd(&session)).contains("~/projects"));
    }

    #[test]
    fn cd_dot_dot_goes_up_and_stops_at_the_root() {
        let content = Content::load();
        let mut session = Session::new();
        cd(&mut session, &content, &["projects".to_string()]);
        cd(&mut session, &content, &["..".to_string()]);
        assert!(session.cwd.is_empty());
        cd(&mut session, &content, &["..".to_string()]);
        assert!(session.cwd.is_empty(), "the root has no parent");
    }

    #[test]
    fn cd_into_nothing_explains_itself() {
        let content = Content::load();
        let mut session = Session::new();
        let rendered = flatten(&cd(&mut session, &content, &["nowhere".to_string()]));
        assert!(rendered.contains("no such directory"), "got: {rendered}");
        assert!(session.cwd.is_empty());
    }

    #[test]
    fn cat_prints_the_body() {
        let content = Content::load();
        let mut session = Session::new();
        let rendered = flatten(&cat(&mut session, &content, &["whoami".to_string()]));
        assert!(rendered.contains("Guillaume Flambard"));
    }

    #[test]
    fn cat_on_a_directory_says_so() {
        let content = Content::load();
        let mut session = Session::new();
        let rendered = flatten(&cat(&mut session, &content, &["projects".to_string()]));
        assert!(rendered.contains("is a directory"), "got: {rendered}");
    }

    #[test]
    fn reading_the_egg_marks_the_session() {
        let content = Content::load();
        let mut session = Session::new();
        assert!(!session.egg_found);
        cat(&mut session, &content, &[".knock".to_string()]);
        assert!(session.egg_found);
    }

    #[test]
    fn a_normal_file_does_not_mark_the_session() {
        let content = Content::load();
        let mut session = Session::new();
        cat(&mut session, &content, &["whoami".to_string()]);
        assert!(!session.egg_found);
    }
}
