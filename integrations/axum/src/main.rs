//! BarefootJS + Axum example.
//!
//! Rust/axum port of `integrations/flask/app.py` (same route table, same
//! session/child-renderer architecture), using the `barefootjs` Rust
//! runtime crate (`packages/adapter-rust/runtime`) as its rendering
//! backend instead of Python + Jinja2. See `src/render.rs`'s module
//! docstring for how this app's manifest-driven child registration
//! simplifies away Flask's per-route manual `children={...}` wiring.

mod ai_chat;
mod blog;
mod render;
mod session;
mod todo;

use axum::extract::{Request, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::{Router, ServiceExt};
use barefootjs::backend_minijinja;
use barefootjs::JsValue;
use minijinja::Environment;
use render::{empty_obj, jb, jobj, js, jn, new_session, render_component};
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::services::ServeDir;

#[derive(Clone)]
pub struct AppState {
    pub base: Arc<String>,
    pub dev: bool,
    pub templates_dir: Arc<PathBuf>,
    /// Built once at startup; only actually used when `dev` is false (see
    /// `render::with_env`, which rebuilds a fresh `Environment` per
    /// request in dev instead).
    pub env: Arc<Environment<'static>>,
    pub manifest: Arc<JsValue>,
    pub blog: Arc<blog::BlogData>,
    pub sessions: Arc<session::SessionStore>,
}

fn base_path() -> String {
    std::env::var("BASE_PATH").unwrap_or_else(|_| "/integrations/axum".to_string())
}

fn is_dev() -> bool {
    std::env::var("APP_ENV").map(|v| v == "development").unwrap_or(false)
}

#[tokio::main]
async fn main() {
    let base = base_path();
    let dev = is_dev();
    let templates_dir = PathBuf::from("dist/templates");
    let manifest_path = templates_dir.join("manifest.json");

    let manifest = match barefootjs::load_manifest(&manifest_path) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("barefoot: manifest not found at {} (run `bun run build`): {e}", manifest_path.display());
            JsValue::Object(Default::default())
        }
    };
    let env = backend_minijinja::build_environment(&templates_dir);
    let blog_data = blog::load_blog_data(&PathBuf::from("dist/blog-data.json"));

    let state = AppState {
        base: Arc::new(base.clone()),
        dev,
        templates_dir: Arc::new(templates_dir),
        env: Arc::new(env),
        manifest: Arc::new(manifest),
        blog: Arc::new(blog_data),
        sessions: Arc::new(session::SessionStore::new()),
    };

    // Trim trailing slashes BEFORE routing (`/integrations/axum/` →
    // `/integrations/axum`): axum's `nest` matches only the bare prefix, so
    // without this the slash spelling 404s in production while flask/gin
    // accept both. The layer must wrap the finished `Router` (path rewriting
    // has to happen before route matching), hence `ServiceExt::into_make_service`
    // instead of serving the `Router` directly.
    let app = tower::Layer::layer(
        &tower_http::normalize_path::NormalizePathLayer::trim_trailing_slash(),
        build_router(state.clone(), &base),
    );

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.expect("bind failed");
    println!("barefoot: axum example listening on 0.0.0.0:{port} (base {base})");
    axum::serve(listener, ServiceExt::<Request>::into_make_service(app))
        .await
        .expect("server error");
}

fn build_router(state: AppState, base: &str) -> Router {
    let mounted = Router::new()
        .route("/", get(home_route))
        .route("/counter", get(counter_route))
        .route("/toggle", get(toggle_route))
        .route("/form", get(form_route))
        .route("/portal", get(portal_route))
        .route("/reactive-props", get(reactive_props_route))
        .route("/props-reactivity", get(props_reactivity_route))
        .route("/conditional-return", get(conditional_return_route))
        .route("/conditional-return-link", get(conditional_return_link_route))
        .route("/ai-chat", get(ai_chat::page_route))
        .route("/api/ai-chat", get(ai_chat::sse_route))
        .route("/todos", get(todo::todos_route))
        .route("/todos-ssr", get(todo::todos_ssr_route))
        .route("/api/todos", get(todo::list_todos).post(todo::create_todo))
        .route("/api/todos/{id}", axum::routing::put(todo::update_todo).delete(todo::delete_todo))
        .route("/api/todos/reset", axum::routing::post(todo::reset_todos))
        .route("/blog", get(blog::index_route))
        .route("/blog/posts/{slug}", get(blog::post_route))
        .nest_service("/client", ServeDir::new("dist/client"))
        .nest_service("/styles", ServeDir::new("dist/styles"))
        .with_state(state);

    Router::new().nest(base, mounted).route(
        "/",
        get({
            let target = base.to_string();
            move || async move { Redirect::to(&target) }
        }),
    )
}

