//! Todo pages (`/todos`, `/todos-ssr`, `/todos-query`) and the todo REST
//! API (`/api/todos/*`), backed by the per-session in-memory store in
//! `session.rs`. Mirrors `integrations/flask/app.py`'s `todos_route` /
//! `api_todos_*` handlers.

use crate::render::{jarr, jn, jobj, js, new_session, render_component};
use crate::session::Todo;
use crate::{html_response, layout, render_error, AppState, LayoutOpts};
use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

fn done_count(todos: &[Todo]) -> usize {
    todos.iter().filter(|t| t.done).count()
}

async fn todos_page(state: AppState, headers: HeaderMap, component: &str, title: &str) -> Response {
    let ((todos, done), sid, minted) = state.sessions.with_session(&headers, |s| {
        (s.todos.clone(), done_count(&s.todos))
    });

    let todos_js: Vec<_> = todos.iter().map(Todo::to_js).collect();
    let session = new_session(&state, &Default::default());
    let props = jobj([("initialTodos", jarr(todos_js.clone()))]);
    let stash = jobj([
        ("todos", jarr(todos_js)),
        ("newText", js("")),
        ("filter", js("all")),
        ("doneCount", jn(done as f64)),
    ]);

    let response = render_todos_page(&state, &session, component, title, props, stash);
    with_cookie(response, &state, minted, &sid)
}

/// Render a todo page's root component inside the layout. Shared by
/// [`todos_page`] and [`todos_query_route`]; the caller attaches the
/// session cookie.
fn render_todos_page(
    state: &AppState,
    session: &std::sync::Arc<barefootjs::RenderSession>,
    component: &str,
    title: &str,
    props: barefootjs::JsValue,
    stash: barefootjs::JsValue,
) -> Response {
    match render_component(state, session, component, props, stash) {
        Ok((body, scripts)) => {
            let portals = session.portals();
            html_response(layout(
                state,
                LayoutOpts {
                    title: title.to_string(),
                    heading: String::new(),
                    body,
                    scripts,
                    portals,
                    extra_css: String::new(),
                    back: None,
                },
            ))
        }
        Err(e) => render_error(e),
    }
}

pub async fn todos_route(State(state): State<AppState>, headers: HeaderMap) -> Response {
    todos_page(state, headers, "TodoApp", "TodoMVC - BarefootJS").await
}

pub async fn todos_ssr_route(State(state): State<AppState>, headers: HeaderMap) -> Response {
    todos_page(state, headers, "TodoAppSSR", "TodoMVC SSR - BarefootJS").await
}

/// `/todos-query`: the createQuery / createMutation todo app. `initialTodos`
/// seeds its query (mode A): the list is rendered here, and the client sends
/// no request on mount. Writes go through the API below and re-fetch the
/// list. Each `QueryTodoItem` row gets its `todo` from the compiled
/// template's `render_child` call; the child renderer is registered from
/// the manifest (see `render.rs`).
pub async fn todos_query_route(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let (todos, sid, minted) = state.sessions.with_session(&headers, |s| s.todos.clone());

    let todos_js: Vec<_> = todos.iter().map(Todo::to_js).collect();
    let session = new_session(&state, &Default::default());
    let props = jobj([("initialTodos", jarr(todos_js))]);
    let stash = jobj([("newText", js("")), ("filter", js("all"))]);

    let response =
        render_todos_page(&state, &session, "QueryTodoApp", "TodoMVC (createQuery) - BarefootJS", props, stash);
    with_cookie(response, &state, minted, &sid)
}

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------

fn with_cookie(mut response: Response, state: &AppState, minted: bool, sid: &str) -> Response {
    if minted {
        response
            .headers_mut()
            .insert(header::SET_COOKIE, crate::session::set_cookie_header(&state.base, sid).parse().unwrap());
    }
    response
}

pub async fn list_todos(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let (todos, sid, minted) = state.sessions.with_session(&headers, |s| s.todos.clone());
    let response = Json(todos).into_response();
    with_cookie(response, &state, minted, &sid)
}

#[derive(Deserialize)]
pub struct CreateTodoInput {
    text: Option<String>,
}

pub async fn create_todo(State(state): State<AppState>, headers: HeaderMap, Json(input): Json<CreateTodoInput>) -> Response {
    let (todo, sid, minted) = state.sessions.with_session(&headers, |s| {
        let todo = Todo { id: s.next_id, text: input.text.unwrap_or_default(), done: false, editing: false };
        s.next_id += 1;
        s.todos.push(todo.clone());
        todo
    });
    let response = (StatusCode::CREATED, Json(todo)).into_response();
    with_cookie(response, &state, minted, &sid)
}

#[derive(Deserialize)]
pub struct UpdateTodoInput {
    text: Option<String>,
    done: Option<bool>,
}

pub async fn update_todo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(input): Json<UpdateTodoInput>,
) -> Response {
    let (found, sid, minted) = state.sessions.with_session(&headers, |s| {
        for t in s.todos.iter_mut() {
            if t.id == id {
                if let Some(text) = &input.text {
                    t.text = text.clone();
                }
                if let Some(done) = input.done {
                    t.done = done;
                }
                return Some(t.clone());
            }
        }
        None
    });
    let response = match found {
        Some(t) => Json(t).into_response(),
        None => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "not found"}))).into_response(),
    };
    with_cookie(response, &state, minted, &sid)
}

pub async fn delete_todo(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<i64>) -> Response {
    let ((), sid, minted) = state.sessions.with_session(&headers, |s| {
        s.todos.retain(|t| t.id != id);
    });
    let response = StatusCode::NO_CONTENT.into_response();
    with_cookie(response, &state, minted, &sid)
}

#[derive(Deserialize)]
pub struct SetAllDoneInput {
    done: bool,
}

/// `PUT /api/todos`: set every todo's done flag ("toggle all").
pub async fn set_all_todos_done(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<SetAllDoneInput>,
) -> Response {
    let (todos, sid, minted) = state.sessions.with_session(&headers, |s| {
        for t in s.todos.iter_mut() {
            t.done = input.done;
        }
        s.todos.clone()
    });
    let response = Json(todos).into_response();
    with_cookie(response, &state, minted, &sid)
}

/// `DELETE /api/todos/completed`: remove every done todo ("clear completed").
pub async fn clear_completed_todos(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let ((), sid, minted) = state.sessions.with_session(&headers, |s| {
        s.todos.retain(|t| !t.done);
    });
    let response = StatusCode::NO_CONTENT.into_response();
    with_cookie(response, &state, minted, &sid)
}

pub async fn reset_todos(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let ((), sid, minted) = state.sessions.with_session(&headers, |s| {
        s.todos = crate::session::seed_todos();
        s.next_id = 4;
    });
    let response = (StatusCode::OK, [(header::CONTENT_TYPE, "text/plain")], "ok").into_response();
    with_cookie(response, &state, minted, &sid)
}
