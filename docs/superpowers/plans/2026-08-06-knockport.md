# knockport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire knockport, un portefeuille en terminal que l'on visite par `ssh knockport.com` ou sur le web, les deux façades rejouant le même parcours depuis un cœur Rust partagé.

**Architecture:** Un crate `core` pur, sans I/O, qui porte le système de fichiers virtuel, le parseur de commandes et la machine à états de la session, et qui compile aussi bien en natif qu'en `wasm32`. Deux façades le peignent : `server` (russh pour le SSH, axum pour le HTTP) et `web` (Dioxus compilé en WebAssembly). Le contenu est du markdown embarqué au build, donc aucun accès disque à l'exécution.

**Tech Stack:** Rust edition 2024, rustc 1.96.1. `russh 0.62`, `axum 0.8`, `dioxus 0.7`, `rust-embed 8`, `gray_matter 0.3`, `pulldown-cmark 0.13`, `lettre 0.11`, `insta 1.48`, `tokio 1.53`, `blake3 1`.

## Écarts assumés par rapport à la spec

**1. Pas de ratatui.** La spec citait `russh + ratatui`. Ratatui sert à peindre un écran fixe, or on veut le comportement d'un vrai shell : de la sortie qui défile, avec le scrollback du client. On écrit donc de l'ANSI directement dans un puits `std::io::Write` branché sur le canal SSH, exactement le motif `TerminalHandle` de l'exemple officiel de russh. Une dépendance en moins et une meilleure expérience.

**2. `execute` prend le temps en paramètre.** Signature réelle : `execute(&mut Session, &Content, input: &str, at_ms: u64)`. Le core reste pur et testable au millimètre, et il n'appelle pas d'horloge, ce qui compte pour la cible `wasm32`.

**3. `/profile` est rendu par axum, pas par Dioxus.** La page accessible ne doit dépendre d'aucun JavaScript. Le serveur possède déjà `core`, il rend donc du HTML statique depuis `Content`. Cela supprime `dioxus-router` du projet.

## Global Constraints

- Rust edition 2024, toolchain 1.96.1 minimum. `cargo fmt` et `cargo clippy -- -D warnings` passent avant chaque commit.
- Le crate `core` ne dépend d'aucune I/O : pas de `std::fs`, pas de `std::time`, pas de `tokio`. Il doit compiler pour `wasm32-unknown-unknown`.
- Le core n'exécute jamais de processus. Aucun `Command`, aucun `fork`, aucun accès disque hors du contenu embarqué.
- Code, commentaires, noms de fichiers, messages de commit : en anglais. Cette documentation de travail reste en français.
- Aucun message de commit ne porte de mention de co-auteur assistant.
- Aucun tiret cadratin ni demi-cadratin dans les textes destinés à être lus (`content/`, README, pages web).
- Le secret ne quitte jamais le dépôt : clé d'hôte SSH, sel d'empreinte et identifiants SMTP viennent de l'environnement.
- Versions exactes des dépendances, relevées le 2026-08-06 : `russh 0.62.5`, `axum 0.8.9`, `dioxus 0.7.10`, `rust-embed 8.12.0`, `gray_matter 0.3.2`, `pulldown-cmark 0.13.4`, `lettre 0.11.23`, `insta 1.48.0`, `tokio 1.53.1`, `serde 1.0.229`, `blake3 1`.

---

## Structure des fichiers

```
Cargo.toml                       workspace, dépendances communes
content/                         le contenu du parcours, markdown + frontmatter
  whoami.md
  stack.md
  knock.md                       frontmatter hidden: true, affiché comme .knock
  missions/…
  projects/…
crates/core/
  src/lib.rs                     ré-exports publics
  src/output.rs                  Output, Line, Span, Style, Effect
  src/content.rs                 Content, Dir, File, chargement et frontmatter
  src/session.rs                 Session, Mode, Event, journal
  src/command.rs                 parseur et aiguillage
  src/commands/fs.rs             ls, cd, cat, pwd
  src/commands/info.rs           help, whoami, stack, history, clear, exit
  src/commands/contact.rs        contact, cv, book
  src/complete.rs                complétion par Tab
crates/server/
  src/main.rs                    configuration et démarrage des deux écoutes
  src/ansi.rs                    Output vers octets ANSI
  src/editor.rs                  décodage des touches et édition de ligne
  src/ssh.rs                     serveur russh
  src/http.rs                    routes axum
  src/profile.rs                 page /profile sans JavaScript
  src/ratelimit.rs               limite de débit par empreinte d'IP
  src/journal.rs                 jsonl en ajout seul
  src/mail.rs                    envoi SMTP
crates/web/
  src/main.rs                    point d'entrée Dioxus
  src/terminal.rs                composant terminal, aria-live
  assets/main.css
deploy/
  knockport.service
  Caddyfile
  provision.md
.github/workflows/ci.yml
```

---

### Task 1: Workspace et types de sortie

**Files:**
- Create: `Cargo.toml`, `crates/core/Cargo.toml`, `crates/core/src/lib.rs`, `crates/core/src/output.rs`
- Test: dans `crates/core/src/output.rs`

**Interfaces:**
- Consumes: rien
- Produces: `Output { lines: Vec<Line>, effect: Option<Effect> }`, `Line { spans: Vec<Span> }`, `Span { text: String, style: Style }`, `Style::{Plain,Dim,Bold,Accent}`, `Effect::{Clear,Quit,SubmitContact(ContactPayload),OpenUrl(String)}`, `Output::text(&str) -> Output`, `Output::from_texts(&[&str]) -> Output`, `Output::empty() -> Output`, `Output::with_effect(self, Effect) -> Output`, `Line::plain(&str) -> Line`, `Line::styled(&str, Style) -> Line`, `Line::blank() -> Line`

- [ ] **Step 1: Créer le workspace**

`Cargo.toml` à la racine :

```toml
[workspace]
resolver = "3"
members = ["crates/core", "crates/server", "crates/web"]

[workspace.package]
edition = "2024"
rust-version = "1.96"
license = "MIT"

[workspace.dependencies]
serde = { version = "1.0.229", features = ["derive"] }
serde_json = "1"
anyhow = "1"
```

`crates/core/Cargo.toml` :

```toml
[package]
name = "knockport-core"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true

[dependencies]
serde = { workspace = true }

[dev-dependencies]
insta = "1.48.0"
```

Créer `crates/server` et `crates/web` avec un `src/main.rs` contenant `fn main() {}` et un `Cargo.toml` minimal, sinon le workspace ne compile pas.

- [ ] **Step 2: Écrire le test qui échoue**

Dans `crates/core/src/output.rs` :

```rust
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
        assert_eq!(out.lines[0].spans[0].text, "knockport: cd: nowhere: no such directory");
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
```

- [ ] **Step 3: Le lancer et vérifier qu'il échoue**

Run: `cargo test -p knockport-core`
Expected: FAIL, `cannot find type Output in this scope`

- [ ] **Step 4: Écrire l'implémentation minimale**

```rust
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
            spans: vec![Span { text: text.to_string(), style }],
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
        Output { lines: vec![Line::plain(text)], ..Output::default() }
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
```

`crates/core/src/lib.rs` :

```rust
pub mod output;
pub mod session;

pub use output::{Effect, Line, Output, Span, Style};
```

Créer `crates/core/src/session.rs` avec le strict nécessaire pour que `Effect` compile :

```rust
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ContactPayload {
    pub name: String,
    pub email: String,
    pub message: String,
}
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `cargo test -p knockport-core`
Expected: PASS, 3 tests

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml crates/
git commit -m "feat(core): output types shared by both frontends"
```

---

### Task 2: Contenu, frontmatter et système de fichiers virtuel

**Files:**
- Create: `crates/core/src/content.rs`, `content/whoami.md`, `content/stack.md`, `content/knock.md`, `content/projects/knockport.md`
- Modify: `crates/core/src/lib.rs`, `crates/core/Cargo.toml`
- Test: dans `crates/core/src/content.rs`

**Interfaces:**
- Consumes: rien
- Produces: `Content::load() -> Content`, `Content::resolve_dir(&self, path: &[String]) -> Option<&Dir>`, `Content::resolve_file(&self, path: &[String]) -> Option<&File>`, `Dir { name, dirs, files }`, `File { name, title, order, hidden, body }`, `File::display_name(&self) -> String`

La règle de nommage, une seule et sans exception : un fichier dont le frontmatter porte `hidden: true` s'affiche et s'adresse avec un point devant. `content/knock.md` devient `.knock`. Aucun fichier caché sur le disque, ce qui évite les surprises de `rust-embed` avec les points.

- [ ] **Step 1: Écrire le contenu de départ**

`content/whoami.md` :

```markdown
---
title: whoami
order: 1
---
Guillaume Flambard. Full-stack and AI engineer.
Ten years shipping products, the last three of them mostly alone,
from the database up to whatever the user actually touches.
Currently on Koh Phangan, Thailand. Works across European time zones.
```

`content/stack.md` :

```markdown
---
title: stack
order: 2
---
Daily: TypeScript, React, Next.js, Laravel, PostgreSQL, Rust when it earns its place.
AI: retrieval pipelines, agent orchestration, evaluation harnesses.
Infra: Docker, nginx, Cloudflare, a VPS that has been up for 25 days.
```

`content/projects/knockport.md` :

```markdown
---
title: knockport
order: 1
---
The thing you are typing into right now.
A Rust core with no I/O, painted by an SSH server and a WebAssembly frontend.
The name is port knocking, and knocking on a door.
```

`content/knock.md` :

```markdown
---
title: knock
order: 99
hidden: true
---
You went looking. That is the whole test, and you passed it.
```

