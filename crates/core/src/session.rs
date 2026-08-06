use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    pub at_ms: u64,
    pub input: String,
    pub ok: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContactPayload {
    pub name: String,
    pub email: String,
    pub message: String,
    pub journal: Vec<Event>,
    pub egg_found: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContactStep {
    Name,
    Email,
    Message,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ContactDraft {
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Mode {
    Normal,
    Contact {
        step: ContactStep,
        draft: ContactDraft,
    },
}

#[derive(Debug, Clone)]
pub struct Session {
    pub cwd: Vec<String>,
    pub mode: Mode,
    pub history: Vec<String>,
    pub journal: Vec<Event>,
    pub egg_found: bool,
}

impl Session {
    pub fn new() -> Self {
        Session {
            cwd: Vec::new(),
            mode: Mode::Normal,
            history: Vec::new(),
            journal: Vec::new(),
            egg_found: false,
        }
    }

    pub fn prompt(&self) -> String {
        match &self.mode {
            Mode::Contact { step, .. } => match step {
                ContactStep::Name => "your name> ".to_string(),
                ContactStep::Email => "your email> ".to_string(),
                ContactStep::Message => "your message> ".to_string(),
            },
            Mode::Normal => format!("~/{}$ ", self.cwd.join("/")),
        }
    }
}

impl Default for Session {
    fn default() -> Self {
        Self::new()
    }
}
