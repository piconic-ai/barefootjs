//! Blog -- the `@barefootjs/router` showcase (Rust/axum), mounted under
//! `${BASE}/blog`. Mirrors `integrations/flask/app.py`'s blog section: a
//! region-shell layout (header + ThemeToggle in the shell, a hand-authored
//! sidebar region `nav:0` + the compiled `<PageShell>` nested content
//! region in the main column) whose islands are the shared blog components
//! in `../shared/blog`, compiled by this integration's `bf build`.
//!
//! There is no special server-side "partial navigation" endpoint: the
//! client router (`client/router-entry.ts`, bundled to `client/router-
//! entry.js`) fetches a full HTML page for every navigation and diffs
//! `[bf-region]` boundaries client-side, so every route below just returns
//! a normal HTML document.
//!
//! `PostList`'s own `params` memo returns an OBJECT built through a helper
//! function, and `sortClass`/`tagClass` are plain functions called with
//! different literal arguments per link -- shapes the static ssrDefaults
//! extractor can't lower for SSR (see the manifest's `ssrDefaults` for
//! `PostList`, where `params`/`visible` show up as `null` -- still
//! caller-provided). We seed `params` from the request query (validated
//! the same way the client's `asSortKey` would) and `visible` with the
//! filtered+sorted list; the client re-derives the same values from
//! `searchParams()` on hydration. This mirrors `integrations/flask/
//! app.py`'s `blog_index_route` exactly (down to `as_sort_key`).

use crate::render::{empty_obj, jarr, jn, jobj, js, new_session, render_component_with_raw_children, render_island, scripts_html};
use crate::{html_response, AppState};
use axum::extract::{Path, RawQuery, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use barefootjs::JsValue;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path as FsPath;

#[derive(Debug, Clone, Deserialize)]
pub struct Post {
    pub slug: String,
    pub title: String,
    pub date: String,
    pub tags: Vec<String>,
    #[allow(dead_code)]
    pub excerpt: String,
    pub body: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListItem {
    pub slug: String,
    pub title: String,
    pub date: String,
    pub tags: Vec<String>,
    pub meta: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct BlogData {
    #[serde(default)]
    pub posts: Vec<Post>,
    #[serde(default)]
    #[serde(rename = "listItems")]
    pub list_items: Vec<ListItem>,
    #[serde(default)]
    #[serde(rename = "allTags")]
    pub all_tags: Vec<String>,
}

pub fn load_blog_data(path: &FsPath) -> BlogData {
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|e| {
            eprintln!("barefoot: blog data parse error: {e}");
            BlogData::default()
        }),
        Err(e) => {
            eprintln!("barefoot: blog data not found at {} (run `bun run build`): {e}", path.display());
            BlogData::default()
        }
    }
}

fn list_item_js(item: &ListItem) -> JsValue {
    jobj([
        ("slug", js(item.slug.clone())),
        ("title", js(item.title.clone())),
        ("date", js(item.date.clone())),
        ("tags", jarr(item.tags.iter().map(|t| js(t.clone())).collect())),
        ("meta", js(item.meta.clone())),
    ])
}

const SORT_KEYS: &[&str] = &["date", "title", "tag"];

/// Mirrors `PostList`'s `asSortKey`: an unknown/absent `?sort=` falls back
/// to `'date'` so the SSR row order always matches a valid post-hydration
/// state.
fn as_sort_key(raw: Option<&str>) -> &'static str {
    match raw {
        Some(v) if SORT_KEYS.contains(&v) => SORT_KEYS[SORT_KEYS.iter().position(|k| *k == v).unwrap()],
        _ => "date",
    }
}

fn first_tag(p: &ListItem) -> &str {
    p.tags.first().map(String::as_str).unwrap_or("")
}

fn visible_items(items: &[ListItem], sort_key: &str, tag: &str) -> Vec<ListItem> {
    let mut list: Vec<ListItem> = items.iter().filter(|p| tag.is_empty() || p.tags.iter().any(|t| t == tag)).cloned().collect();
    match sort_key {
        "title" => list.sort_by(|a, b| a.title.cmp(&b.title)),
        "tag" => list.sort_by(|a, b| first_tag(a).cmp(first_tag(b)).then_with(|| b.date.cmp(&a.date))),
        _ => list.sort_by(|a, b| b.date.cmp(&a.date)),
    }
    list
}

fn parse_query(raw: &str) -> HashMap<String, String> {
    // `barefootjs::SearchParams` has no iteration API (by design -- see its
    // docstring); a tiny local parse is enough for the two keys the blog
    // route reads (`sort`, `tag`).
    let mut out = HashMap::new();
    let raw = raw.strip_prefix('?').unwrap_or(raw);
    for pair in raw.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        out.insert(url_decode(k), url_decode(v));
    }
    out
}

fn url_decode(s: &str) -> String {
    let bytes = s.replace('+', " ").into_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_default()
}

fn blog_base(state: &AppState) -> String {
    format!("{}/blog", state.base)
}