- [ ] **Step 2: Écrire le test qui échoue**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_root_files_with_frontmatter() {
        let content = Content::load();
        let whoami = content
            .resolve_file(&["whoami".to_string()])
            .expect("whoami must exist");
        assert_eq!(whoami.title, "whoami");
        assert!(!whoami.hidden);
        assert!(whoami.body.contains("Guillaume Flambard"));
    }

    #[test]
    fn hidden_file_is_addressed_with_a_leading_dot() {
        let content = Content::load();
        let egg = content
            .resolve_file(&[".knock".to_string()])
            .expect("the egg must exist");
        assert!(egg.hidden);
        assert_eq!(egg.display_name(), ".knock");
    }

    #[test]
    fn nested_directories_are_walkable() {
        let content = Content::load();
        let dir = content
            .resolve_dir(&["projects".to_string()])
            .expect("projects must exist");
        assert!(dir.files.iter().any(|f| f.name == "knockport"));
    }

    #[test]
    fn every_shipped_file_parses_and_is_titled() {
        let content = Content::load();
        let mut stack = vec![&content.root];
        let mut seen = 0;
        while let Some(dir) = stack.pop() {
            for f in &dir.files {
                assert!(!f.title.is_empty(), "{} has no title", f.name);
                assert!(!f.body.trim().is_empty(), "{} has no body", f.name);
                seen += 1;
            }
            stack.extend(dir.dirs.iter());
        }
        assert!(seen >= 4, "expected the seed content to be embedded");
    }
}
```

- [ ] **Step 3: Le lancer et vérifier qu'il échoue**

Run: `cargo test -p knockport-core content`
Expected: FAIL, `cannot find type Content in this scope`

- [ ] **Step 4: Ajouter les dépendances**

Dans `crates/core/Cargo.toml` :

```toml
rust-embed = { version = "8.12.0", features = ["include-exclude"] }
gray_matter = "0.3.2"
```

- [ ] **Step 5: Écrire l'implémentation**

```rust
use gray_matter::Matter;
use gray_matter::engine::YAML;
use rust_embed::RustEmbed;
use serde::Deserialize;

#[derive(RustEmbed)]
#[folder = "../../content/"]
#[include = "*.md"]
struct Files;

