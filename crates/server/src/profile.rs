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
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
