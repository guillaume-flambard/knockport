use crate::output::{Effect, Line, Output, Style};
use crate::session::{ContactDraft, ContactPayload, ContactStep, Mode, Session};

pub const CV_URL: &str = "{{cv_url}}";
pub const BOOK_URL: &str = "{{book_url}}";

pub fn valid_email(value: &str) -> bool {
    let value = value.trim();
    if value.is_empty() || value.len() > 254 || value.contains(char::is_whitespace) {
        return false;
    }
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };
    !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
}

pub fn valid_message(value: &str) -> bool {
    let len = value.trim().chars().count();
    (10..=4000).contains(&len)
}

pub fn start(session: &mut Session) -> Output {
    session.mode = Mode::Contact {
        step: ContactStep::Name,
        draft: ContactDraft::default(),
    };
    Output {
        lines: vec![
            Line::plain("Three questions. Type cancel at any point to drop out."),
            Line::blank(),
        ],
        ..Output::default()
    }
}

pub fn step(session: &mut Session, input: &str) -> Output {
    let value = input.trim().to_string();

    if value.eq_ignore_ascii_case("cancel") {
        session.mode = Mode::Normal;
        return Output::text("Dropped. Nothing was sent.");
    }

    let Mode::Contact { step, draft } = session.mode.clone() else {
        return Output::empty();
    };

    match step {
        ContactStep::Name => {
            if value.is_empty() {
                return retry("A name, even a first one.");
            }
            session.mode = Mode::Contact {
                step: ContactStep::Email,
                draft: ContactDraft {
                    name: value,
                    ..draft
                },
            };
            Output::empty()
        }
        ContactStep::Email => {
            if !valid_email(&value) {
                return retry("That does not look like an email address.");
            }
            session.mode = Mode::Contact {
                step: ContactStep::Message,
                draft: ContactDraft {
                    email: value,
                    ..draft
                },
            };
            Output::empty()
        }
        ContactStep::Message => {
            if !valid_message(&value) {
                return retry("Between 10 and 4000 characters, please.");
            }
            session.mode = Mode::Normal;
            let payload = ContactPayload {
                name: draft.name,
                email: draft.email,
                message: value,
                journal: session.journal.clone(),
                egg_found: session.egg_found,
            };
            Output {
                lines: vec![Line::plain("Sent. I read everything, and I answer.")],
                effect: Some(Effect::SubmitContact(payload)),
                failed: false,
            }
        }
    }
}

fn retry(message: &str) -> Output {
    Output {
        lines: vec![Line::styled(message, Style::Accent)],
        effect: None,
        failed: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::output::Effect;
    use crate::session::{ContactStep, Mode, Session};

    fn flatten(out: &Output) -> String {
        out.lines
            .iter()
            .map(|l| l.spans.iter().map(|s| s.text.as_str()).collect::<String>())
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn valid_email_accepts_a_plain_address() {
        assert!(valid_email("a@b.co"));
        assert!(valid_email("guillaume.flambard+jobs@example.com"));
    }

    #[test]
    fn valid_email_rejects_the_obvious() {
        assert!(!valid_email("nope"));
        assert!(!valid_email("a@b"));
        assert!(!valid_email("a b@c.co"));
        assert!(!valid_email(""));
        assert!(!valid_email(&format!("{}@example.com", "x".repeat(300))));
    }

    #[test]
    fn valid_message_enforces_both_bounds() {
        assert!(!valid_message("too short"));
        assert!(valid_message("this one is long enough to say something"));
        assert!(!valid_message(&"x".repeat(4001)));
    }

    #[test]
    fn start_enters_contact_mode_at_the_name_step() {
        let mut session = Session::new();
        start(&mut session);
        assert!(matches!(
            session.mode,
            Mode::Contact {
                step: ContactStep::Name,
                ..
            }
        ));
    }

    #[test]
    fn a_full_run_emits_the_payload_and_returns_to_normal() {
        let mut session = Session::new();
        session.egg_found = true;
        session.journal.push(crate::session::Event {
            at_ms: 5,
            input: "ls".to_string(),
            ok: true,
        });

        start(&mut session);
        step(&mut session, "Seema");
        step(&mut session, "seema@example.com");
        let out = step(
            &mut session,
            "we have a role that fits, are you free thursday",
        );

        let Some(Effect::SubmitContact(payload)) = out.effect else {
            panic!("expected a payload, got {:?}", out.effect);
        };
        assert_eq!(payload.name, "Seema");
        assert_eq!(payload.email, "seema@example.com");
        assert!(payload.egg_found);
        assert_eq!(payload.journal.len(), 1);
        assert!(matches!(session.mode, Mode::Normal));
    }

    #[test]
    fn a_bad_email_asks_again_without_advancing() {
        let mut session = Session::new();
        start(&mut session);
        step(&mut session, "Seema");
        let out = step(&mut session, "nope");
        assert!(flatten(&out).contains("does not look like an email"));
        assert!(matches!(
            session.mode,
            Mode::Contact {
                step: ContactStep::Email,
                ..
            }
        ));
    }

    #[test]
    fn cancel_leaves_contact_mode_without_sending() {
        let mut session = Session::new();
        start(&mut session);
        let out = step(&mut session, "cancel");
        assert!(out.effect.is_none());
        assert!(matches!(session.mode, Mode::Normal));
    }
}