#[derive(Debug, Deserialize, Default)]
struct FrontMatter {
    title: Option<String>,
    order: Option<u32>,
    #[serde(default)]
    hidden: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct File {
    pub name: String,
    pub title: String,
    pub order: u32,
    pub hidden: bool,
    pub body: String,
}

impl File {
    pub fn display_name(&self) -> String {
        if self.hidden {
            format!(".{}", self.name)
        } else {
            self.name.clone()
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Dir {
    pub name: String,
    pub dirs: Vec<Dir>,
    pub files: Vec<File>,
}

#[derive(Debug, Clone, Default)]
pub struct Content {
    pub root: Dir,
}

impl Content {
    pub fn load() -> Self {
        let matter = Matter::<YAML>::new();
        let mut root = Dir::default();

        for path in Files::iter() {
            let raw = Files::get(path.as_ref()).expect("embedded file must exist");
            let text = String::from_utf8_lossy(raw.data.as_ref()).to_string();
            let parsed = matter.parse::<FrontMatter>(&text).expect("frontmatter must parse");
            let fm = parsed.data.unwrap_or_default();

            let segments: Vec<&str> = path.split('/').collect();
            let (file_name, dirs) = segments.split_last().expect("path must not be empty");
            let stem = file_name.trim_end_matches(".md").to_string();

            let file = File {
                title: fm.title.unwrap_or_else(|| stem.clone()),
                order: fm.order.unwrap_or(u32::MAX),
                hidden: fm.hidden,
                name: stem,
                body: parsed.content.trim().to_string(),
            };

            let mut cursor = &mut root;
            for segment in dirs {
                let index = match cursor.dirs.iter().position(|d| d.name == *segment) {
                    Some(i) => i,
                    None => {
                        cursor.dirs.push(Dir { name: segment.to_string(), ..Dir::default() });
                        cursor.dirs.len() - 1
                    }
                };
                cursor = &mut cursor.dirs[index];
            }
            cursor.files.push(file);
        }

        sort(&mut root);
        Content { root }
    }

    pub fn resolve_dir(&self, path: &[String]) -> Option<&Dir> {
        let mut cursor = &self.root;
        for segment in path {
            cursor = cursor.dirs.iter().find(|d| d.name == *segment)?;
        }
        Some(cursor)
    }

    pub fn resolve_file(&self, path: &[String]) -> Option<&File> {
        let (name, dirs) = path.split_last()?;
        let dir = self.resolve_dir(dirs)?;
        dir.files.iter().find(|f| f.display_name() == *name)
    }
}

fn sort(dir: &mut Dir) {
    dir.files.sort_by(|a, b| a.order.cmp(&b.order).then(a.name.cmp(&b.name)));
    dir.dirs.sort_by(|a, b| a.name.cmp(&b.name));
    for child in &mut dir.dirs {
        sort(child);
    }
}
```

Ajouter `pub mod content;` et `pub use content::{Content, Dir, File};` dans `lib.rs`.

- [ ] **Step 6: Vérifier que les tests passent**

Run: `cargo test -p knockport-core content`
Expected: PASS, 4 tests

Le quatrième test est le garde-fou du contenu : il échoue dès qu'un fichier ajouté plus tard n'a pas de titre ou de corps.

- [ ] **Step 7: Commit**

```bash
git add content/ crates/core/
git commit -m "feat(core): virtual filesystem loaded from embedded markdown"
```

---

### Task 3: Session, journal et parseur de commandes

**Files:**
- Modify: `crates/core/src/session.rs`
- Create: `crates/core/src/command.rs`
- Test: dans les deux fichiers

**Interfaces:**
- Consumes: `Content`, `Output`
- Produces: `Session::new() -> Session`, champs `cwd: Vec<String>`, `mode: Mode`, `history: Vec<String>`, `journal: Vec<Event>`, `egg_found: bool`; `Event { at_ms: u64, input: String, ok: bool }`; `Mode::{Normal, Contact(ContactDraft)}`; `parse(input: &str) -> Option<Cmd>`; `Cmd { name: String, args: Vec<String> }`; `execute(&mut Session, &Content, input: &str, at_ms: u64) -> Output`

- [ ] **Step 1: Écrire le test qui échoue**

Dans `crates/core/src/command.rs` :

```rust
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
```

- [ ] **Step 2: Le lancer et vérifier qu'il échoue**

Run: `cargo test -p knockport-core command`
Expected: FAIL, `cannot find function parse in this scope`

- [ ] **Step 3: Écrire session.rs**

```rust
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Event {
    pub at_ms: u64,
    pub input: String,
    pub ok: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
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
    Contact { step: ContactStep, draft: ContactDraft },
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
```

- [ ] **Step 4: Écrire command.rs**

```rust
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
    Some(Cmd { name, args: words.map(str::to_string).collect() })
}

pub fn execute(session: &mut Session, content: &Content, input: &str, at_ms: u64) -> Output {
    if matches!(session.mode, Mode::Contact { .. }) {
        let output = crate::commands::contact::step(session, input);
        session.journal.push(Event { at_ms, input: "<contact>".to_string(), ok: true });
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

// Les commandes arrivent à la tâche 4. Écrite sans `match` à bras unique,
// sinon `clippy -D warnings` refuse le commit sur `match_single_binding`.
fn dispatch(_session: &mut Session, _content: &Content, cmd: &Cmd) -> Output {
    unknown(&cmd.name)
}

fn unknown(name: &str) -> Output {
    let mut output = Output::failure(&format!("{name}: no such command"));
    output.lines.push(Line::styled("try help", Style::Dim));
    output
}
```

Ajouter dans `lib.rs` :

```rust
pub mod command;
pub mod commands;
pub use command::{Cmd, execute, parse};
pub use session::{ContactDraft, ContactPayload, ContactStep, Event, Mode, Session};
```

Créer `crates/core/src/commands/mod.rs` avec `pub mod contact;` et un `crates/core/src/commands/contact.rs` provisoire :

```rust
use crate::output::Output;
use crate::session::Session;

pub fn step(_session: &mut Session, _input: &str) -> Output {
    Output::empty()
}
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `cargo test -p knockport-core`
Expected: PASS, tous les tests des tâches 1 à 3

- [ ] **Step 6: Commit**

```bash
git add crates/core/
git commit -m "feat(core): session state, journal and command parser"
```

---

### Task 4: ls, pwd et cd

**Files:**
- Create: `crates/core/src/commands/fs.rs`
- Modify: `crates/core/src/command.rs` (la fonction `dispatch`), `crates/core/src/commands/mod.rs`
- Test: dans `crates/core/src/commands/fs.rs`

**Interfaces:**
- Consumes: `Content`, `Session`, `Output`, `Cmd`
- Produces: `fs::ls(&Session, &Content, &[String]) -> Output`, `fs::cd(&mut Session, &Content, &[String]) -> Output`, `fs::pwd(&Session) -> Output`, `fs::resolve(&Session, &str) -> Vec<String>`

- [ ] **Step 1: Écrire le test qui échoue**

```rust
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
}
```

- [ ] **Step 2: Le lancer et vérifier qu'il échoue**

Run: `cargo test -p knockport-core fs`
Expected: FAIL, `cannot find function ls in this scope`

- [ ] **Step 3: Écrire l'implémentation**

```rust
use crate::content::Content;
use crate::output::{Line, Output, Style};
use crate::session::Session;

pub fn resolve(session: &Session, arg: &str) -> Vec<String> {
    let mut path = if arg.starts_with('/') { Vec::new() } else { session.cwd.clone() };
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
                crate::output::Span { text: file.display_name(), style: Style::Plain },
                crate::output::Span { text: format!("   {}", file.title), style: Style::Dim },
            ],
        });
    }

    if lines.is_empty() {
        return Output::text("(empty)");
    }
    Output { lines, ..Output::default() }
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
```

- [ ] **Step 4: Brancher dans le dispatch**

Dans `crates/core/src/command.rs`, remplacer le corps de `dispatch` :

```rust
fn dispatch(session: &mut Session, content: &Content, cmd: &Cmd) -> Output {
    use crate::commands::fs;
    match cmd.name.as_str() {
        "ls" => fs::ls(session, content, &cmd.args),
        "cd" => fs::cd(session, content, &cmd.args),
        "pwd" => fs::pwd(session),
        _ => unknown(&cmd.name),
    }
}
```

Ajouter `pub mod fs;` dans `crates/core/src/commands/mod.rs`.

- [ ] **Step 5: Vérifier que les tests passent**

Run: `cargo test -p knockport-core`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crates/core/
git commit -m "feat(core): ls, cd and pwd over the virtual filesystem"
```

---

### Task 5: cat, l'énigme, et les commandes de présentation

**Files:**
- Create: `crates/core/src/commands/info.rs`
- Modify: `crates/core/src/commands/fs.rs` (ajout de `cat`), `crates/core/src/command.rs`, `crates/core/src/commands/mod.rs`
- Test: dans les deux fichiers, plus un instantané

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: `fs::cat(&mut Session, &Content, &[String]) -> Output`, `info::help() -> Output`, `info::history(&Session) -> Output`, `info::show(&Content, name: &str) -> Output`

`whoami` et `stack` ne sont pas du code en dur : ce sont `cat whoami` et `cat stack` sous un autre nom, donc le contenu reste la seule source de vérité.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `crates/core/src/commands/fs.rs` :

```rust
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
```

Dans `crates/core/src/commands/info.rs` :

```rust
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
    fn help_lists_every_dispatched_command() {
        let rendered = flatten(&help());
        for name in ["ls", "cd", "cat", "whoami", "stack", "cv", "contact", "book", "exit"] {
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
```

- [ ] **Step 2: Le lancer et vérifier qu'il échoue**

Run: `cargo test -p knockport-core`
Expected: FAIL, `cannot find function cat` puis `cannot find function help`

- [ ] **Step 3: Écrire `cat`**

Dans `crates/core/src/commands/fs.rs` :

```rust
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
```

- [ ] **Step 4: Écrire info.rs**

```rust
use crate::content::Content;
use crate::output::{Line, Output, Span, Style};
use crate::session::Session;

const COMMANDS: &[(&str, &str)] = &[
    ("ls", "list what is here, -a shows everything"),
    ("cd", "move around, .. goes up"),
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
                Span { text: format!("  {name:<9}"), style: Style::Accent },
                Span { text: description.to_string(), style: Style::Dim },
            ],
        });
    }
    Output { lines, ..Output::default() }
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
        Some(file) => Output { lines: file.body.lines().map(Line::plain).collect(), ..Output::default() },
        None => Output::failure(&format!("{name}: content is missing")),
    }
}
```

- [ ] **Step 5: Compléter le dispatch**

```rust
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
```

Ajouter `pub mod info;` dans `commands/mod.rs`.

- [ ] **Step 6: Ajouter les tests d'instantané**

Nouveau fichier `crates/core/tests/snapshots.rs` :

```rust
use knockport_core::{Content, Session, execute};

fn render(input: &str) -> String {
    let content = Content::load();
    let mut session = Session::new();
    let out = execute(&mut session, &content, input, 0);
    out.lines
        .iter()
        .map(|l| l.spans.iter().map(|s| s.text.as_str()).collect::<String>())
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn snapshot_help() {
    insta::assert_snapshot!(render("help"));
}

#[test]
fn snapshot_ls_root() {
    insta::assert_snapshot!(render("ls"));
}

#[test]
fn snapshot_unknown_command() {
    insta::assert_snapshot!(render("deploy to prod"));
}
```

- [ ] **Step 7: Vérifier et accepter les instantanés**

Run: `cargo test -p knockport-core` puis `cargo insta accept`
Expected: PASS, trois fichiers `.snap` créés sous `crates/core/tests/snapshots/`

- [ ] **Step 8: Commit**

```bash
git add crates/core/
git commit -m "feat(core): cat, help, history and the hidden file"
```

---

### Task 6: Le mode contact, cv et book

**Files:**
- Modify: `crates/core/src/commands/contact.rs`, `crates/core/src/command.rs`
- Test: dans `crates/core/src/commands/contact.rs`

**Interfaces:**
- Consumes: `Session`, `Mode`, `ContactStep`, `ContactDraft`, `ContactPayload`, `Effect`
- Produces: `contact::start(&mut Session) -> Output`, `contact::step(&mut Session, input: &str) -> Output`, `contact::valid_email(&str) -> bool`, `contact::valid_message(&str) -> bool`

La configuration des URL n'appartient pas au core : `cv` et `book` renvoient `Effect::OpenUrl` avec un marqueur, et la façade substitue la valeur réelle. Le core reste sans configuration.

- [ ] **Step 1: Écrire le test qui échoue**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::output::Effect;
    use crate::session::{Mode, Session};

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
        assert!(matches!(session.mode, Mode::Contact { step: ContactStep::Name, .. }));
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
        let out = step(&mut session, "we have a role that fits, are you free thursday");

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
        assert!(matches!(session.mode, Mode::Contact { step: ContactStep::Email, .. }));
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
```

- [ ] **Step 2: Le lancer et vérifier qu'il échoue**

Run: `cargo test -p knockport-core contact`
Expected: FAIL, `cannot find function start in this scope`

- [ ] **Step 3: Écrire l'implémentation**

```rust
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
    session.mode = Mode::Contact { step: ContactStep::Name, draft: ContactDraft::default() };
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
                draft: ContactDraft { name: value, ..draft },
            };
            Output::empty()
        }
        ContactStep::Email => {
            if !valid_email(&value) {
                return retry("That does not look like an email address.");
            }
            session.mode = Mode::Contact {
                step: ContactStep::Message,
                draft: ContactDraft { email: value, ..draft },
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
```

- [ ] **Step 4: Brancher dans le dispatch**

```rust
        "contact" | "hire" => crate::commands::contact::start(session),
        "cv" => Output::text("Opening the CV.")
            .with_effect(Effect::OpenUrl(crate::commands::contact::CV_URL.to_string())),
        "book" => Output::text("Opening the calendar.")
            .with_effect(Effect::OpenUrl(crate::commands::contact::BOOK_URL.to_string())),
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `cargo test -p knockport-core`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crates/core/
git commit -m "feat(core): contact flow, cv and book effects"
```

---

### Task 7: Complétion par Tab

**Files:**
- Create: `crates/core/src/complete.rs`
- Modify: `crates/core/src/lib.rs`
- Test: dans `crates/core/src/complete.rs`

**Interfaces:**
- Consumes: `Session`, `Content`
- Produces: `complete(&Session, &Content, partial: &str) -> Vec<String>`

- [ ] **Step 1: Écrire le test qui échoue**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::Content;
    use crate::session::Session;

    #[test]
    fn completes_a_command_name() {
        let content = Content::load();
        let session = Session::new();
        assert_eq!(complete(&session, &content, "wh"), vec!["whoami".to_string()]);
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
        assert!(found.is_empty(), "the egg must stay found by hand, got: {found:?}");
    }

    #[test]
    fn no_match_returns_nothing() {
        let content = Content::load();
        let session = Session::new();
        assert!(complete(&session, &content, "xyz").is_empty());
    }
}
```

- [ ] **Step 2: Le lancer et vérifier qu'il échoue**

Run: `cargo test -p knockport-core complete`
Expected: FAIL, `cannot find function complete in this scope`

- [ ] **Step 3: Écrire l'implémentation**

```rust
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
                .chain(dir.files.iter().filter(|f| !f.hidden).map(|f| f.name.clone()))
                .filter(|name| name.starts_with(prefix) && !prefix.is_empty())
                .map(|name| format!("{command} {name}"))
                .collect();
            found.sort();
            found
        }
    }
}
```

- [ ] **Step 4: Exporter depuis lib.rs**

```rust
pub mod complete;
pub use complete::complete;
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `cargo test -p knockport-core`
Expected: PASS

- [ ] **Step 6: Vérifier la cible WebAssembly**

Run: `rustup target add wasm32-unknown-unknown && cargo check -p knockport-core --target wasm32-unknown-unknown`
Expected: compile sans erreur. Si `gray_matter` ou `rust-embed` traînent une dépendance système, c'est ici qu'on le découvre, pas trois tâches plus loin.

- [ ] **Step 7: Commit**

```bash
git add crates/core/
git commit -m "feat(core): tab completion for commands and paths"
```

---

### Task 8: Rendu ANSI et éditeur de ligne

**Files:**
- Create: `crates/server/src/ansi.rs`, `crates/server/src/editor.rs`
- Modify: `crates/server/Cargo.toml`, `crates/server/src/main.rs`
- Test: dans les deux fichiers

**Interfaces:**
- Consumes: `Output`, `Line`, `Span`, `Style`
- Produces: `ansi::render(&Output) -> Vec<u8>`, `ansi::CLEAR: &[u8]`, `editor::decode(&[u8]) -> Vec<Key>`, `editor::Key::{Char(char),Backspace,Enter,Tab,Up,Down,CtrlC,CtrlD,Ignored}`, `editor::LineEditor` avec `apply(&mut self, Key) -> Action`, `Action::{Redraw,Submit(String),Complete(String),Quit,None}`

