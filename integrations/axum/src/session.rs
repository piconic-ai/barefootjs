//! Per-session in-memory todo storage (mirrors every other integration's
//! session store, e.g. `integrations/flask/app.py` / `integrations/gin/
//! main.go`): each browser gets an opaque id via a `BASE`-scoped cookie;
//! `SessionStore` keys on that id so one visitor's list is never visible to
//! another. LRU-bounded to keep memory usage predictable. No external crate
//! (uuid/rand) needed -- `next_id` is a per-process atomic counter combined
//! with the wall clock, which is all a demo session id needs.

use axum::http::HeaderMap;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub const SESSION_COOKIE: &str = "bf_session";
pub const SESSION_TTL_SECS: u64 = 60 * 60 * 24 * 30; // 30d
const SESSION_STORE_MAX: usize = 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Todo {
    pub id: i64,
    pub text: String,
    pub done: bool,
    pub editing: bool,
}

impl Todo {
    pub fn to_js(&self) -> barefootjs::JsValue {
        crate::render::jobj([
            ("id", crate::render::jn(self.id as f64)),
            ("text", crate::render::js(self.text.clone())),
            ("done", crate::render::jb(self.done)),
            ("editing", crate::render::jb(self.editing)),
        ])
    }
}

pub fn seed_todos() -> Vec<Todo> {
    vec![
        Todo { id: 1, text: "Setup project".to_string(), done: false, editing: false },
        Todo { id: 2, text: "Create components".to_string(), done: false, editing: false },
        Todo { id: 3, text: "Write tests".to_string(), done: true, editing: false },
    ]
}

pub struct SessionData {
    pub todos: Vec<Todo>,
    pub next_id: i64,
}

pub struct SessionStore {
    inner: Mutex<Inner>,
}

struct Inner {
    sessions: HashMap<String, SessionData>,
    order: Vec<String>,
}

static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

fn new_session_id() -> String {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let counter = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{nanos:032x}{counter:08x}")
}

impl SessionStore {
    pub fn new() -> SessionStore {
        SessionStore { inner: Mutex::new(Inner { sessions: HashMap::new(), order: Vec::new() }) }
    }

    /// Returns the session id (from `headers`'s cookie, or a freshly minted
    /// one) and whether it was minted just now (the caller must then set
    /// the response cookie).
    fn resolve_id(&self, headers: &HeaderMap) -> (String, bool) {
        if let Some(id) = cookie_value(headers, SESSION_COOKIE) {
            return (id, false);
        }
        (new_session_id(), true)
    }

    /// Run `f` against the session's todo list (creating it if new),
    /// returning `f`'s result plus the session id and whether it was just
    /// minted (the caller sets the `Set-Cookie` header only in that case).
    pub fn with_session<T>(&self, headers: &HeaderMap, f: impl FnOnce(&mut SessionData) -> T) -> (T, String, bool) {
        let (id, minted) = self.resolve_id(headers);
        let mut inner = self.inner.lock().unwrap();
        if !inner.sessions.contains_key(&id) {
            inner.sessions.insert(id.clone(), SessionData { todos: seed_todos(), next_id: 4 });
            inner.order.push(id.clone());
            while inner.order.len() > SESSION_STORE_MAX {
                let oldest = inner.order.remove(0);
                inner.sessions.remove(&oldest);
            }
        } else {
            inner.order.retain(|x| x != &id);
            inner.order.push(id.clone());
        }
        let data = inner.sessions.get_mut(&id).expect("just inserted or present");
        let result = f(data);
        (result, id, minted)
    }
}

impl Default for SessionStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Minimal cookie-header value lookup (`Cookie: a=1; b=2`) -- no external
/// cookie-jar crate needed for a single-cookie demo session.
pub fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(axum::http::header::COOKIE)?.to_str().ok()?;
    for part in raw.split(';') {
        let part = part.trim();
        if let Some((k, v)) = part.split_once('=') {
            if k.trim() == name {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

/// Build a `Set-Cookie` header value for the session cookie, scoped to
/// `base_path`, `HttpOnly` + `SameSite=Lax` (mirrors every other
/// integration's session cookie attributes).
pub fn set_cookie_header(base_path: &str, id: &str) -> String {
    format!("{SESSION_COOKIE}={id}; Path={base_path}; Max-Age={SESSION_TTL_SECS}; HttpOnly; SameSite=Lax")
}
