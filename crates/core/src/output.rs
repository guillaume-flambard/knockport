use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Style {
    Plain,
    Dim,
    Bold,
    Accent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Span {
    pub text: String,
    pub style: Style,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct Line {
    pub spans: Vec<Span>,
}

impl Line {
    pub fn plain(text: &str) -> Self {
        Self::styled(text, Style::Plain)
    }

    pub fn styled(text: &str, style: Style) -> Self {
        Line {
            spans: vec![Span {
                text: text.to_string(),
                style,
            }],
        }
    }

    pub fn blank() -> Self {
        Line::default()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum Effect {
    Clear,
    Quit,
    OpenUrl(String),
    SubmitContact(crate::session::ContactPayload),
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct Output {
    pub lines: Vec<Line>,
    pub effect: Option<Effect>,
    /// Porté explicitement, jamais déduit du texte rendu. Le journal a besoin
    /// de savoir si le visiteur s'est cogné, et renifler la sortie pour le
    /// deviner casserait à la première reformulation d'un message.
    pub failed: bool,
}

impl Output {
    pub fn empty() -> Self {
        Output::default()
    }

    pub fn text(text: &str) -> Self {
        Output {
            lines: vec![Line::plain(text)],
            ..Output::default()
        }
    }

    pub fn failure(text: &str) -> Self {
        Output {
            lines: vec![Line::styled(&format!("knockport: {text}"), Style::Accent)],
            effect: None,
            failed: true,
        }
    }

    /// Nommée `from_texts` et pas `lines`, pour ne pas entrer en collision
    /// visuelle avec le champ `lines` à la lecture.
    pub fn from_texts(texts: &[&str]) -> Self {
        Output {
            lines: texts.iter().map(|t| Line::plain(t)).collect(),
            ..Output::default()
        }
    }

    pub fn with_effect(mut self, effect: Effect) -> Self {
        self.effect = Some(effect);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_builds_one_plain_line() {
        let out = Output::text("hello");
        assert_eq!(out.lines.len(), 1);
        assert_eq!(out.lines[0].spans[0].text, "hello");
        assert_eq!(out.lines[0].spans[0].style, Style::Plain);
        assert!(out.effect.is_none());
        assert!(!out.failed);
    }

    #[test]
    fn failure_prefixes_the_program_name_and_marks_the_output() {
        let out = Output::failure("cd: nowhere: no such directory");
        assert!(out.failed);
        assert_eq!(
            out.lines[0].spans[0].text,
            "knockport: cd: nowhere: no such directory"
        );
        assert_eq!(out.lines[0].spans[0].style, Style::Accent);
    }

    #[test]
    fn from_texts_builds_one_line_each() {
        let out = Output::from_texts(&["a", "b", "c"]);
        assert_eq!(out.lines.len(), 3);
        assert_eq!(out.lines[2].spans[0].text, "c");
    }

    #[test]
    fn styled_line_keeps_its_style() {
        let line = Line::styled("dim", Style::Dim);
        assert_eq!(line.spans[0].style, Style::Dim);
    }
}