- [ ] **Step 1: Écrire le test qui échoue**

`crates/server/src/ansi.rs` :

```rust
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
        assert_eq!(String::from_utf8_lossy(&render(&out)), "\x1b[2mdim\x1b[0m\r\n");
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
                    Span { text: "name".to_string(), style: Style::Plain },
                    Span { text: "  title".to_string(), style: Style::Dim },
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
```

`crates/server/src/editor.rs` :

```rust
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
```

- [ ] **Step 2: Le lancer et vérifier qu'il échoue**

Run: `cargo test -p knockport-server`
Expected: FAIL, `cannot find function render`, `cannot find type LineEditor`

- [ ] **Step 3: Écrire ansi.rs**

```rust
use knockport_core::{Output, Style};

pub const CLEAR: &[u8] = b"\x1b[2J\x1b[H";

fn code(style: Style) -> &'static str {
    match style {
        Style::Plain => "",
        Style::Dim => "\x1b[2m",
        Style::Bold => "\x1b[1m",
        Style::Accent => "\x1b[36m",
    }
}

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
```

- [ ] **Step 4: Écrire editor.rs**

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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
pub enum Action {
    None,
    Redraw,
    Submit(String),
    Complete(String),
    Quit,
}

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
pub struct LineEditor {
    buffer: String,
    history: Vec<String>,
    position: Option<usize>,
}

impl LineEditor {
    pub fn buffer(&self) -> &str {
        &self.buffer
    }

    pub fn remember(&mut self, entry: &str) {
        self.history.push(entry.to_string());
        self.position = None;
    }

    pub fn set_buffer(&mut self, value: &str) {
        self.buffer = value.to_string();
    }

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
```

`crates/server/Cargo.toml` :

```toml
[package]
name = "knockport-server"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true

[dependencies]
knockport-core = { path = "../core" }
russh = "0.62.5"
axum = "0.8.9"
tokio = { workspace = true, features = ["full"] }
serde = { workspace = true }
serde_json = { workspace = true }
anyhow = { workspace = true }
lettre = { version = "0.11.23", default-features = false, features = ["smtp-transport", "builder", "tokio1-rustls", "ring"] }
blake3 = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
```

`crates/server/src/main.rs` provisoire :

```rust
mod ansi;
mod editor;

fn main() {
    println!("knockport server");
}
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `cargo test -p knockport-server`
Expected: PASS, 12 tests

- [ ] **Step 6: Commit**

```bash
git add crates/server/
git commit -m "feat(server): ansi renderer and line editor, both pure"
```

---

### Task 9: Journal, empreinte d'IP et limite de débit

**Files:**
- Create: `crates/server/src/journal.rs`, `crates/server/src/ratelimit.rs`
- Modify: `crates/server/src/main.rs`
- Test: dans les deux fichiers

**Interfaces:**
- Consumes: `knockport_core::Event`
- Produces: `journal::fingerprint(ip: &str, salt: &str) -> String`, `journal::Journal::new(path: PathBuf) -> Journal`, `journal::Journal::append(&self, record: &SessionRecord) -> anyhow::Result<()>`, `SessionRecord { fingerprint, started_at, events, egg_found }`, `ratelimit::RateLimiter::new(max: usize, window_secs: u64)`, `RateLimiter::check(&self, key: &str, now_secs: u64) -> bool`

- [ ] **Step 1: Écrire le test qui échoue**

`crates/server/src/ratelimit.rs` :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_up_to_the_limit_then_refuses() {
        let limiter = RateLimiter::new(3, 3600);
        assert!(limiter.check("abc", 0));
        assert!(limiter.check("abc", 1));
        assert!(limiter.check("abc", 2));
        assert!(!limiter.check("abc", 3));
    }

    #[test]
    fn the_window_slides() {
        let limiter = RateLimiter::new(1, 60);
        assert!(limiter.check("abc", 0));
        assert!(!limiter.check("abc", 59));
        assert!(limiter.check("abc", 61));
    }

    #[test]
    fn keys_do_not_share_a_budget() {
        let limiter = RateLimiter::new(1, 60);
        assert!(limiter.check("abc", 0));
        assert!(limiter.check("def", 0));
    }
}
```

`crates/server/src/journal.rs` :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_is_stable_and_hides_the_address() {
        let a = fingerprint("81.20.3.4", "pepper");
        let b = fingerprint("81.20.3.4", "pepper");
        assert_eq!(a, b);
        assert!(!a.contains("81.20"));
        assert_eq!(a.len(), 16);
    }

    #[test]
    fn a_different_salt_gives_a_different_fingerprint() {
        assert_ne!(fingerprint("81.20.3.4", "pepper"), fingerprint("81.20.3.4", "salt"));
    }

    #[test]
    fn append_writes_one_json_line_per_record() {
        let dir = std::env::temp_dir().join(format!("knockport-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sessions.jsonl");
        let journal = Journal::new(path.clone());

        let record = SessionRecord {
            fingerprint: "deadbeefdeadbeef".to_string(),
            started_at: 1_700_000_000,
            egg_found: true,
            events: vec![knockport_core::Event { at_ms: 12, input: "ls".to_string(), ok: true }],
        };
        journal.append(&record).unwrap();
        journal.append(&record).unwrap();

        let written = std::fs::read_to_string(&path).unwrap();
        assert_eq!(written.lines().count(), 2);
        assert!(written.contains("deadbeefdeadbeef"));
        assert!(!written.contains("81.20"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
```

- [ ] **Step 2: Le lancer et vérifier qu'il échoue**

Run: `cargo test -p knockport-server ratelimit journal`
Expected: FAIL, `cannot find type RateLimiter`

- [ ] **Step 3: Écrire ratelimit.rs**

```rust
use std::collections::HashMap;
use std::sync::Mutex;

pub struct RateLimiter {
    max: usize,
    window_secs: u64,
    hits: Mutex<HashMap<String, Vec<u64>>>,
}

impl RateLimiter {
    pub fn new(max: usize, window_secs: u64) -> Self {
        RateLimiter { max, window_secs, hits: Mutex::new(HashMap::new()) }
    }

    pub fn check(&self, key: &str, now_secs: u64) -> bool {
        let mut hits = self.hits.lock().expect("rate limiter mutex");
        let entry = hits.entry(key.to_string()).or_default();
        entry.retain(|at| now_secs.saturating_sub(*at) < self.window_secs);
        if entry.len() >= self.max {
            return false;
        }
        entry.push(now_secs);
        true
    }
}
```

- [ ] **Step 4: Écrire journal.rs**

```rust
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use knockport_core::Event;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SessionRecord {
    pub fingerprint: String,
    pub started_at: u64,
    pub egg_found: bool,
    pub events: Vec<Event>,
}

pub fn fingerprint(ip: &str, salt: &str) -> String {
    let digest = blake3::hash(format!("{salt}:{ip}").as_bytes());
    digest.to_hex()[..16].to_string()
}

pub struct Journal {
    path: PathBuf,
    lock: Mutex<()>,
}

impl Journal {
    pub fn new(path: PathBuf) -> Self {
        Journal { path, lock: Mutex::new(()) }
    }

    pub fn append(&self, record: &SessionRecord) -> anyhow::Result<()> {
        let line = serde_json::to_string(record)?;
        let _guard = self.lock.lock().expect("journal mutex");
        let mut file = OpenOptions::new().create(true).append(true).open(&self.path)?;
        writeln!(file, "{line}")?;
        Ok(())
    }
}
```

Déclarer `mod journal;` et `mod ratelimit;` dans `main.rs`.

- [ ] **Step 5: Vérifier que les tests passent**

Run: `cargo test -p knockport-server`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crates/server/
git commit -m "feat(server): salted fingerprints, jsonl journal and rate limiting"
```

---

### Task 10: HTTP, envoi du message et page accessible

**Files:**
- Create: `crates/server/src/http.rs`, `crates/server/src/mail.rs`, `crates/server/src/profile.rs`, `crates/server/src/config.rs`
- Modify: `crates/server/src/main.rs`, `crates/server/Cargo.toml`
- Test: `crates/server/tests/http.rs`

**Interfaces:**
- Consumes: `ContactPayload`, `Content`, `RateLimiter`, `Journal`
- Produces: `config::Config::from_env() -> anyhow::Result<Config>` avec `ssh_addr`, `http_addr`, `host_key_path`, `ip_salt`, `journal_path`, `cv_url`, `book_url`, `smtp_url`, `mail_to`; `http::router(state: AppState) -> axum::Router`; `ContactSink` trait avec `async fn send(&self, payload: &ContactPayload, fingerprint: &str) -> anyhow::Result<()>`; `mail::SmtpSink`; `profile::render(&Content) -> String`

- [ ] **Step 1: Écrire le test qui échoue**

`crates/server/tests/http.rs` :

```rust
use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::http::{Request, StatusCode};
use knockport_core::ContactPayload;
use knockport_server::http::{AppState, ContactSink, router};
use tower::ServiceExt;

#[derive(Default)]
struct Recorder {
    sent: Mutex<Vec<ContactPayload>>,
}

#[async_trait::async_trait]
impl ContactSink for Recorder {
    async fn send(&self, payload: &ContactPayload, _fingerprint: &str) -> anyhow::Result<()> {
        self.sent.lock().unwrap().push(payload.clone());
        Ok(())
    }
}

