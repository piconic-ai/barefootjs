#!/usr/bin/env python3
"""BarefootJS + FastAPI example.

Python/FastAPI port of ../flask/app.py -- same runtime (JinjaBackend), same
route table, same session/child-renderer helpers, structured section-by-
section so the two files can be diffed side by side; only the Flask/WSGI ->
FastAPI/ASGI idiom differences change (async view functions, Starlette
Request/Response types, StaticFiles mounts instead of per-file static
routes, StreamingResponse + asyncio.sleep for SSE instead of a blocking
generator).

`lib` is populated by scripts/assemble-deps.ts at build time (used in the
container / CI); the workspace source dir is added to `sys.path` too so
local dev resolves without the assemble step. Either location works.
"""

from __future__ import annotations

import json as _json
import os
import random
import sys
import uuid
from pathlib import Path
from typing import Any, Callable, Optional

HERE = Path(__file__).resolve().parent
for candidate in (HERE / "lib", HERE.parent.parent / "packages" / "adapter-jinja" / "python"):
    p = str(candidate)
    if candidate.is_dir() and p not in sys.path:
        sys.path.insert(0, p)

import asyncio

import uvicorn
from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from barefootjs import BarefootJS
from barefootjs.backend_jinja import JinjaBackend

# URL prefix the app is mounted under. Defaults to /integrations/fastapi so
# the app is deploy-ready for barefootjs.dev/integrations/fastapi.
BASE = os.environ.get("BASE_PATH", "/integrations/fastapi")
PORT = int(os.environ.get("PORT", "3009"))
# Mirrors app.psgi's `PLACK_ENV` dev/production switch (there is no
# FastAPI-native equivalent -- Uvicorn's own `--reload` only controls the
# process supervisor, not our hand-rolled Jinja Environment -- so we read a
# parity env var directly, same as flask/app.py's FLASK_ENV read).
DEV = os.environ.get("FASTAPI_ENV", "development") != "production"

app = FastAPI()

# One JinjaBackend renders every component from dist/templates. In dev the
# template cache is disabled (`cache_size=0`) so edits picked up by
# `bun run build:watch` render on the next request without a server restart
# -- the Python-runtime equivalent of app.psgi's `xslate_options => { cache =>
# $DEV ? 0 : 1 }`. There is no Python port of BarefootJS::DevReload (browser
# push on file change) yet -- see the workstream-I task report; auto_reload
# still means a restart-free edit loop, just without the client-side toast.
backend = JinjaBackend(
    paths=[str(HERE / "dist" / "templates")],
    environment_options={"auto_reload": True, "cache_size": 0 if DEV else 400},
)


def jbool(v: Any) -> bool:
    return bool(v)


# The build manifest -- a plain build artifact (dist/templates/manifest.json),
# not adapter internals -- lists each component's `ssrDefaults`: the set of
# signal/memo names an optional-prop-derived initial value needs BOUND (to
# the real prop or to `None`) in the render context. `register_child_renderer`
# via `register_components_from_manifest` derives this automatically for
# manifest-registered (`ui/*`) children; this integration's shared components
# aren't manifest-registered (see render_component's manual child wiring
# below), so root-level renders derive it themselves, the same way.
try:
    MANIFEST: dict[str, Any] = _json.loads((HERE / "dist" / "templates" / "manifest.json").read_text())
except FileNotFoundError:
    MANIFEST = {}


def stash_from_ssr_defaults(component: str, props: dict) -> dict:
    """Port of `barefootjs.runtime._derive_stash_from_defaults` for
    root-level renders (see the MANIFEST comment above for why root renders
    need their own copy instead of getting it via `register_child_renderer`).

    Why this matters: a signal whose initial value derives from an optional
    prop (`const [count] = createSignal(props.initial ?? 0)`) is seeded
    in-template as `{% set count = (initial if initial is not none else 0)
    %}` (see packages/adapter-jinja's memo/seed.ts) -- that lowering expects
    `initial` to always be BOUND in the render context (to the real value or
    to `None`), never omitted outright, since a Jinja `ChainableUndefined`
    read is `is not none` (unlike Python's own `None`), so an entirely
    absent key silently skips the `else 0` fallback and raises on the next
    arithmetic use. Without this, `/counter` 500s on `props.initial` (the
    same shape as the ssrDefaults contract's `propName` field documents).
    """
    entry = MANIFEST.get(component) or {}
    defaults = entry.get("ssrDefaults") or {}
    extra: dict[str, Any] = {}
    for name, d in defaults.items():
        if not isinstance(d, dict):
            extra[name] = d
            continue
        prop_name = d.get("propName")
        if prop_name is not None and props.get(prop_name) is not None:
            extra[name] = props[prop_name]
        else:
            extra[name] = d.get("value")
    return extra


