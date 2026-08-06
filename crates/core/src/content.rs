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
            let parsed = matter
                .parse::<FrontMatter>(&text)
                .expect("frontmatter must parse");
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
                        cursor.dirs.push(Dir {
                            name: segment.to_string(),
                            ..Dir::default()
                        });
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
    dir.files
        .sort_by(|a, b| a.order.cmp(&b.order).then(a.name.cmp(&b.name)));
    dir.dirs.sort_by(|a, b| a.name.cmp(&b.name));
    for child in &mut dir.dirs {
        sort(child);
    }
}

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
