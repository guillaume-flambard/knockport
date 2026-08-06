#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum Key {
    Char(char),
    Backspace,
    Enter,
    Tab,
    Up,
    Down,
    CtrlC,
    CtrlD,
    Ignored,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[allow(dead_code)]
pub enum Action {
    None,
    Redraw,
    Submit(String),
    Complete(String),
    Quit,
}

#[allow(dead_code)]
pub fn decode(bytes: &[u8]) -> Vec<Key> {
    let mut keys = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            0x1b if bytes.len() > i + 2 && bytes[i + 1] == b'[' => {
                keys.push(match bytes[i + 2] {
                    b'A' => Key::Up,
                    b'B' => Key::Down,
                    _ => Key::Ignored,
                });
                i += 3;
            }
            b'\r' | b'\n' => {
                keys.push(Key::Enter);
                i += 1;
            }
            0x7f | 0x08 => {
                keys.push(Key::Backspace);
                i += 1;
            }
            b'\t' => {
                keys.push(Key::Tab);
                i += 1;
            }
            3 => {
                keys.push(Key::CtrlC);
                i += 1;
            }
            4 => {
                keys.push(Key::CtrlD);
                i += 1;
            }
            byte if byte >= 0x20 => {
                keys.push(Key::Char(byte as char));
                i += 1;
            }
            _ => {
                keys.push(Key::Ignored);
                i += 1;
            }
        }
    }
    keys
}

#[derive(Debug, Default)]
#[allow(dead_code)]
pub struct LineEditor {
    buffer: String,
    history: Vec<String>,
    position: Option<usize>,
}

impl LineEditor {
    #[allow(dead_code)]
    pub fn buffer(&self) -> &str {
        &self.buffer
    }

    #[allow(dead_code)]
    pub fn remember(&mut self, entry: &str) {
        self.history.push(entry.to_string());
        self.position = None;
    }

    #[allow(dead_code)]
    pub fn set_buffer(&mut self, value: &str) {
        self.buffer = value.to_string();
    }

    #[allow(dead_code)]
    pub fn apply(&mut self, key: Key) -> Action {
        match key {
            Key::Char(c) => {
                self.buffer.push(c);
                Action::Redraw
            }
            Key::Backspace => {
                if self.buffer.pop().is_some() {
                    Action::Redraw
                } else {
                    Action::None
                }
            }
            Key::Enter => {
                let line = std::mem::take(&mut self.buffer);
                self.position = None;
                Action::Submit(line)
            }
            Key::Tab => Action::Complete(self.buffer.clone()),
            Key::Up => {
                if self.history.is_empty() {
                    return Action::None;
                }
                let next = match self.position {
                    None => self.history.len() - 1,
                    Some(0) => 0,
                    Some(p) => p - 1,
                };
                self.position = Some(next);
                self.buffer = self.history[next].clone();
                Action::Redraw
            }
            Key::Down => match self.position {
                Some(p) if p + 1 < self.history.len() => {
                    self.position = Some(p + 1);
                    self.buffer = self.history[p + 1].clone();
                    Action::Redraw
                }
                _ => {
                    self.position = None;
                    self.buffer.clear();
                    Action::Redraw
                }
            },
            Key::CtrlC => {
                self.buffer.clear();
                self.position = None;
                Action::Redraw
            }
            Key::CtrlD => Action::Quit,
            Key::Ignored => Action::None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_plain_characters() {
        assert_eq!(decode(b"ls"), vec![Key::Char('l'), Key::Char('s')]);
    }

    #[test]
    fn decodes_control_keys() {
        assert_eq!(decode(b"\r"), vec![Key::Enter]);
        assert_eq!(decode(b"\x7f"), vec![Key::Backspace]);
        assert_eq!(decode(b"\t"), vec![Key::Tab]);
        assert_eq!(decode(&[3]), vec![Key::CtrlC]);
        assert_eq!(decode(&[4]), vec![Key::CtrlD]);
    }

    #[test]
    fn decodes_arrow_escape_sequences() {
        assert_eq!(decode(b"\x1b[A"), vec![Key::Up]);
        assert_eq!(decode(b"\x1b[B"), vec![Key::Down]);
    }

    #[test]
    fn typing_then_enter_submits_the_line() {
        let mut editor = LineEditor::default();
        for key in decode(b"ls") {
            editor.apply(key);
        }
        assert_eq!(editor.apply(Key::Enter), Action::Submit("ls".to_string()));
        assert_eq!(editor.buffer(), "");
    }

    #[test]
    fn backspace_removes_the_last_character() {
        let mut editor = LineEditor::default();
        for key in decode(b"lsx") {
            editor.apply(key);
        }
        editor.apply(Key::Backspace);
        assert_eq!(editor.buffer(), "ls");
    }

    #[test]
    fn backspace_on_an_empty_buffer_is_harmless() {
        let mut editor = LineEditor::default();
        assert_eq!(editor.apply(Key::Backspace), Action::None);
        assert_eq!(editor.buffer(), "");
    }

    #[test]
    fn up_walks_back_through_history() {
        let mut editor = LineEditor::default();
        editor.remember("ls");
        editor.remember("whoami");
        editor.apply(Key::Up);
        assert_eq!(editor.buffer(), "whoami");
        editor.apply(Key::Up);
        assert_eq!(editor.buffer(), "ls");
        editor.apply(Key::Down);
        assert_eq!(editor.buffer(), "whoami");
    }

    #[test]
    fn ctrl_c_clears_the_line_and_ctrl_d_quits() {
        let mut editor = LineEditor::default();
        for key in decode(b"half typed") {
            editor.apply(key);
        }
        assert_eq!(editor.apply(Key::CtrlC), Action::Redraw);
        assert_eq!(editor.buffer(), "");
        assert_eq!(editor.apply(Key::CtrlD), Action::Quit);
    }
}