# ---------------------------------------------------------------------------
# Per-session in-memory todo storage (mirrors the Perl examples): each
# browser gets an opaque id via a $BASE-scoped cookie; SESSIONS keys on it so
# one visitor's list is never visible to another. LRU-bounded.
# ---------------------------------------------------------------------------
SESSION_COOKIE = "bf_session"
SESSION_TTL_SEC = 60 * 60 * 24 * 30
SESSION_STORE_MAX = 1000

SESSIONS: dict[str, dict[str, Any]] = {}
SESSION_ORDER: list[str] = []


def seed_todos() -> list[dict[str, Any]]:
    return [
        {"id": 1, "text": "Setup project", "done": False, "editing": False},
        {"id": 2, "text": "Create components", "done": False, "editing": False},
        {"id": 3, "text": "Write tests", "done": True, "editing": False},
    ]


def new_session_id() -> str:
    return uuid.uuid4().hex


def get_session(request: Request) -> tuple[dict[str, Any], Optional[str]]:
    """Returns (session, new_session_id_or_none). The caller sets the cookie
    on the response only when a new id was minted."""
    sid = request.cookies.get(SESSION_COOKIE)
    minted = None
    if not sid:
        sid = new_session_id()
        minted = sid
    if sid not in SESSIONS:
        SESSIONS[sid] = {"todos": seed_todos(), "next_id": 4}
        SESSION_ORDER.append(sid)
        while len(SESSION_ORDER) > SESSION_STORE_MAX:
            SESSIONS.pop(SESSION_ORDER.pop(0), None)
    else:
        SESSION_ORDER.remove(sid)
        SESSION_ORDER.append(sid)
    return SESSIONS[sid], minted


def with_session_cookie(response: Response, minted: Optional[str]) -> Response:
    if minted:
        response.set_cookie(
            SESSION_COOKIE, minted, max_age=SESSION_TTL_SEC, path=BASE,
            httponly=True, samesite="lax",
        )
    return response


# ---------------------------------------------------------------------------
# Rendering: build a per-request runtime, register child renderers, render
# the component template, and wrap the result in the page layout.
# ---------------------------------------------------------------------------
def rand_suffix() -> str:
    return uuid.uuid4().hex[:6]


def render_component(
    component: str,
    *,
    title: Optional[str] = None,
    heading: str = "",
    children: Optional[dict[str, str]] = None,
    signal_init: Optional[dict[str, Callable[[dict], dict]]] = None,
    props: Optional[dict] = None,
    stash: Optional[dict] = None,
    extra_css: str = "",
    back: Optional[str] = None,
) -> str:
    bf = BarefootJS(None, {"backend": backend})
    scope_id = f"{component}_{rand_suffix()}"
    bf._scope_id(scope_id)
    if props:
        bf._props(props)

    children = children or {}
    signal_init = signal_init or {}
    for child_slot, child_template in children.items():
        child_init = signal_init.get(child_slot)

        def make_renderer(child_template: str = child_template, child_init=child_init) -> Callable:
            def renderer(props: dict, caller: Optional[BarefootJS] = None) -> str:
                child_bf = BarefootJS(None, {"backend": backend})
                # Loop children carry no `_bf_slot`; fall back to template +
                # suffix so each instance gets a distinct scope id (client JS
                # finds children by scope). Slot children pin to
                # <parent>_<slot>.
                slot_id = props.pop("_bf_slot", None)
                child_bf._scope_id(f"{scope_id}_{slot_id}" if slot_id else f"{child_template}_{rand_suffix()}")
                child_bf._is_child(True)
                # Share the parent's script collector so a child's
                # register_script de-dupes against the page's existing
                # <script> set.
                child_bf._scripts(bf._scripts())
                child_bf._script_seen(bf._script_seen())
                extra = child_init(props) if child_init else {}
                return backend.render_named(child_template, child_bf, {**props, **extra})

            return renderer

        bf.register_child_renderer(child_slot, make_renderer())

    ctx = {**stash_from_ssr_defaults(component, props or {}), **(stash or {})}
    body = backend.render_named(component, bf, ctx)
    return layout(
        title=title or f"{component} - BarefootJS",
        heading=heading,
        body=body,
        scripts=bf.scripts(),
        extra_css=extra_css,
        back=back,
    )