fn import_map(state: &AppState) -> String {
    let bjs = format!("{}/client/barefoot.js", state.base);
    let json = format!(
        r#"{{"imports":{{"@barefootjs/client":{b:?},"@barefootjs/client/runtime":{b:?},"@barefootjs/client/reactive":{b:?}}}}}"#,
        b = bjs
    );
    json.replace('<', "\\u003c")
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// Assemble the region-shell document shared by every blog route.
/// `session` is the request-scoped runtime whose script collector every
/// island (shell + content) shares.
fn blog_page(state: &AppState, session: &std::sync::Arc<barefootjs::RenderSession>, title: &str, content_html: &str) -> Result<String, String> {
    let base = blog_base(state);
    let theme = render_island(state, session, "ThemeToggle", empty_obj(), empty_obj())?;
    let sidebar = render_island(state, session, "Sidebar", empty_obj(), empty_obj())?;
    let (shell, _) = render_component_with_raw_children(state, session, "PageShell", empty_obj(), empty_obj(), content_html)?;
    let scripts = scripts_html(session);
    let static_base = format!("{}/client", state.base);

    Ok(format!(
        r#"<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<script type="importmap">{import_map}</script>
<link rel="stylesheet" href="{base_styles}/styles/blog.css">
</head>
<body>
<header class="shell">
<a class="shell-brand" href="{base}">&#128240; Barefoot Blog</a>
<div class="shell-island">{theme}</div>
</header>
<div class="layout">
<aside bf-region="nav:0">{sidebar}</aside>
<main>{shell}</main>
</div>
{scripts}
<script type="module" src="{static_base}/router-entry.js"></script>
</body>
</html>
"#,
        title = esc(title),
        import_map = import_map(state),
        base_styles = state.base,
        base = base,
        theme = theme,
        sidebar = sidebar,
        shell = shell,
        scripts = scripts,
        static_base = static_base,
    ))
}

pub async fn index_route(State(state): State<AppState>, RawQuery(query): RawQuery) -> Response {
    let raw = query.unwrap_or_default();
    let q = parse_query(&raw);
    let sort = as_sort_key(q.get("sort").map(String::as_str));
    let tag = q.get("tag").cloned().unwrap_or_default();

    let items: Vec<JsValue> = state.blog.list_items.iter().map(list_item_js).collect();
    let visible = visible_items(&state.blog.list_items, sort, &tag);
    let visible_js: Vec<JsValue> = visible.iter().map(list_item_js).collect();
    let base = blog_base(&state);

    let session = new_session(&state, &Default::default());
    let props = jobj([
        ("items", jarr(items)),
        ("tags", jarr(state.blog.all_tags.iter().map(|t| js(t.clone())).collect())),
        ("base", js(base.clone())),
    ]);
    let extra = jobj([
        ("params", jobj([("sort", js(sort)), ("tag", js(tag.clone()))])),
        ("visible", jarr(visible_js)),
        ("sortClass", js("sort")),
        ("root", js(base.clone())),
        ("tagClass", js("tag")),
    ]);

    let post_list = match render_island(&state, &session, "PostList", props, extra) {
        Ok(html) => html,
        Err(e) => return crate::render_error(e),
    };
    let now_playing = match render_island(&state, &session, "NowPlaying", empty_obj(), jobj([("Math", jobj([("min", jn(0.0))]))])) {
        Ok(html) => html,
        Err(e) => return crate::render_error(e),
    };

    let title = if tag.is_empty() { "Barefoot Blog \u{2014} Latest posts".to_string() } else { format!("#{tag} \u{2014} Barefoot Blog") };
    match blog_page(&state, &session, &title, &format!("{post_list}{now_playing}")) {
        Ok(html) => html_response(html),
        Err(e) => crate::render_error(e),
    }
}

pub async fn post_route(State(state): State<AppState>, Path(slug): Path<String>) -> Response {
    // Sort newest-first (the index's default display order) so the article
    // pager walks down the list the reader is browsing; the corpus is
    // authored oldest-first.
    let mut posts = state.blog.posts.clone();
    posts.sort_by(|a, b| b.date.cmp(&a.date));
    let idx = match posts.iter().position(|p| p.slug == slug) {
        Some(i) => i,
        None => return (StatusCode::NOT_FOUND, "Not Found").into_response(),
    };
    let post = &posts[idx];
    let prev = if idx > 0 { Some(&posts[idx - 1]) } else { None };
    let next = if idx + 1 < posts.len() { Some(&posts[idx + 1]) } else { None };
    let base = blog_base(&state);

    // Signal_init override: the `now_playing` child rendered INSIDE
    // PostArticle needs the same `Math` stash entry the standalone
    // top-level island gets below -- see `render.rs::new_session`'s
    // docstring.
    let mut signal_init = HashMap::new();
    signal_init.insert("now_playing".to_string(), jobj([("Math", jobj([("min", jn(0.0))]))]));
    let session = new_session(&state, &signal_init);

    let props = jobj([
        ("slug", js(post.slug.clone())),
        ("title", js(post.title.clone())),
        ("date", js(post.date.clone())),
        ("tags", jarr(post.tags.iter().map(|t| js(t.clone())).collect())),
        ("body", jarr(post.body.iter().map(|b| js(b.clone())).collect())),
        ("position", jn((idx + 1) as f64)),
        ("total", jn(posts.len() as f64)),
        ("base", js(base.clone())),
        ("prevSlug", prev.map(|p| js(p.slug.clone())).unwrap_or_else(crate::render::jnull)),
        ("prevTitle", prev.map(|p| js(p.title.clone())).unwrap_or_else(crate::render::jnull)),
        ("nextSlug", next.map(|p| js(p.slug.clone())).unwrap_or_else(crate::render::jnull)),
        ("nextTitle", next.map(|p| js(p.title.clone())).unwrap_or_else(crate::render::jnull)),
    ]);

    let content = match render_island(&state, &session, "PostArticle", props, empty_obj()) {
        Ok(html) => html,
        Err(e) => return crate::render_error(e),
    };
    match blog_page(&state, &session, &format!("{} \u{2014} Barefoot Blog", post.title), &content) {
        Ok(html) => html_response(html),
        Err(e) => crate::render_error(e),
    }
}
