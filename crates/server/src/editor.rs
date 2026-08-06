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
pub struct Decoder {
    pending: Vec<u8>,
}

impl Decoder {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Decoder {
            pending: Vec::new(),
        }
    }

    #[allow(dead_code)]
    pub fn feed(&mut self, bytes: &[u8]) -> Vec<Key> {
        self.pending.extend_from_slice(bytes);
        let mut keys = Vec::new();
        let mut i = 0;

        while i < self.pending.len() {
            if let Some((key, consumed)) = self.try_decode_key(&self.pending[i..]) {
                keys.push(key);
                i += consumed;
            } else {
                break;
            }
        }

        self.pending.drain(0..i);

        // Cap pending to prevent unbounded growth from invalid UTF-8
        // 4 bytes is enough for the longest sequence we need:
        // - 4 bytes for a UTF-8 sequence
        // - 3 bytes for an escape sequence
        if self.pending.len() > 4 {
            self.pending.clear();
        }

        keys
    }

    fn try_decode_key(&self, bytes: &[u8]) -> Option<(Key, usize)> {
        if bytes.is_empty() {
            return None;
        }

        match bytes[0] {
            // Escape sequences: need at least 3 bytes
            0x1b if bytes.len() >= 3 && bytes[1] == b'[' => match bytes[2] {
                b'A' => Some((Key::Up, 3)),
                b'B' => Some((Key::Down, 3)),
                _ => Some((Key::Ignored, 3)),
            },
            // Incomplete escape sequence
            0x1b if bytes.len() < 3 => None,

            // Control characters
            b'\r' | b'\n' => Some((Key::Enter, 1)),
            0x7f | 0x08 => Some((Key::Backspace, 1)),
            b'\t' => Some((Key::Tab, 1)),
            3 => Some((Key::CtrlC, 1)),
            4 => Some((Key::CtrlD, 1)),

            // UTF-8 characters (>= 0x20 that are not control codes)
            byte if byte >= 0x20 => {
                if byte < 0x80 {
                    // Single-byte ASCII
                    Some((Key::Char(byte as char), 1))
                } else {
                    // Multi-byte UTF-8
                    self.try_decode_utf8(bytes)
                }
            }

            // Other control characters are ignored
            _ => Some((Key::Ignored, 1)),
        }
    }

    fn try_decode_utf8(&self, bytes: &[u8]) -> Option<(Key, usize)> {
        let first = bytes[0];

        // Determine expected sequence length
        let seq_len = if first & 0xE0 == 0xC0 {
            2 // 110xxxxx
        } else if first & 0xF0 == 0xE0 {
            3 // 1110xxxx
        } else if first & 0xF8 == 0xF0 {
            4 // 11110xxx
        } else {
            // Invalid UTF-8 start byte
            return Some((Key::Ignored, 1));
        };

        // Check if we have enough bytes
        if bytes.len() < seq_len {
            return None; // Incomplete sequence
        }

        // Validate continuation bytes and decode
        let value = match seq_len {
            2 => {
                if bytes[1] & 0xC0 != 0x80 {
                    return Some((Key::Ignored, 1));
                }
                ((first & 0x1F) as u32) << 6 | ((bytes[1] & 0x3F) as u32)
            }
            3 => {
                if bytes[1] & 0xC0 != 0x80 || bytes[2] & 0xC0 != 0x80 {
                    return Some((Key::Ignored, 1));
                }
                ((first & 0x0F) as u32) << 12
                    | ((bytes[1] & 0x3F) as u32) << 6
                    | (bytes[2] & 0x3F) as u32
            }
            4 => {
                if bytes[1] & 0xC0 != 0x80 || bytes[2] & 0xC0 != 0x80 || bytes[3] & 0xC0 != 0x80 {
                    return Some((Key::Ignored, 1));
                }
                ((first & 0x07) as u32) << 18
                    | ((bytes[1] & 0x3F) as u32) << 12
                    | ((bytes[2] & 0x3F) as u32) << 6
                    | (bytes[3] & 0x3F) as u32
            }
            _ => unreachable!(),
        };

        // Try to convert to char
        if let Some(ch) = char::from_u32(value) {
            Some((Key::Char(ch), seq_len))
        } else {
            // Invalid Unicode codepoint
            Some((Key::Ignored, 1))
        }
    }
}