def layout(
    *, title: str, heading: str, body: str, scripts: str, extra_css: str = "", back: Optional[str] = None,
) -> str:
    heading_html = f"<h1>{heading}</h1>" if heading else ""
    # Subpages link back to the example list ($BASE/); the list page itself
    # passes back='' to suppress the link (the header breadcrumb already
    # navigates up to /integrations).
    back_href = back if back is not None else f"{BASE}/"
    back_html = f'<p><a href="{back_href}">&larr; Back</a></p>' if back_href != "" else ""
    return f"""<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link rel="stylesheet" href="{BASE}/styles/tokens.css">
    <link rel="stylesheet" href="{BASE}/styles/layout.css">
    <link rel="stylesheet" href="{BASE}/styles/components.css">
    <link rel="stylesheet" href="{BASE}/styles/todo-app.css">
    {extra_css}
</head>
<body>
    <header class="bf-header">
        <div class="bf-header-inner">
            <a href="https://barefootjs.dev" class="bf-header-logo" aria-label="Barefoot.js">
                <span class="bf-header-logo-img" role="img" aria-hidden="true"></span>
            </a>
            <div class="bf-header-sep"></div>
            <nav class="bf-header-crumbs" aria-label="Breadcrumb">
                <a href="/integrations" class="bf-header-link">Integrations</a>
                <span class="bf-header-crumb-sep" aria-hidden="true">/</span>
                <span class="bf-header-current" aria-current="page">FastAPI</span>
            </nav>
        </div>
    </header>
    {heading_html}
    <div id="app">{body}</div>
    {back_html}
    {scripts}
</body>
</html>
"""


def html_response(html: str, status: int = 200) -> Response:
    return Response(content=html, status_code=status, media_type="text/html")


def json_response(data: Any, status: int = 200) -> Response:
    return JSONResponse(content=data, status_code=status)


# ---------------------------------------------------------------------------
# AI Chat dummy responses (streamed char-by-char over SSE).
# ---------------------------------------------------------------------------
AI_RESPONSES = [
    "[Dummy response] This text is streaming one character at a time via SSE. In production, replace /api/ai-chat with a real LLM API.",
    "[Dummy response] BarefootJS compiles JSX to Jinja2 templates + client JS. Signals drive reactivity on any backend.",
    "[Dummy response] SSE (Server-Sent Events) lets the server push data to the client over a single HTTP connection.",
    "[Dummy response] The Jinja backend runs under any ASGI app -- here Uvicorn streams each character with a 30ms delay.",
    "[Dummy response] Out-of-Order Streaming SSR and interactive SSE streaming are two different features of BarefootJS.",
]

# ---------------------------------------------------------------------------
# Routes -- FastAPI's `APIRouter(prefix=...)` handles the $BASE mount point
# for us (unlike app.psgi's hand-rolled regex router, Starlette's own routing
# table does the path matching); one async view function per route, mirroring
# app.psgi's `*_route` subs one-for-one. Handlers are `async def` even though
# the rendering path itself is sync CPU work (Jinja rendering, no I/O) --
# that keeps the shape uniform with the SSE route, which genuinely needs to
# be async (see ai_chat_stream below).
# ---------------------------------------------------------------------------
router = APIRouter(prefix=BASE)


@router.get("/")
async def home_route() -> Response:
    return html_response(home_page())


@router.get("/counter")
async def counter_route() -> Response:
    return html_response(render_component("Counter", heading="Counter Component"))