fn post(body: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/api/contact")
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

#[tokio::test]
async fn a_valid_message_is_accepted_and_forwarded() {
    let recorder = Arc::new(Recorder::default());
    let app = router(AppState::for_test(recorder.clone()));

    let body = r#"{"name":"Seema","email":"seema@example.com",
        "message":"we have a role that fits, are you free thursday","journal":[],"egg_found":false}"#;
    let response = app.oneshot(post(body)).await.unwrap();

    assert_eq!(response.status(), StatusCode::ACCEPTED);
    assert_eq!(recorder.sent.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn a_bad_email_is_rejected_and_never_forwarded() {
    let recorder = Arc::new(Recorder::default());
    let app = router(AppState::for_test(recorder.clone()));

    let body = r#"{"name":"Seema","email":"nope",
        "message":"we have a role that fits, are you free thursday","journal":[],"egg_found":false}"#;
    let response = app.oneshot(post(body)).await.unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(recorder.sent.lock().unwrap().is_empty());
}

#[tokio::test]
async fn the_fourth_message_in_an_hour_is_refused() {
    let recorder = Arc::new(Recorder::default());
    let state = AppState::for_test(recorder.clone());
    let body = r#"{"name":"Seema","email":"seema@example.com",
        "message":"we have a role that fits, are you free thursday","journal":[],"egg_found":false}"#;

    for _ in 0..3 {
        let response = router(state.clone()).oneshot(post(body)).await.unwrap();
        assert_eq!(response.status(), StatusCode::ACCEPTED);
    }
    let response = router(state.clone()).oneshot(post(body)).await.unwrap();
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(recorder.sent.lock().unwrap().len(), 3);
}