impl Default for Decoder {
    fn default() -> Self {
        Self::new()
    }
}

#[allow(dead_code)]
pub fn decode(bytes: &[u8]) -> Vec<Key> {
    let mut decoder = Decoder::new();
    decoder.feed(bytes)
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

    #[test]
    fn two_byte_utf8_character_in_one_read_produces_one_key() {
        // "é" is U+00E9, encoded as 0xC3 0xA9 in UTF-8
        let bytes = [0xC3, 0xA9];
        assert_eq!(decode(&bytes), vec![Key::Char('é')]);
    }

    #[test]
    fn two_byte_utf8_character_split_across_reads() {
        let mut decoder = Decoder::new();
        // First read: just the first byte
        let keys1 = decoder.feed(&[0xC3]);
        assert_eq!(keys1, vec![]); // Incomplete, nothing decoded
        // Second read: the continuation byte
        let keys2 = decoder.feed(&[0xA9]);
        assert_eq!(keys2, vec![Key::Char('é')]);
    }

    #[test]
    fn escape_sequence_split_across_reads() {
        let mut decoder = Decoder::new();
        // First read: ESC and [
        let keys1 = decoder.feed(&[0x1b, b'[']);
        assert_eq!(keys1, vec![]); // Incomplete escape, nothing decoded
        // Second read: the command byte
        let keys2 = decoder.feed(b"A");
        assert_eq!(keys2, vec![Key::Up]);
    }

    #[test]
    fn single_esc_byte_split_from_escape_sequence() {
        let mut decoder = Decoder::new();
        // First read: just ESC
        let keys1 = decoder.feed(&[0x1b]);
        assert_eq!(keys1, vec![]); // Incomplete escape, nothing decoded
        // Second read: [ and A
        let keys2 = decoder.feed(b"[A");
        assert_eq!(keys2, vec![Key::Up]);
    }

    #[test]
    fn invalid_utf8_does_not_panic_or_grow_pending() {
        let mut decoder = Decoder::new();
        // Stream of invalid UTF-8 start bytes (0x80 is not valid UTF-8)
        let invalid = [0x80, 0x80, 0x80, 0x80, 0x80];
        let keys = decoder.feed(&invalid);
        // Should produce ignored keys, not panic or corrupt
        assert_eq!(
            keys,
            vec![
                Key::Ignored,
                Key::Ignored,
                Key::Ignored,
                Key::Ignored,
                Key::Ignored
            ]
        );
        // Pending should be capped and cleared when overflowed
        assert!(decoder.pending.is_empty() || decoder.pending.len() <= 4);
    }

    #[test]
    fn invalid_utf8_continuation_sequence() {
        // Valid start byte 0xC3, but invalid continuation byte 0x20 (space)
        let bytes = [0xC3, 0x20];
        let keys = decode(&bytes);
        // First byte treated as invalid start, second as space character
        assert_eq!(keys, vec![Key::Ignored, Key::Char(' ')]);
    }

    #[test]
    fn three_byte_utf8_character() {
        // "é" using 3-byte encoding (different from the 2-byte version)
        // Let's use a character that requires 3 bytes: "中" is U+4E2D, encoded as 0xE4 0xB8 0xAD
        let bytes = [0xE4, 0xB8, 0xAD];
        assert_eq!(decode(&bytes), vec![Key::Char('中')]);
    }

    #[test]
    fn mixed_utf8_and_ascii() {
        // Mix of ASCII and UTF-8: "café" is c + a + f + é (UTF-8)
        let mut decoder = Decoder::new();
        let keys = decoder.feed(b"caf");
        assert_eq!(keys, vec![Key::Char('c'), Key::Char('a'), Key::Char('f')]);
        let keys2 = decoder.feed(&[0xC3, 0xA9]); // é in UTF-8
        assert_eq!(keys2, vec![Key::Char('é')]);
    }
}