// ---------------------------------------------------------------------------
// Page layout -- mirrors `integrations/flask/app.py`'s `layout()`.
// ---------------------------------------------------------------------------

pub struct LayoutOpts {
    pub title: String,
    pub heading: String,
    pub body: String,
    pub scripts: String,
    pub extra_css: String,
    /// `None` -> default "back to index" link; `Some("")` suppresses it
    /// (the index page itself).
    pub back: Option<String>,
}

pub fn layout(state: &AppState, opts: LayoutOpts) -> String {
    let base = state.base.as_str();
    let heading_html = if opts.heading.is_empty() { String::new() } else { format!("<h1>{}</h1>", opts.heading) };
    let back_href = opts.back.unwrap_or_else(|| base.to_string());
    let back_html =
        if back_href.is_empty() { String::new() } else { format!(r#"<p><a href="{back_href}">&larr; Back</a></p>"#) };
    format!(
        r#"<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link rel="stylesheet" href="{base}/styles/tokens.css">
    <link rel="stylesheet" href="{base}/styles/layout.css">
    <link rel="stylesheet" href="{base}/styles/components.css">
    <link rel="stylesheet" href="{base}/styles/todo-app.css">
    {extra_css}
</head>
<body>
    <header class="bf-header">
        <div class="bf-header-inner">
            <a href="https://barefootjs.dev" class="bf-header-logo" aria-label="BarefootJS">
                <span class="bf-header-logo-img" role="img" aria-hidden="true"></span>
            </a>
            <div class="bf-header-sep"></div>
            <nav class="bf-header-crumbs" aria-label="Breadcrumb">
                <a href="/integrations" class="bf-header-link">Integrations</a>
                <span class="bf-header-crumb-sep" aria-hidden="true">/</span>
                <span class="bf-header-current" aria-current="page">Axum</span>
            </nav>
        </div>
    </header>
    {heading_html}
    <div id="app">{body}</div>
    {back_html}
    {scripts}
</body>
</html>
"#,
        title = html_escape(&opts.title),
        base = base,
        extra_css = opts.extra_css,
        heading_html = heading_html,
        body = opts.body,
        back_html = back_html,
        scripts = opts.scripts,
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

pub(crate) fn html_response(html: String) -> Response {
    (StatusCode::OK, [(header::CONTENT_TYPE, "text/html; charset=utf-8")], html).into_response()
}

pub fn render_error(err: String) -> Response {
    eprintln!("barefoot: render error: {err}");
    (StatusCode::INTERNAL_SERVER_ERROR, [(header::CONTENT_TYPE, "text/plain; charset=utf-8")], err).into_response()
}

// ---------------------------------------------------------------------------
// Routes -- one handler per `integrations/flask/app.py` route, same
// props/stash literals (see `render.rs`'s docstring for why this app
// doesn't ALSO need Flask's manual `children={...}` dict per route).
// ---------------------------------------------------------------------------

async fn home_route(State(state): State<AppState>) -> Response {
    let base = state.base.as_str();
    let body = format!(
        r#"<p>This example renders the same shared JSX components as every other
BarefootJS integration under a plain axum app, using the Rust `barefootjs`
runtime crate (minijinja) as the rendering backend.</p>
<ul>
    <li><a href="{base}/counter">Counter</a></li>
    <li><a href="{base}/toggle">Toggle</a></li>
    <li><a href="{base}/todos">Todo (@client)</a></li>
    <li><a href="{base}/todos-ssr">Todo (no @client markers)</a></li>
    <li><a href="{base}/ai-chat">AI Chat (SSE Streaming)</a></li>
    <li><a href="{base}/blog">Blog (@barefootjs/router - partial navigation)</a></li>
</ul>"#
    );
    html_response(layout(
        &state,
        LayoutOpts {
            title: "BarefootJS + Axum Example".to_string(),
            heading: "BarefootJS + Axum Example".to_string(),
            body,
            scripts: String::new(),
            extra_css: String::new(),
            back: Some(String::new()),
        },
    ))
}

async fn counter_route(State(state): State<AppState>) -> Response {
    let session = new_session(&state, &Default::default());
    match render_component(&state, &session, "Counter", empty_obj(), empty_obj()) {
        Ok((body, scripts)) => html_response(layout(
            &state,
            LayoutOpts {
                title: "Counter - BarefootJS".to_string(),
                heading: "Counter Component".to_string(),
                body,
                scripts,
                extra_css: String::new(),
                back: None,
            },
        )),
        Err(e) => render_error(e),
    }
}

async fn toggle_route(State(state): State<AppState>) -> Response {
    let items = jarr_toggle_items();
    let session = new_session(&state, &Default::default());
    let props = jobj([("toggleItems", items.clone())]);
    let stash = jobj([("toggleItems", items)]);
    match render_component(&state, &session, "Toggle", props, stash) {
        Ok((body, scripts)) => html_response(layout(
            &state,
            LayoutOpts {
                title: "Toggle - BarefootJS".to_string(),
                heading: "Toggle Component".to_string(),
                body,
                scripts,
                extra_css: String::new(),
                back: None,
            },
        )),
        Err(e) => render_error(e),
    }
}

fn jarr_toggle_items() -> JsValue {
    render::jarr(vec![
        jobj([("label", js("Setting 1")), ("defaultOn", jb(true))]),
        jobj([("label", js("Setting 2")), ("defaultOn", jb(false))]),
        jobj([("label", js("Setting 3")), ("defaultOn", jb(false))]),
    ])
}

async fn form_route(State(state): State<AppState>) -> Response {
    let session = new_session(&state, &Default::default());
    let stash = jobj([("accepted", jb(false))]);
    match render_component(&state, &session, "Form", empty_obj(), stash) {
        Ok((body, scripts)) => html_response(layout(
            &state,
            LayoutOpts {
                title: "Form - BarefootJS".to_string(),
                heading: "Form Example".to_string(),
                body,
                scripts,
                extra_css: String::new(),
                back: None,
            },
        )),
        Err(e) => render_error(e),
    }
}

async fn portal_route(State(state): State<AppState>) -> Response {
    let session = new_session(&state, &Default::default());
    let stash = jobj([("open", jb(false))]);
    match render_component(&state, &session, "PortalExample", empty_obj(), stash) {
        Ok((body, scripts)) => html_response(layout(
            &state,
            LayoutOpts {
                title: "Portal - BarefootJS".to_string(),
                heading: "Portal Example".to_string(),
                body,
                scripts,
                extra_css: String::new(),
                back: None,
            },
        )),
        Err(e) => render_error(e),
    }
}

async fn reactive_props_route(State(state): State<AppState>) -> Response {
    let session = new_session(&state, &Default::default());
    let stash = jobj([("count", jn(0.0)), ("doubled", jn(0.0))]);
    match render_component(&state, &session, "ReactiveProps", empty_obj(), stash) {
        Ok((body, scripts)) => html_response(layout(
            &state,
            LayoutOpts {
                title: "Reactive Props - BarefootJS".to_string(),
                heading: "Reactive Props Test".to_string(),
                body,
                scripts,
                extra_css: String::new(),
                back: None,
            },
        )),
        Err(e) => render_error(e),
    }
}

async fn props_reactivity_route(State(state): State<AppState>) -> Response {
    // Not in the headline route list, but required: the shared
    // `reactive-props.spec.ts` suite's "Props Access" describe block
    // navigates to `${baseUrl}/props-reactivity` -- see
    // `integrations/shared/e2e/reactive-props.spec.ts`.
    let session = new_session(&state, &Default::default());
    let stash = jobj([("count", jn(1.0))]);
    match render_component(&state, &session, "PropsReactivityComparison", empty_obj(), stash) {
        Ok((body, scripts)) => html_response(layout(
            &state,
            LayoutOpts {
                title: "Props Reactivity - BarefootJS".to_string(),
                heading: "Props Reactivity Comparison".to_string(),
                body,
                scripts,
                extra_css: String::new(),
                back: None,
            },
        )),
        Err(e) => render_error(e),
    }
}

async fn conditional_return_route(State(state): State<AppState>) -> Response {
    render_conditional_return(state, "").await
}

async fn conditional_return_link_route(State(state): State<AppState>) -> Response {
    render_conditional_return(state, "link").await
}

async fn render_conditional_return(state: AppState, variant: &str) -> Response {
    let session = new_session(&state, &Default::default());
    let props = jobj([("variant", js(variant))]);
    let stash = jobj([("variant", js(variant)), ("count", jn(0.0))]);
    let heading = if variant.is_empty() {
        "Conditional Return Example".to_string()
    } else {
        "Conditional Return Example (Link)".to_string()
    };
    let title = if variant.is_empty() {
        "Conditional Return - BarefootJS".to_string()
    } else {
        "Conditional Return (Link) - BarefootJS".to_string()
    };
    match render_component(&state, &session, "ConditionalReturn", props, stash) {
        Ok((body, scripts)) => {
            html_response(layout(&state, LayoutOpts { title, heading, body, scripts, extra_css: String::new(), back: None }))
        }
        Err(e) => render_error(e),
    }
}

pub(crate) fn app_static_href(state: &AppState, rel: &str) -> String {
    format!("{}/{}", state.base, rel.trim_start_matches('/'))
}
