use knockport_core::{Output, Style};

#[allow(dead_code)]
pub const CLEAR: &[u8] = b"\x1b[2J\x1b[H";

#[allow(dead_code)]
fn code(style: Style) -> &'static str {
    match style {
        Style::Plain => "",
        Style::Dim => "\x1b[2m",
        Style::Bold => "\x1b[1m",
        Style::Accent => "\x1b[36m",
    }
}

#[allow(dead_code)]
pub fn render(output: &Output) -> Vec<u8> {
    let mut bytes = Vec::new();
    for line in &output.lines {
        for span in &line.spans {
            let prefix = code(span.style);
            bytes.extend_from_slice(prefix.as_bytes());
            bytes.extend_from_slice(span.text.as_bytes());
            if !prefix.is_empty() {
                bytes.extend_from_slice(b"\x1b[0m");
            }
        }
        bytes.extend_from_slice(b"\r\n");
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    use knockport_core::{Line, Output, Span, Style};

    #[test]
    fn plain_text_gets_no_escape_codes() {
        let bytes = render(&Output::text("hello"));
        assert_eq!(String::from_utf8_lossy(&bytes), "hello\r\n");
    }

    #[test]
    fn styles_are_wrapped_and_reset() {
        let out = Output {
            lines: vec![Line::styled("dim", Style::Dim)],
            ..Output::default()
        };
        assert_eq!(
            String::from_utf8_lossy(&render(&out)),
            "\x1b[2mdim\x1b[0m\r\n"
        );
    }

    #[test]
    fn lines_end_with_crlf_because_the_terminal_is_raw() {
        let out = Output::from_texts(&["a", "b"]);
        assert_eq!(String::from_utf8_lossy(&render(&out)), "a\r\nb\r\n");
    }

    #[test]
    fn several_spans_on_one_line_stay_on_one_line() {
        let out = Output {
            lines: vec![Line {
                spans: vec![
                    Span {
                        text: "name".to_string(),
                        style: Style::Plain,
                    },
                    Span {
                        text: "  title".to_string(),
                        style: Style::Dim,
                    },
                ],
            }],
            ..Output::default()
        };
        assert_eq!(
            String::from_utf8_lossy(&render(&out)),
            "name\x1b[2m  title\x1b[0m\r\n"
        );
    }
}
