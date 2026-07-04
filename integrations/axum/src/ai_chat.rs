//! AI Chat -- Streaming SSR/SSE example. Mirrors `integrations/flask/
//! app.py`'s `ai_chat_route` / `ai_chat_stream`, using an async stream
//! (`tokio::time::sleep` between chars) so the runtime isn't blocked while
//! a response streams -- see `integrations/fastapi/app.py`'s SSE handler
//! for the rationale this design contract points at (async sleep instead
//! of a blocking one, so other in-flight requests aren't stalled).

use crate::render::{empty_obj, jarr, jb, jobj, js, new_session, render_component};
use crate::{app_static_href, html_response, layout, render_error, AppState, LayoutOpts};
use axum::extract::State;
use axum::response::sse::{Event, Sse};
use axum::response::Response;
use futures_core::Stream;
use std::convert::Infallible;
use std::time::{SystemTime, UNIX_EPOCH};

const AI_RESPONSES: &[&str] = &[
    "[Dummy response] This text is streaming one character at a time via SSE. In production, replace /api/ai-chat with a real LLM API.",
    "[Dummy response] BarefootJS compiles JSX to minijinja templates + client JS. Signals drive reactivity on any backend.",
    "[Dummy response] SSE (Server-Sent Events) lets the server push data to the client over a single HTTP connection.",
    "[Dummy response] The Rust/axum backend runs the barefootjs runtime crate directly -- no interpreter, no WSGI/ASGI layer -- and streams each character with a 30ms delay to simulate token-by-token LLM output.",
    "[Dummy response] Out-of-Order Streaming SSR and interactive SSE streaming are two different features of BarefootJS.",
];

pub async fn page_route(State(state): State<AppState>) -> Response {
    let session = new_session(&state, &Default::default());
    let stash = jobj([
        ("messages", jarr(vec![])),
        ("input", js("")),
        ("streamingText", js("")),
        ("isStreaming", jb(false)),
    ]);
    let extra_css = format!(r#"<link rel="stylesheet" href="{}">"#, app_static_href(&state, "styles/ai-chat.css"));
    match render_component(&state, &session, "AIChatInteractive", empty_obj(), stash) {
        Ok((body, scripts)) => html_response(layout(
            &state,
            LayoutOpts {
                title: "AI Chat -- SSE Streaming (Axum)".to_string(),
                heading: "AI Chat -- SSE Streaming".to_string(),
                body,
                scripts,
                extra_css,
                back: None,
            },
        )),
        Err(e) => render_error(e),
    }
}

fn pick_response() -> &'static str {
    let idx = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos() as usize % AI_RESPONSES.len();
    AI_RESPONSES[idx]
}

pub async fn sse_route() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let text = pick_response();
    let stream = async_stream::stream! {
        for ch in text.chars() {
            let payload = serde_json::to_string(&ch.to_string()).unwrap_or_else(|_| "\"\"".to_string());
            yield Ok(Event::default().data(payload));
            tokio::time::sleep(std::time::Duration::from_millis(30)).await;
        }
        yield Ok(Event::default().data("[DONE]"));
    };
    Sse::new(stream)
}