@router.get("/toggle")
async def toggle_route() -> Response:
    items = [
        {"label": "Setting 1", "defaultOn": True},
        {"label": "Setting 2", "defaultOn": False},
        {"label": "Setting 3", "defaultOn": False},
    ]
    return html_response(
        render_component(
            "Toggle",
            heading="Toggle Component",
            children={"toggle_item": "ToggleItem"},
            props={"toggleItems": items},
            stash={"toggleItems": items},
        )
    )


@router.get("/form")
async def form_route() -> Response:
    return html_response(render_component("Form", heading="Form Example", props={}, stash={"accepted": False}))


@router.get("/reactive-props")
async def reactive_props_route() -> Response:
    return html_response(
        render_component(
            "ReactiveProps",
            heading="Reactive Props Test",
            children={"reactive_child": "ReactiveChild"},
            props={},
            stash={"count": 0, "doubled": 0},
        )
    )


@router.get("/props-reactivity")
async def props_reactivity_route() -> Response:
    # Not in the task's headline route list, but required: the shared
    # `reactive-props.spec.ts` e2e suite (imported wholesale, like every
    # other adapter integration) has a "Props Access" describe block that
    # navigates to `${baseUrl}/props-reactivity` -- see
    # integrations/shared/e2e/reactive-props.spec.ts. No `signal_init`
    # override is needed here (unlike app.psgi's Kolon port): PropsStyleChild
    # / DestructuredStyleChild's compiled templates already derive
    # `displayValue` in-template (`{% set displayValue = value * 10 %}`).
    return html_response(
        render_component(
            "PropsReactivityComparison",
            heading="Props Reactivity Comparison",
            children={
                "props_style_child": "PropsStyleChild",
                "destructured_style_child": "DestructuredStyleChild",
            },
            props={},
            stash={"count": 1},
        )
    )


@router.get("/conditional-return")
@router.get("/conditional-return-link")
async def conditional_return_route(request: Request) -> Response:
    variant = "link" if request.url.path.endswith("-link") else ""
    return html_response(
        render_component(
            "ConditionalReturn",
            heading="Conditional Return Example" + (" (Link)" if variant else ""),
            props={"variant": variant},
            stash={"variant": variant, "count": 0},
        )
    )


@router.get("/portal")
async def portal_route() -> Response:
    return html_response(render_component("PortalExample", heading="Portal Example", props={}, stash={"open": False}))


@router.get("/ai-chat")
async def ai_chat_route() -> Response:
    return html_response(
        render_component(
            "AIChatInteractive",
            title="AI Chat -- SSE Streaming (FastAPI)",
            heading="AI Chat -- SSE Streaming",
            stash={"messages": [], "input": "", "streamingText": "", "isStreaming": False},
            extra_css=f'<link rel="stylesheet" href="{BASE}/styles/ai-chat.css">',
        )
    )


@router.get("/todos")
@router.get("/todos-ssr")
async def todos_route(request: Request) -> Response:
    session, minted = get_session(request)
    todos = [dict(t) for t in session["todos"]]
    done = sum(1 for t in todos if t["done"])
    component = "TodoAppSSR" if request.url.path.endswith("-ssr") else "TodoApp"
    html = render_component(
        component,
        children={"todo_item": "TodoItem"},
        props={"initialTodos": todos},
        stash={"todos": todos, "newText": "", "filter": "all", "doneCount": done},
    )
    return with_session_cookie(html_response(html), minted)


# --- todo REST API handlers ---
@router.get("/api/todos")
async def api_todos_list(request: Request) -> Response:
    session, minted = get_session(request)
    return with_session_cookie(json_response(session["todos"]), minted)


@router.post("/api/todos")
async def api_todos_create(request: Request) -> Response:
    session, minted = get_session(request)
    try:
        body = await request.json()
    except _json.JSONDecodeError:
        body = {}
    todo = {"id": session["next_id"], "text": body.get("text"), "done": False, "editing": False}
    session["next_id"] += 1
    session["todos"].append(todo)
    return with_session_cookie(json_response(todo, 201), minted)