#[tokio::test]
async fn the_profile_page_carries_the_content_without_javascript() {
    let recorder = Arc::new(Recorder::default());
    let app = router(AppState::for_test(recorder));

    let response = app
        .oneshot(Request::builder().uri("/profile").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html = String::from_utf8_lossy(&body);
    assert!(html.contains("Guillaume Flambard"));
    assert!(!html.contains("<script"), "the accessible page must not need javascript");
}
```

Ajouter aux `[dev-dependencies]` de `crates/server` : `tower = "0.5"`, `async-trait = "0.1"`, et déplacer `async-trait` en dépendance normale puisque `ContactSink` en a besoin.

- [ ] **Step 2: Le lancer et vérifier qu'il échoue**

Run: `cargo test -p knockport-server --test http`
Expected: FAIL, `unresolved import knockport_server::http`

- [ ] **Step 3: Transformer server en lib plus binaire**

Créer `crates/server/src/lib.rs` :

```rust
pub mod ansi;
pub mod config;
pub mod editor;
pub mod http;
pub mod journal;
pub mod mail;
pub mod profile;
pub mod ratelimit;
pub mod ssh;
```

et réduire `main.rs` à l'assemblage. Sans cette étape, le test d'intégration ne peut rien importer.

- [ ] **Step 4: Écrire http.rs**

```rust
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{ConnectInfo, State};
use axum::http::StatusCode;
use axum::response::Html;
use axum::routing::{get, post};
use axum::{Json, Router};
use knockport_core::{Content, ContactPayload};
use serde::Deserialize;

use crate::journal::{Journal, fingerprint};
use crate::ratelimit::RateLimiter;

#[async_trait::async_trait]
pub trait ContactSink: Send + Sync {
    async fn send(&self, payload: &ContactPayload, fingerprint: &str) -> anyhow::Result<()>;
}

#[derive(Clone)]
pub struct AppState {
    pub sink: Arc<dyn ContactSink>,
    pub limiter: Arc<RateLimiter>,
    pub journal: Arc<Journal>,
    pub content: Arc<Content>,
    pub salt: String,
}

impl AppState {
    pub fn for_test(sink: Arc<dyn ContactSink>) -> Self {
        AppState {
            sink,
            limiter: Arc::new(RateLimiter::new(3, 3600)),
            journal: Arc::new(Journal::new(std::env::temp_dir().join("knockport-test.jsonl"))),
            content: Arc::new(Content::load()),
            salt: "test-salt".to_string(),
        }
    }
}

#[derive(Deserialize)]
pub struct ContactRequest {
    pub name: String,
    pub email: String,
    pub message: String,
    #[serde(default)]
    pub journal: Vec<knockport_core::Event>,
    #[serde(default)]
    pub egg_found: bool,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/contact", post(contact))
        .route("/profile", get(profile))
        .with_state(state)
}

async fn profile(State(state): State<AppState>) -> Html<String> {
    Html(crate::profile::render(&state.content))
}

async fn contact(
    State(state): State<AppState>,
    connect: Option<ConnectInfo<std::net::SocketAddr>>,
    Json(request): Json<ContactRequest>,
) -> StatusCode {
    use knockport_core::commands::contact::{valid_email, valid_message};

    if request.name.trim().is_empty()
        || !valid_email(&request.email)
        || !valid_message(&request.message)
    {
        return StatusCode::BAD_REQUEST;
    }

    let ip = connect
        .map(|c| c.0.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let print = fingerprint(&ip, &state.salt);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock before the epoch")
        .as_secs();

    if !state.limiter.check(&print, now) {
        return StatusCode::TOO_MANY_REQUESTS;
    }

    let payload = ContactPayload {
        name: request.name,
        email: request.email,
        message: request.message,
        journal: request.journal,
        egg_found: request.egg_found,
    };

    match state.sink.send(&payload, &print).await {
        Ok(()) => StatusCode::ACCEPTED,
        Err(error) => {
            tracing::error!(?error, "contact delivery failed");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}
```

Le test de limite de débit reconstruit le routeur mais partage l'`AppState`, donc le compteur survit d'un appel à l'autre. C'est voulu.

- [ ] **Step 5: Écrire profile.rs**

```rust
use knockport_core::{Content, Dir};

pub fn render(content: &Content) -> String {
    let mut body = String::from(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">\
         <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\
         <title>Guillaume Flambard</title></head><body>\
         <h1>Guillaume Flambard</h1>\
         <p>This is the plain version of the terminal at knockport.com. \
         Same content, no game, no JavaScript.</p>",
    );
    walk(&content.root, 2, &mut body);
    body.push_str("</body></html>");
    body
}

fn walk(dir: &Dir, depth: usize, out: &mut String) {
    for file in &dir.files {
        if file.hidden {
            continue;
        }
        out.push_str(&format!("<h{depth}>{}</h{depth}>", escape(&file.title)));
        for paragraph in file.body.split("\n\n") {
            out.push_str(&format!("<p>{}</p>", escape(paragraph)));
        }
    }
    for child in &dir.dirs {
        out.push_str(&format!("<h{depth}>{}</h{depth}>", escape(&child.name)));
        walk(child, (depth + 1).min(6), out);
    }
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}
```

- [ ] **Step 6: Écrire mail.rs et config.rs**

```rust
// mail.rs
use knockport_core::ContactPayload;
use lettre::message::header::ContentType;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

use crate::http::ContactSink;

pub struct SmtpSink {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    to: String,
}

impl SmtpSink {
    pub fn new(smtp_url: &str, to: String) -> anyhow::Result<Self> {
        Ok(SmtpSink {
            transport: AsyncSmtpTransport::<Tokio1Executor>::from_url(smtp_url)?.build(),
            to,
        })
    }
}

#[async_trait::async_trait]
impl ContactSink for SmtpSink {
    async fn send(&self, payload: &ContactPayload, fingerprint: &str) -> anyhow::Result<()> {
        let mut trail = String::new();
        for event in &payload.journal {
            trail.push_str(&format!(
                "  {:>6}ms  {}{}\n",
                event.at_ms,
                event.input,
                if event.ok { "" } else { "   (missed)" }
            ));
        }

        let body = format!(
            "From: {} <{}>\n\n{}\n\n---\nvisitor: {fingerprint}\nfound the hidden file: {}\n\nwhat they read:\n{}",
            payload.name,
            payload.email,
            payload.message,
            if payload.egg_found { "yes" } else { "no" },
            trail
        );

        let email = Message::builder()
            .from(format!("knockport <{}>", self.to).parse()?)
            .reply_to(format!("{} <{}>", payload.name, payload.email).parse()?)
            .to(self.to.parse()?)
            .subject(format!("knockport: {}", payload.name))
            .header(ContentType::TEXT_PLAIN)
            .body(body)?;

        self.transport.send(email).await?;
        Ok(())
    }
}
```

```rust
// config.rs
use std::path::PathBuf;

pub struct Config {
    pub ssh_addr: String,
    pub http_addr: String,
    pub host_key_path: PathBuf,
    pub ip_salt: String,
    pub journal_path: PathBuf,
    pub cv_url: String,
    pub book_url: String,
    pub smtp_url: String,
    pub mail_to: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        fn required(key: &str) -> anyhow::Result<String> {
            std::env::var(key).map_err(|_| anyhow::anyhow!("{key} must be set"))
        }
        fn optional(key: &str, fallback: &str) -> String {
            std::env::var(key).unwrap_or_else(|_| fallback.to_string())
        }

        Ok(Config {
            ssh_addr: optional("KNOCKPORT_SSH_ADDR", "0.0.0.0:22"),
            http_addr: optional("KNOCKPORT_HTTP_ADDR", "127.0.0.1:8080"),
            host_key_path: PathBuf::from(optional(
                "KNOCKPORT_HOST_KEY",
                "/var/lib/knockport/host_key",
            )),
            ip_salt: required("KNOCKPORT_IP_SALT")?,
            journal_path: PathBuf::from(optional(
                "KNOCKPORT_JOURNAL",
                "/var/lib/knockport/sessions.jsonl",
            )),
            cv_url: required("KNOCKPORT_CV_URL")?,
            book_url: required("KNOCKPORT_BOOK_URL")?,
            smtp_url: required("KNOCKPORT_SMTP_URL")?,
            mail_to: required("KNOCKPORT_MAIL_TO")?,
        })
    }
}
```

Rendre `commands` public dans `crates/core/src/lib.rs` (`pub mod commands;`) pour que `valid_email` soit atteignable depuis le serveur.

- [ ] **Step 7: Vérifier que les tests passent**

Run: `cargo test -p knockport-server`
Expected: PASS, 4 tests d'intégration plus les tests unitaires

- [ ] **Step 8: Commit**

```bash
git add crates/server/ crates/core/
git commit -m "feat(server): contact endpoint, smtp delivery and javascript-free profile page"
```

---

### Task 11: La façade SSH

**Files:**
- Create: `crates/server/src/ssh.rs`
- Modify: `crates/server/src/main.rs`
- Test: vérification manuelle documentée, plus un test unitaire sur la substitution d'URL

**Interfaces:**
- Consumes: `Config`, `Content`, `Session`, `execute`, `complete`, `ansi`, `editor`, `Journal`
- Produces: `ssh::serve(config: Arc<Config>, content: Arc<Content>, journal: Arc<Journal>, sink: Arc<dyn ContactSink>, limiter: Arc<RateLimiter>) -> anyhow::Result<()>`, `ssh::substitute(marker: &str, cv_url: &str, book_url: &str) -> String`

Le puits d'envoi et la limite de débit sont ceux de `AppState`, passés par référence partagée. Deux chemins d'envoi voudraient dire deux limites à maintenir, donc un jour une seule des deux appliquée.

Signatures relevées dans les sources de `russh 0.62.5` (`examples/echoserver.rs` et `examples/ratatui_app.rs`), pas dans une documentation de seconde main.

- [ ] **Step 1: Écrire le test qui échoue**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_url_effect_is_substituted_before_printing() {
        let rendered = substitute("{{cv_url}}", "https://knockport.com/cv.pdf", "https://cal.example/g");
        assert_eq!(rendered, "https://knockport.com/cv.pdf");
        let rendered = substitute("{{book_url}}", "https://knockport.com/cv.pdf", "https://cal.example/g");
        assert_eq!(rendered, "https://cal.example/g");
    }

    #[test]
    fn an_unknown_marker_is_returned_untouched() {
        assert_eq!(substitute("https://example.com", "a", "b"), "https://example.com");
    }
}
```

- [ ] **Step 2: Le lancer et vérifier qu'il échoue**

Run: `cargo test -p knockport-server ssh`
Expected: FAIL, `cannot find function substitute`

- [ ] **Step 3: Écrire ssh.rs**

```rust
use std::sync::Arc;
use std::time::Instant;

use knockport_core::{Content, Effect, Output, Session, complete, execute};
use russh::keys::PrivateKey;
use russh::server::{Auth, Config as SshConfig, Handler, Msg, Server as _, Session as SshSession};
use russh::{Channel, ChannelId};
use tokio::net::TcpListener;
use tokio::sync::mpsc::{UnboundedSender, unbounded_channel};

use crate::ansi;
use crate::config::Config;
use crate::editor::{Action, LineEditor, decode};
use crate::http::ContactSink;
use crate::journal::{Journal, SessionRecord, fingerprint};
use crate::ratelimit::RateLimiter;

pub fn substitute(marker: &str, cv_url: &str, book_url: &str) -> String {
    match marker {
        knockport_core::commands::contact::CV_URL => cv_url.to_string(),
        knockport_core::commands::contact::BOOK_URL => book_url.to_string(),
        other => other.to_string(),
    }
}

struct Writer {
    sender: UnboundedSender<Vec<u8>>,
}

impl Writer {
    fn start(handle: russh::server::Handle, channel: ChannelId) -> Self {
        let (sender, mut receiver) = unbounded_channel::<Vec<u8>>();
        tokio::spawn(async move {
            while let Some(data) = receiver.recv().await {
                if handle.data(channel, data.into()).await.is_err() {
                    break;
                }
            }
        });
        Writer { sender }
    }

    fn send(&self, bytes: Vec<u8>) {
        let _ = self.sender.send(bytes);
    }
}

#[derive(Clone)]
pub struct KnockportServer {
    config: Arc<Config>,
    content: Arc<Content>,
    journal: Arc<Journal>,
    sink: Arc<dyn ContactSink>,
    limiter: Arc<RateLimiter>,
}

pub struct Connection {
    config: Arc<Config>,
    content: Arc<Content>,
    journal: Arc<Journal>,
    sink: Arc<dyn ContactSink>,
    limiter: Arc<RateLimiter>,
    session: Session,
    editor: LineEditor,
    writer: Option<Writer>,
    started: Instant,
    peer: Option<std::net::SocketAddr>,
}

impl russh::server::Server for KnockportServer {
    type Handler = Connection;

    fn new_client(&mut self, peer: Option<std::net::SocketAddr>) -> Connection {
        Connection {
            config: self.config.clone(),
            content: self.content.clone(),
            journal: self.journal.clone(),
            sink: self.sink.clone(),
            limiter: self.limiter.clone(),
            session: Session::new(),
            editor: LineEditor::default(),
            writer: None,
            started: Instant::now(),
            peer,
        }
    }
}

impl Connection {
    fn write(&self, bytes: Vec<u8>) {
        if let Some(writer) = &self.writer {
            writer.send(bytes);
        }
    }

    fn prompt(&self) {
        self.write(format!("\r\x1b[K{}{}", self.session.prompt(), self.editor.buffer()).into_bytes());
    }

    fn print(&mut self, output: &Output) {
        self.write(ansi::render(output));
    }

    fn banner(&self) -> Vec<u8> {
        let banner = include_str!("../../../brand/ascii-banner.txt");
        banner.replace('\n', "\r\n").into_bytes()
    }

    fn fingerprint(&self) -> String {
        let ip = self.peer.map(|p| p.ip().to_string()).unwrap_or_else(|| "unknown".to_string());
        fingerprint(&ip, &self.config.ip_salt)
    }

    /// Le SSH et le web passent par le même puits et la même limite de débit.
    /// Deux chemins d'envoi voudraient dire deux limites à maintenir, donc un jour une seule.
    async fn deliver(&self, payload: &knockport_core::ContactPayload) -> &'static str {
        let print = self.fingerprint();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or_default();

        if !self.limiter.check(&print, now) {
            return "That is a lot of messages for one hour. Try again later.";
        }

        match self.sink.send(payload, &print).await {
            Ok(()) => "Sent. I read everything, and I answer.",
            Err(error) => {
                tracing::error!(?error, "contact delivery failed over ssh");
                "The message did not go through. Reach me at g.flambard@gmail.com."
            }
        }
    }

    fn persist(&self) {
        let record = SessionRecord {
            fingerprint: self.fingerprint(),
            started_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or_default(),
            egg_found: self.session.egg_found,
            events: self.session.journal.clone(),
        };
        if let Err(error) = self.journal.append(&record) {
            tracing::warn!(?error, "could not persist the session");
        }
    }
}

impl Handler for Connection {
    type Error = russh::Error;

    async fn auth_none(&mut self, _user: &str) -> Result<Auth, Self::Error> {
        Ok(Auth::Accept)
    }

    async fn auth_publickey(
        &mut self,
        _user: &str,
        _key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<Auth, Self::Error> {
        Ok(Auth::Accept)
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<Msg>,
        reply: russh::server::ChannelOpenHandle,
        session: &mut SshSession,
    ) -> Result<(), Self::Error> {
        self.writer = Some(Writer::start(session.handle(), channel.id()));
        reply.accept().await;
        Ok(())
    }

    async fn shell_request(
        &mut self,
        _channel: ChannelId,
        _session: &mut SshSession,
    ) -> Result<(), Self::Error> {
        let banner = self.banner();
        self.write(banner);
        self.prompt();
        Ok(())
    }

    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        session: &mut SshSession,
    ) -> Result<(), Self::Error> {
        for key in decode(data) {
            match self.editor.apply(key) {
                Action::Redraw => self.prompt(),
                Action::None => {}
                Action::Quit => {
                    self.persist();
                    session.close(channel)?;
                    return Ok(());
                }
                Action::Complete(partial) => {
                    let found = complete(&self.session, &self.content, &partial);
                    if let [only] = found.as_slice() {
                        self.editor.set_buffer(only);
                    } else if !found.is_empty() {
                        self.write(b"\r\n".to_vec());
                        self.print(&Output::text(&found.join("   ")));
                    }
                    self.prompt();
                }
                Action::Submit(line) => {
                    self.write(b"\r\n".to_vec());
                    if !line.trim().is_empty() {
                        self.editor.remember(&line);
                    }
                    let at_ms = self.started.elapsed().as_millis() as u64;
                    let output = execute(&mut self.session, &self.content, &line, at_ms);
                    self.print(&output);

                    match &output.effect {
                        Some(Effect::Clear) => self.write(ansi::CLEAR.to_vec()),
                        Some(Effect::Quit) => {
                            self.persist();
                            session.close(channel)?;
                            return Ok(());
                        }
                        Some(Effect::OpenUrl(marker)) => {
                            let url =
                                substitute(marker, &self.config.cv_url, &self.config.book_url);
                            self.print(&Output::text(&url));
                        }
                        Some(Effect::SubmitContact(payload)) => {
                            let message = self.deliver(payload).await;
                            self.print(&Output::text(message));
                        }
                        None => {}
                    }
                    self.prompt();
                }
            }
        }
        Ok(())
    }
}

pub async fn serve(
    config: Arc<Config>,
    content: Arc<Content>,
    journal: Arc<Journal>,
    sink: Arc<dyn ContactSink>,
    limiter: Arc<RateLimiter>,
) -> anyhow::Result<()> {
    let key = load_or_create_host_key(&config)?;
    let ssh_config = Arc::new(SshConfig {
        inactivity_timeout: Some(std::time::Duration::from_secs(900)),
        auth_rejection_time: std::time::Duration::from_secs(1),
        keys: vec![key],
        ..Default::default()
    });

    let listener = TcpListener::bind(&config.ssh_addr).await?;
    tracing::info!(addr = %config.ssh_addr, "ssh listening");

    let mut server = KnockportServer { config, content, journal, sink, limiter };
    server.run_on_socket(ssh_config, &listener).await?;
    Ok(())
}

fn load_or_create_host_key(config: &Config) -> anyhow::Result<PrivateKey> {
    if config.host_key_path.exists() {
        let pem = std::fs::read_to_string(&config.host_key_path)?;
        return Ok(PrivateKey::from_openssh(&pem)?);
    }
    let key = PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519)?;
    if let Some(parent) = config.host_key_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(
        &config.host_key_path,
        key.to_openssh(russh::keys::ssh_key::LineEnding::LF)?.as_bytes(),
    )?;
    Ok(key)
}
```

Ajouter `rand = "0.9"` aux dépendances du serveur.

- [ ] **Step 4: Écrire main.rs**

```rust
use std::sync::Arc;

use knockport_core::Content;
use knockport_server::config::Config;
use knockport_server::journal::Journal;
use knockport_server::{http, mail, ssh};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let config = Arc::new(Config::from_env()?);
    let content = Arc::new(Content::load());
    let journal = Arc::new(Journal::new(config.journal_path.clone()));
    let sink: Arc<dyn http::ContactSink> =
        Arc::new(mail::SmtpSink::new(&config.smtp_url, config.mail_to.clone())?);
    let limiter = Arc::new(knockport_server::ratelimit::RateLimiter::new(3, 3600));

    let state = http::AppState {
        sink: sink.clone(),
        limiter: limiter.clone(),
        journal: journal.clone(),
        content: content.clone(),
        salt: config.ip_salt.clone(),
    };

    let http_listener = tokio::net::TcpListener::bind(&config.http_addr).await?;
    let http_task = tokio::spawn(async move {
        axum::serve(
            http_listener,
            http::router(state).into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .await
    });

    let ssh_task = tokio::spawn(ssh::serve(config, content, journal, sink, limiter));

    tokio::select! {
        result = http_task => result??,
        result = ssh_task => result??,
    }
    Ok(())
}
```

- [ ] **Step 5: Vérifier en local**

```bash
KNOCKPORT_SSH_ADDR=127.0.0.1:2222 \
KNOCKPORT_HTTP_ADDR=127.0.0.1:8080 \
KNOCKPORT_HOST_KEY=/tmp/knockport_host_key \
KNOCKPORT_IP_SALT=dev \
KNOCKPORT_JOURNAL=/tmp/knockport.jsonl \
KNOCKPORT_CV_URL=https://example.com/cv.pdf \
KNOCKPORT_BOOK_URL=https://example.com/book \
KNOCKPORT_SMTP_URL=smtp://localhost:1025 \
KNOCKPORT_MAIL_TO=g.flambard@gmail.com \
cargo run -p knockport-server
```

Dans un second terminal : `ssh -p 2222 -o StrictHostKeyChecking=no visitor@127.0.0.1`

Liste de vérification manuelle, chaque point doit passer :

1. La bannière ASCII s'affiche, alignée, sans caractère cassé.
2. `ls` liste les dossiers puis les fichiers, avec les titres en gris.
3. `cd projects` change l'invite, `cd ..` revient.
4. `cat whoami` affiche le texte.
5. Tab après `cd pro` complète en `cd projects`.
6. Flèche haut rappelle la commande précédente.
7. `ls -a` révèle `.knock`, `cat .knock` affiche le bonus.
8. `contact` pose trois questions, une adresse invalide fait redemander.
9. `clear` nettoie l'écran, `exit` ferme la session.
10. `cat /etc/passwd` répond `no such file`, jamais le contenu du disque.

Le point 10 n'est pas une politesse : il vérifie que le système de fichiers virtuel ne fuit pas vers le vrai.

- [ ] **Step 6: Commit**

```bash
git add crates/server/
git commit -m "feat(server): ssh frontend over russh"
```

---

### Task 12: La façade web en Dioxus

**Files:**
- Create: `crates/web/src/main.rs`, `crates/web/src/terminal.rs`, `crates/web/assets/main.css`, `crates/web/Dioxus.toml`
- Modify: `crates/web/Cargo.toml`
- Test: vérification manuelle documentée plus la compilation WebAssembly

**Interfaces:**
- Consumes: `knockport_core::{Content, Session, execute, complete, Effect, Output}`
- Produces: le bundle statique servi par axum

- [ ] **Step 1: Écrire Cargo.toml et Dioxus.toml**

```toml
[package]
name = "knockport-web"
version = "0.1.0"
edition.workspace = true

[dependencies]
knockport-core = { path = "../core" }
dioxus = { version = "0.7.10", features = ["web"] }
serde = { workspace = true }
serde_json = { workspace = true }
web-sys = { version = "0.3", features = ["Window", "Performance"] }
```

```toml
# Dioxus.toml
[application]
name = "knockport"

[web.app]
title = "knockport"

[web.resource]
style = ["main.css"]
```

- [ ] **Step 2: Écrire le composant terminal**

```rust
use dioxus::prelude::*;
use knockport_core::{Content, Effect, Line, Output, Session, complete, execute};

#[component]
pub fn Terminal() -> Element {
    let content = use_signal(Content::load);
    let mut session = use_signal(Session::new);
    let mut printed = use_signal(Vec::<Line>::new);
    let mut input = use_signal(String::new);

    let submit = move |_| {
        let typed = input();
        let prompt = session.read().prompt();
        printed.write().push(Line::plain(&format!("{prompt}{typed}")));

        let at_ms = now_ms();
        let output: Output = execute(&mut session.write(), &content.read(), &typed, at_ms);
        printed.write().extend(output.lines.clone());

        match output.effect {
            Some(Effect::Clear) => printed.write().clear(),
            Some(Effect::OpenUrl(marker)) => open(&marker),
            Some(Effect::SubmitContact(payload)) => post_contact(payload),
            Some(Effect::Quit) => printed.write().push(Line::plain("Session closed. Reload to start again.")),
            None => {}
        }
        input.set(String::new());
    };

    rsx! {
        document::Link { rel: "stylesheet", href: asset!("/assets/main.css") }
        main { class: "terminal",
            a { class: "skip", href: "/profile", "Plain, accessible version of this page" }
            pre { class: "scrollback", "aria-live": "polite", "aria-atomic": "false",
                for line in printed.read().iter() {
                    "{flatten(line)}\n"
                }
            }
            form { class: "prompt", onsubmit: submit,
                label { r#for: "cmd", class: "visually-hidden", "Type a command" }
                span { class: "sigil", "{session.read().prompt()}" }
                input {
                    id: "cmd",
                    autofocus: true,
                    autocomplete: "off",
                    value: "{input}",
                    oninput: move |event| input.set(event.value()),
                    onkeydown: move |event| {
                        if event.key() == Key::Tab {
                            event.prevent_default();
                            let found = complete(&session.read(), &content.read(), &input());
                            if let [only] = found.as_slice() {
                                input.set(only.clone());
                            }
                        }
                    },
                }
            }
        }
    }
}

fn flatten(line: &Line) -> String {
    line.spans.iter().map(|s| s.text.as_str()).collect()
}

fn now_ms() -> u64 {
    web_sys::window()
        .and_then(|w| w.performance())
        .map(|p| p.now() as u64)
        .unwrap_or(0)
}
```

Les deux fonctions restantes, dans le même fichier. Aucun client HTTP en plus, `web_sys` suffit :

```rust
fn open(marker: &str) {
    // Le core ne connaît pas les URL, il émet un marqueur. Le serveur les sert
    // sur des chemins fixes, donc la façade web n'a pas de configuration.
    let url = match marker {
        knockport_core::commands::contact::CV_URL => "/cv.pdf",
        knockport_core::commands::contact::BOOK_URL => "/book",
        other => other,
    };
    if let Some(window) = web_sys::window() {
        let _ = window.open_with_url_and_target(url, "_blank");
    }
}

fn post_contact(payload: knockport_core::ContactPayload) {
    let Ok(body) = serde_json::to_string(&payload) else {
        return;
    };
    let Some(window) = web_sys::window() else {
        return;
    };

    let headers = web_sys::Headers::new().expect("headers");
    let _ = headers.append("content-type", "application/json");

    let init = web_sys::RequestInit::new();
    init.set_method("POST");
    init.set_headers(&headers);
    init.set_body(&wasm_bindgen::JsValue::from_str(&body));

    let _ = window.fetch_with_str_and_init("/api/contact", &init);
}
```

Ajouter aux fonctionnalités de `web-sys` : `Headers`, `Request`, `RequestInit`, `Response`, et la dépendance `wasm-bindgen = "0.2"`.

Note sur `/book` : le serveur répond par une redirection 302 vers `KNOCKPORT_BOOK_URL`, ce qui évite de recompiler le WebAssembly le jour où l'URL de rendez-vous change.

La couleur vient d'une classe CSS par variante de `Style`, jamais d'un style calculé en Rust.

- [ ] **Step 3: Écrire la feuille de style**

`crates/web/assets/main.css` :

```css
:root { --bg: #0b0d0e; --fg: #e8e6e1; --dim: #7d8285; --accent: #7fd6d1; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 15px/1.55 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}

.terminal { max-width: 78ch; margin: 0 auto; padding: 24px 16px 64px; }
.scrollback { white-space: pre-wrap; word-break: break-word; margin: 0 0 12px; }
.prompt { display: flex; gap: 8px; align-items: baseline; }
.sigil { color: var(--accent); white-space: pre; }

input {
  flex: 1;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  padding: 0;
}
input:focus { outline: 2px solid var(--accent); outline-offset: 4px; }

.dim { color: var(--dim); }
.bold { font-weight: 600; }
.accent { color: var(--accent); }

/* Le lien vers la version accessible est le premier élément atteignable
   au clavier, et il devient visible dès qu'il a le focus. */
.skip { position: absolute; left: -9999px; color: var(--accent); }
.skip:focus { position: static; display: block; margin-bottom: 16px; }

.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

@media (prefers-color-scheme: light) {
  :root { --bg: #f7f6f3; --fg: #14171a; --dim: #6b7175; --accent: #0f6f77; }
}
```

- [ ] **Step 4: Compiler et vérifier**

Run: `cargo install dioxus-cli --version 0.7.10` puis `dx build -p knockport-web --release`
Expected: un bundle produit sous `target/dx/knockport-web/release/web/public`

Liste de vérification manuelle :

1. Le focus arrive dans le champ au chargement.
2. Une commande tapée s'affiche avec son invite, puis sa sortie.
3. Tab complète, Entrée valide.
4. Le lecteur d'écran de macOS (VoiceOver, `cmd+F5`) annonce la sortie sans qu'on ait à naviguer.
5. Le lien vers `/profile` est le premier élément atteignable au clavier.
6. `/profile` affiche tout le contenu avec JavaScript désactivé.

- [ ] **Step 5: Servir le bundle et le PDF depuis axum**

Ajouter `tower-http = { version = "0.6", features = ["fs"] }` aux dépendances du serveur, deux champs à `Config` (`web_dir: PathBuf` depuis `KNOCKPORT_WEB_DIR`, `cv_file: PathBuf` depuis `KNOCKPORT_CV_FILE`), et trois champs à `AppState` (`web_dir: PathBuf`, `cv_file: PathBuf`, `book_url: String`, remplis par `for_test` avec `std::env::temp_dir()` et une URL bidon), puis dans `router` :

```rust
use axum::response::Redirect;
use tower_http::services::{ServeDir, ServeFile};

pub fn router(state: AppState) -> Router {
    let web_dir = state.web_dir.clone();
    let cv_file = state.cv_file.clone();
    let book_url = state.book_url.clone();

    Router::new()
        .route("/api/contact", post(contact))
        .route("/profile", get(profile))
        .route("/book", get(move || async move { Redirect::temporary(&book_url) }))
        .route_service("/cv.pdf", ServeFile::new(cv_file))
        .fallback_service(ServeDir::new(web_dir).append_index_html_on_directories(true))
        .with_state(state)
}
```

Le test `the_profile_page_carries_the_content_without_javascript` de la tâche 10 doit continuer à passer : la route nommée gagne toujours sur le repli.

- [ ] **Step 6: Commit**

```bash
git add crates/web/ crates/server/
git commit -m "feat(web): dioxus terminal frontend with an accessible fallback"
```

---

### Task 13: Déploiement et intégration continue

**Files:**
- Create: `deploy/knockport.service`, `deploy/Caddyfile`, `deploy/provision.md`, `.github/workflows/ci.yml`, `README.md`, `AGENTS.md`, `CLAUDE.md`
- Test: la chaîne d'intégration continue elle-même

- [ ] **Step 1: Écrire le service systemd**

```ini
[Unit]
Description=knockport
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=knockport
Group=knockport
ExecStart=/usr/local/bin/knockport
EnvironmentFile=/etc/knockport.env
Restart=on-failure
RestartSec=5

AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6
RestrictNamespaces=true
LockPersonality=true
MemoryMax=256M
TasksMax=256
ReadWritePaths=/var/lib/knockport

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Écrire le Caddyfile et la rotation du journal**

```
knockport.com {
	reverse_proxy 127.0.0.1:8080
}
```

La spec fixe une rétention de trente jours pour le journal de sessions. Elle n'appartient pas au code applicatif, `logrotate` la fait mieux. `deploy/knockport.logrotate`, à déposer dans `/etc/logrotate.d/knockport` :

```
/var/lib/knockport/sessions.jsonl {
    daily
    rotate 30
    missingok
    notifempty
    copytruncate
    su knockport knockport
}
```

`copytruncate` est délibéré : le processus garde son descripteur de fichier ouvert entre deux écritures, donc une rotation par renommage lui ferait écrire dans le vide.

- [ ] **Step 3: Écrire le mode opératoire**

`deploy/provision.md`, dans cet ordre exact, le premier point avant tout le reste :

1. Ouvrir la console de secours du fournisseur dans un onglet, et la laisser ouverte.
2. `sudo sed -i 's/^#\?Port 22$/Port 2202/' /etc/ssh/sshd_config && sudo systemctl restart ssh`
3. **Depuis un second terminal**, vérifier `ssh -p 2202 root@<ip>`. Ne fermer le premier terminal qu'après cette vérification réussie.
4. `sudo ufw allow 2202/tcp && sudo ufw allow 22/tcp && sudo ufw allow 80,443/tcp && sudo ufw enable`
5. `sudo useradd --system --home /var/lib/knockport --shell /usr/sbin/nologin knockport`
6. `sudo mkdir -p /var/lib/knockport && sudo chown knockport:knockport /var/lib/knockport`
7. Écrire `/etc/knockport.env` (mode `0600`, propriétaire `root`) avec les neuf variables. Générer le sel par `openssl rand -hex 32`.
8. Copier le binaire dans `/usr/local/bin/knockport`, le service dans `/etc/systemd/system/`, puis `sudo systemctl enable --now knockport`.
9. Installer Caddy, déposer le `Caddyfile`, `sudo systemctl reload caddy`.
10. Vérifier depuis une autre machine : `ssh knockport.com` et `curl -I https://knockport.com/profile`.

- [ ] **Step 4: Écrire l'intégration continue**

```yaml
name: ci
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - run: cargo fmt --all -- --check
      - run: cargo clippy --workspace --all-targets -- -D warnings
      - run: cargo test --workspace

  wasm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - run: cargo check -p knockport-core --target wasm32-unknown-unknown

  release:
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-unknown-linux-musl
      - run: sudo apt-get update && sudo apt-get install -y musl-tools
      - run: cargo build --release -p knockport-server --target x86_64-unknown-linux-musl
      - uses: actions/upload-artifact@v4
        with:
          name: knockport
          path: target/x86_64-unknown-linux-musl/release/knockport-server
```

- [ ] **Step 5: Écrire la couche d'accueil pour les IA**

`AGENTS.md`, neutre et autonome, lisible par n'importe quel modèle :

```markdown
# AGENTS.md

knockport is a terminal portfolio. Visitors either `ssh knockport.com` or open the
website, and both replay the same walkthrough from one shared Rust core.

## Map

- `crates/core` is pure. No I/O, no clock, no filesystem, no tokio. It compiles to
  `wasm32-unknown-unknown`, and that is enforced in CI. Keep it that way.
- `crates/server` is the VPS binary: an SSH frontend on russh and an HTTP frontend
  on axum, both painting the core's `Output`.
- `crates/web` is the Dioxus frontend, the same core compiled to WebAssembly.
- `content/` is the walkthrough itself, markdown with YAML frontmatter, embedded at
  build time. A file whose frontmatter says `hidden: true` is displayed and addressed
  with a leading dot: `content/knock.md` is `.knock`.

## Rules that are not negotiable

- The core never executes anything. No `Command`, no `fork`, no disk read outside the
  embedded content. `ls` reads an in-memory tree, it is not a syscall.
- `/profile` must keep working with JavaScript disabled. It is the accessible route,
  not a nice-to-have.
- Never commit a host key, an SMTP credential or the fingerprint salt. They come from
  the environment.
- Prose in `content/` uses no em dash and no en dash.

## Commands

    cargo test --workspace
    cargo clippy --workspace --all-targets -- -D warnings
    cargo check -p knockport-core --target wasm32-unknown-unknown
    dx build -p knockport-web --release

Running locally needs nine environment variables. See `deploy/provision.md` for the
list, and use `smtp://localhost:1025` with MailHog for mail in development.
```

`CLAUDE.md` ne contient qu'une ligne, `@AGENTS.md`, pour n'avoir qu'une source de vérité. `README.md` s'adresse à un humain : ce que c'est, la commande pour entrer, comment le faire tourner en local.

Chemins relatifs au dépôt uniquement, jamais un chemin sous `~`, jamais un renvoi vers un fichier de mémoire personnel.

- [ ] **Step 6: Commit**

```bash
git add deploy/ .github/ README.md AGENTS.md CLAUDE.md
git commit -m "chore: deployment units, ci pipeline and repo documentation"
```

---

## Ce que le plan ne couvre pas encore

Ces points attendent une réponse de Guillaume et n'empêchent aucune tâche de démarrer :

- **Fournisseur du VPS.** Les tâches 1 à 12 tournent entièrement en local. Seule la tâche 13 a besoin de la machine.
- **Le PDF de CV et l'URL de rendez-vous.** Ce sont deux variables d'environnement, valeurs de test acceptées jusqu'au déploiement.
- **Les identifiants SMTP.** En développement, `smtp://localhost:1025` plus MailHog suffit.
- **L'inventaire du contenu.** La tâche 2 embarque quatre fichiers de départ pour que les tests aient de la matière. Écrire les missions et les projets réels est un travail de rédaction, pas de code, et il se fait à tout moment sans toucher au code, ce qui est exactement l'intérêt du markdown embarqué.
