//! Todo pages (`/todos`, `/todos-ssr`) and the todo REST API
//! (`/api/todos/*`), backed by the per-session in-memory store in
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

    let mut response = match render_component(&state, &session, component, props, stash) {
        Ok((body, scripts)) => html_response(layout(
            &state,
            LayoutOpts { title: title.to_string(), heading: String::new(), body, scripts, extra_css: String::new(), back: None },
        )),
        Err(e) => render_error(e),
    };
    if minted {
        response.headers_mut().insert(
            header::SET_COOKIE,
            crate::session::set_cookie_header(&state.base, &sid).parse().unwrap(),
        );
    }
    response
}

pub async fn todos_route(State(state): State<AppState>, headers: HeaderMap) -> Response {
    todos_page(state, headers, "TodoApp", "TodoMVC - BarefootJS").await
}

pub async fn todos_ssr_route(State(state): State<AppState>, headers: HeaderMap) -> Response {
    todos_page(state, headers, "TodoAppSSR", "TodoMVC SSR - BarefootJS").await
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

pub async fn reset_todos(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let ((), sid, minted) = state.sessions.with_session(&headers, |s| {
        s.todos = crate::session::seed_todos();
        s.next_id = 4;
    });
    let response = (StatusCode::OK, [(header::CONTENT_TYPE, "text/plain")], "ok").into_response();
    with_cookie(response, &state, minted, &sid)
}