@router.put("/api/todos/{todo_id}")
async def api_todos_update(todo_id: int, request: Request) -> Response:
    session, _minted = get_session(request)
    try:
        body = await request.json()
    except _json.JSONDecodeError:
        body = {}
    for todo in session["todos"]:
        if todo["id"] != todo_id:
            continue
        if "text" in body:
            todo["text"] = body["text"]
        if "done" in body:
            todo["done"] = jbool(body["done"])
        return json_response(todo)
    return json_response({"error": "not found"}, 404)


@router.delete("/api/todos/{todo_id}")
async def api_todos_delete(todo_id: int, request: Request) -> Response:
    session, _minted = get_session(request)
    session["todos"] = [t for t in session["todos"] if t["id"] != todo_id]
    return Response(status_code=204)


@router.post("/api/todos/reset")
async def api_todos_reset(request: Request) -> Response:
    session, minted = get_session(request)
    session["todos"] = seed_todos()
    session["next_id"] = 4
    return with_session_cookie(Response(content="ok", media_type="text/plain"), minted)


# Char-by-char SSE stream. Unlike Flask's threaded dev server (which needs a
# worker thread per blocking `time.sleep`), Uvicorn's single-threaded async
# event loop means this generator MUST await `asyncio.sleep` rather than call
# the blocking `time.sleep` -- a blocking sleep here would stall every other
# in-flight request on the same worker for the life of the stream. This is
# the FastAPI-specific deviation from app.py's Flask counterpart: async def
# generator + asyncio.sleep instead of a sync generator + threaded=True.
@router.get("/api/ai-chat")
async def ai_chat_stream() -> StreamingResponse:
    text = random.choice(AI_RESPONSES)

    async def generate():
        for ch in text:
            yield f"data: {_json.dumps(ch)}\n\n"
            await asyncio.sleep(0.03)
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


def home_page() -> str:
    body = f"""<p>This example renders the same shared JSX components with Jinja2
under a plain FastAPI app.</p>
<ul>
    <li><a href="{BASE}/counter">Counter</a></li>
    <li><a href="{BASE}/toggle">Toggle</a></li>
    <li><a href="{BASE}/form">Form</a></li>
    <li><a href="{BASE}/reactive-props">Reactive Props</a></li>
    <li><a href="{BASE}/conditional-return">Conditional Return</a></li>
    <li><a href="{BASE}/portal">Portal</a></li>
    <li><a href="{BASE}/todos">Todo (@client)</a></li>
    <li><a href="{BASE}/todos-ssr">Todo (no @client markers)</a></li>
    <li><a href="{BASE}/ai-chat">AI Chat (SSE Streaming)</a></li>
</ul>
"""
    return layout(
        title="BarefootJS + FastAPI Example",
        heading="BarefootJS + FastAPI Example",
        back="",
        scripts="",
        body=body,
    )


app.include_router(router)

# --- static assets: dist/client + dist/styles, mounted under $BASE ---
# StaticFiles mounts (Starlette sub-apps) rather than per-file routes like
# Flask's `send_from_directory` view functions -- FastAPI's idiomatic way to
# serve a directory tree.
app.mount(f"{BASE}/client", StaticFiles(directory=str(HERE / "dist" / "client")), name="client")
app.mount(f"{BASE}/styles", StaticFiles(directory=str(HERE / "dist" / "styles")), name="styles")


# A bare-root request redirects into the base path (mirrors app.psgi's
# `mount '/' => sub { [302, [Location => "$BASE/"], []] }`).
@app.get("/")
async def root_redirect() -> Response:
    return RedirectResponse(url=f"{BASE}/")


if __name__ == "__main__":
    # `FASTAPI_DEBUG=1` (set by `bun run dev` / Dockerfile.dev) turns on
    # Uvicorn's `--reload` file watcher, which restarts the process on
    # app.py / lib changes -- the Python analogue of Starman's `plackup -R`
    # / Werkzeug's stat reloader. Reload mode requires passing an import
    # string rather than the live `app` object, so branch on it.
    watch = os.environ.get("FASTAPI_DEBUG", "0") == "1"
    if watch:
        uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)
    else:
        uvicorn.run(app, host="0.0.0.0", port=PORT)
