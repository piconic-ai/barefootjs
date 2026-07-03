#!/usr/bin/env python3
"""BarefootJS + Flask example.

Python/Flask port of integrations/xslate/app.psgi. Structured the same way
(section-by-section, same route table shape, same session/child-renderer
helpers) so the two files can be diffed side by side; only the Perl->Python
and Plack->Flask idiom differences change.

`lib` is populated by scripts/assemble-deps.ts at build time (used in the
container / CI); the workspace source dir is added to `sys.path` too so
local dev resolves without the assemble step. Either location works.
"""

from __future__ import annotations

import json as _json
import os
import random
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Optional

HERE = Path(__file__).resolve().parent
for candidate in (HERE / "lib", HERE.parent.parent / "packages" / "adapter-jinja" / "python"):
    p = str(candidate)
    if candidate.is_dir() and p not in sys.path:
        sys.path.insert(0, p)

from flask import Blueprint, Flask, Response, jsonify, redirect, request, send_from_directory, stream_with_context

from barefootjs import BarefootJS
from barefootjs.backend_jinja import JinjaBackend

# URL prefix the app is mounted under. Defaults to /integrations/flask so the
# app is deploy-ready for barefootjs.dev/integrations/flask.
BASE = os.environ.get("BASE_PATH", "/integrations/flask")
PORT = int(os.environ.get("PORT", "3008"))
# Mirrors app.psgi's `PLACK_ENV` dev/production switch (Flask's own
# FLASK_DEBUG only controls Flask's error pages / reloader, not our
# hand-rolled Jinja Environment, so we read a parity env var directly).
DEV = os.environ.get("FLASK_ENV", "development") != "production"

app = Flask(__name__)

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

# The blog post corpus -- generated at build time by scripts/gen-blog-data.ts
# from ../shared/blog/posts.ts (the single TS source of truth the JS adapters
# import directly; this Python server reads the JSON mirror instead). See
# BLOG_DATA's use in the blog routes below.
try:
    BLOG_DATA: dict[str, Any] = _json.loads((HERE / "dist" / "blog-data.json").read_text())
except FileNotFoundError:
    BLOG_DATA = {"posts": [], "listItems": [], "allTags": []}


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


def get_session() -> tuple[dict[str, Any], Optional[str]]:
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
            httponly=True, samesite="Lax",
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
                <span class="bf-header-current" aria-current="page">Flask</span>
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
    return Response(html, status=status, mimetype="text/html")


def json_response(data: Any, status: int = 200) -> Response:
    resp = jsonify(data)
    resp.status_code = status
    return resp


# ---------------------------------------------------------------------------
# AI Chat dummy responses (streamed char-by-char over SSE).
# ---------------------------------------------------------------------------
AI_RESPONSES = [
    "[Dummy response] This text is streaming one character at a time via SSE. In production, replace /api/ai-chat with a real LLM API.",
    "[Dummy response] BarefootJS compiles JSX to Jinja2 templates + client JS. Signals drive reactivity on any backend.",
    "[Dummy response] SSE (Server-Sent Events) lets the server push data to the client over a single HTTP connection.",
    "[Dummy response] The Jinja backend runs under any WSGI app -- here Flask's dev server streams each character with a 30ms delay.",
    "[Dummy response] Out-of-Order Streaming SSR and interactive SSE streaming are two different features of BarefootJS.",
]

# ---------------------------------------------------------------------------
# Routes -- Flask's `url_prefix` handles the $BASE mount point for us (unlike
# app.psgi's hand-rolled regex router, Werkzeug's own routing table does the
# path matching); one view function per route, mirroring app.psgi's
# `*_route` subs one-for-one.
# ---------------------------------------------------------------------------
bp = Blueprint("flask_example", __name__, url_prefix=BASE)


@bp.get("/")
def home_route():
    return html_response(home_page())


@bp.get("/counter")
def counter_route():
    return html_response(render_component("Counter", heading="Counter Component"))


@bp.get("/toggle")
def toggle_route():
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


@bp.get("/form")
def form_route():
    return html_response(render_component("Form", heading="Form Example", props={}, stash={"accepted": False}))


@bp.get("/reactive-props")
def reactive_props_route():
    return html_response(
        render_component(
            "ReactiveProps",
            heading="Reactive Props Test",
            children={"reactive_child": "ReactiveChild"},
            props={},
            stash={"count": 0, "doubled": 0},
        )
    )


@bp.get("/props-reactivity")
def props_reactivity_route():
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


@bp.get("/conditional-return")
@bp.get("/conditional-return-link")
def conditional_return_route():
    variant = "link" if request.path.endswith("-link") else ""
    return html_response(
        render_component(
            "ConditionalReturn",
            heading="Conditional Return Example" + (" (Link)" if variant else ""),
            props={"variant": variant},
            stash={"variant": variant, "count": 0},
        )
    )


@bp.get("/portal")
def portal_route():
    return html_response(render_component("PortalExample", heading="Portal Example", props={}, stash={"open": False}))


@bp.get("/ai-chat")
def ai_chat_route():
    return html_response(
        render_component(
            "AIChatInteractive",
            title="AI Chat -- SSE Streaming (Flask)",
            heading="AI Chat -- SSE Streaming",
            stash={"messages": [], "input": "", "streamingText": "", "isStreaming": False},
            extra_css=f'<link rel="stylesheet" href="{BASE}/styles/ai-chat.css">',
        )
    )


@bp.get("/todos")
@bp.get("/todos-ssr")
def todos_route():
    session, minted = get_session()
    todos = [dict(t) for t in session["todos"]]
    done = sum(1 for t in todos if t["done"])
    component = "TodoAppSSR" if request.path.endswith("-ssr") else "TodoApp"
    html = render_component(
        component,
        children={"todo_item": "TodoItem"},
        props={"initialTodos": todos},
        stash={"todos": todos, "newText": "", "filter": "all", "doneCount": done},
    )
    return with_session_cookie(html_response(html), minted)


# --- todo REST API handlers ---
@bp.get("/api/todos")
def api_todos_list():
    session, minted = get_session()
    return with_session_cookie(json_response(session["todos"]), minted)


@bp.post("/api/todos")
def api_todos_create():
    session, minted = get_session()
    body = request.get_json(silent=True) or {}
    todo = {"id": session["next_id"], "text": body.get("text"), "done": False, "editing": False}
    session["next_id"] += 1
    session["todos"].append(todo)
    return with_session_cookie(json_response(todo, 201), minted)


@bp.put("/api/todos/<int:todo_id>")
def api_todos_update(todo_id: int):
    session, _minted = get_session()
    body = request.get_json(silent=True) or {}
    for todo in session["todos"]:
        if todo["id"] != todo_id:
            continue
        if "text" in body:
            todo["text"] = body["text"]
        if "done" in body:
            todo["done"] = jbool(body["done"])
        return json_response(todo)
    return json_response({"error": "not found"}, 404)


@bp.delete("/api/todos/<int:todo_id>")
def api_todos_delete(todo_id: int):
    session, _minted = get_session()
    session["todos"] = [t for t in session["todos"] if t["id"] != todo_id]
    return Response(status=204)


@bp.post("/api/todos/reset")
def api_todos_reset():
    session, minted = get_session()
    session["todos"] = seed_todos()
    session["next_id"] = 4
    return with_session_cookie(Response("ok", mimetype="text/plain"), minted)


# Char-by-char SSE stream. Flask's dev server needs `threaded=True` (set in
# `if __name__ == '__main__'` below) for this generator's blocking 30ms
# sleeps to not stall other in-flight requests -- the Python/WSGI equivalent
# of app.psgi relying on Starman's prefork pool.
@bp.get("/api/ai-chat")
def ai_chat_stream():
    text = random.choice(AI_RESPONSES)

    def generate():
        for ch in text:
            yield f"data: {_json.dumps(ch)}\n\n"
            time.sleep(0.03)
        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


# --- static assets: dist/client + dist/styles, mounted under $BASE ---
@bp.get("/client/<path:filename>")
def client_static(filename: str):
    return send_from_directory(HERE / "dist" / "client", filename)


@bp.get("/styles/<path:filename>")
def styles_static(filename: str):
    return send_from_directory(HERE / "dist" / "styles", filename)


# ---------------------------------------------------------------------------
# Blog -- the @barefootjs/router showcase (Flask/Jinja2).
#
# Mirrors integrations/xslate/app.psgi's blog section (and the Go/Mojolicious
# ports): a region-shell layout (header + ThemeToggle in the shell, a
# hand-authored sidebar region `nav:0` + the compiled <PageShell> nested
# content regions in the main column) whose islands are the shared blog
# components in ../shared/blog, compiled by this integration's `bf build`.
# The client router (client/router-entry.ts, bundled to
# client/router-entry.js) swaps only the content region.
#
# There is no special server-side "partial navigation" endpoint: the router
# (packages/router/src/router.ts) fetches a full HTML page for every
# navigation and diffs `[bf-region]` boundaries client-side, so every blog
# route below just returns a normal HTML document -- the same "any backend,
# zero cooperation" point the other adapters' blog ports make.
#
# searchParams() SSR (#2076): PostList imports `createSearchParams()`, and
# simple memos derived directly from it now SSR-compute in-template (see
# search-params-derived-memo / search-params-derived-filter in
# packages/adapter-tests/fixtures). PostList's own `params` memo returns an
# OBJECT (`{ sort, tag }`) built through a helper function (`asSortKey`), and
# `sortClass`/`tagClass` are plain functions called with different literal
# arguments per link -- shapes the seed plan does not lower (the manifest's
# `ssrDefaults` for PostList shows `params`/`visible` as `null`, i.e. still
# caller-provided). We seed `params` from the request query (validated the
# same way the client's `asSortKey` would) and `visible` with the full list;
# the client re-derives the sorted/filtered list + active sort/tag highlight
# from `searchParams()` on hydration. This is the `stash_from_ssr_defaults`-
# adjacent "render-context derivation" the task calls out as sanctioned --
# not a workaround, just supplying what the static extractor cannot.
# ---------------------------------------------------------------------------
BLOG_SORT_KEYS = ("date", "title", "tag")


def as_sort_key(raw: Optional[str]) -> str:
    """Mirrors PostList's `asSortKey`: an unknown/absent `?sort=` falls back
    to 'date' so the SSR row order always matches a valid post-hydration
    state."""
    return raw if raw in BLOG_SORT_KEYS else "date"


def _register_blog_child(
    parent_bf: BarefootJS, slot: str, component: str, extra_seed: Optional[dict] = None,
) -> None:
    """Register a renderer for a flat (non-`ui/*`) child component from the
    build manifest (`post_list_item` -> PostListItem, `reader_toolbar` ->
    ReaderToolbar): a fresh child scope chained off the caller's slot, the
    shared script collector + renderer registry, and the manifest's
    ssrDefaults seeded (caller prop wins)."""
    entry = MANIFEST.get(component)
    if not entry:
        return
    defaults = entry.get("ssrDefaults")

    def make_renderer(
        component: str = component, defaults: Optional[dict] = defaults, extra_seed: dict = extra_seed or {},
    ) -> Callable:
        def renderer(props: dict, caller: Optional[BarefootJS] = None) -> str:
            host = caller or parent_bf
            host_scope = host._scope_id()
            child = BarefootJS(None, {"backend": backend})
            slot_id = props.pop("_bf_slot", None)
            data_key = props.pop("key", None)
            if data_key is not None:
                child._data_key(data_key)
            child._scope_id(f"{host_scope}_{slot_id}" if slot_id else f"{component}_{rand_suffix()}")
            child._is_child(True)
            if slot_id:
                child._bf_parent(host_scope)
                child._bf_mount(slot_id)
            child._child_renderers(parent_bf._child_renderers())
            child._scripts(parent_bf._scripts())
            child._script_seen(parent_bf._script_seen())
            extra = stash_from_ssr_defaults(component, props) if defaults else {}
            return backend.render_named(component, child, {**extra, **extra_seed, **props})

        return renderer

    parent_bf.register_child_renderer(slot, make_renderer())


def blog_island(
    root: BarefootJS,
    component: str,
    props: Optional[dict] = None,
    extra: Optional[dict] = None,
    children: Optional[dict] = None,
) -> str:
    """Render one top-level island to an HTML string, sharing `root`'s script
    collector + renderer registry so islands compose into one page.

        props    -- client props (-> bf-p, so the client hydration sees them,
                    AND template vars)
        extra    -- SSR-only template vars (derived memo / getter values not
                    lowered)
        children -- slot key -> child template name, or (template, extra_seed)
    """
    props = props or {}
    extra = extra or {}
    children = children or {}
    bf = BarefootJS(None, {"backend": backend})
    bf._scope_id(f"{component}_{rand_suffix()}")
    if props:
        bf._props(props)
    bf._scripts(root._scripts())
    bf._script_seen(root._script_seen())
    bf._child_renderers(root._child_renderers())
    for slot, spec in children.items():
        template_name, seed = spec if isinstance(spec, tuple) else (spec, {})
        _register_blog_child(bf, slot, template_name, seed)
    seed = stash_from_ssr_defaults(component, props)
    return backend.render_named(component, bf, {**seed, **props, **extra})


def blog_page(root: BarefootJS, title: str, base: str, content_html: str) -> str:
    """Assemble the region-shell page around already-rendered content HTML.
    `root` is the request-scoped runtime whose script collector the content
    islands (and the shell islands rendered here) all share."""
    static = f"{BASE}/client"
    theme = blog_island(root, "ThemeToggle")
    sidebar = blog_island(root, "Sidebar")
    shell = blog_island(
        root, "PageShell",
        {},                                              # no client props
        {"children": backend.mark_raw(content_html)},     # SSR-only: page content
        {"reader_toolbar": "ReaderToolbar"},
    )
    import_map = _json.dumps({
        "imports": {
            "@barefootjs/client": f"{static}/barefoot.js",
            "@barefootjs/client/runtime": f"{static}/barefoot.js",
            "@barefootjs/client/reactive": f"{static}/barefoot.js",
        }
    })
    scripts = root.scripts()
    esc_title = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f"""<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc_title}</title>
<script type="importmap">{import_map}</script>
<link rel="stylesheet" href="{BASE}/styles/blog.css">
</head>
<body>
<header class="shell">
<a class="shell-brand" href="{base}">\U0001F4F0 Barefoot Blog</a>
<div class="shell-island">{theme}</div>
</header>
<div class="layout">
<aside bf-region="nav:0">{sidebar}</aside>
<main>{shell}</main>
</div>
{scripts}
<script type="module" src="{static}/router-entry.js"></script>
</body>
</html>
"""


@bp.get("/blog")
def blog_index_route():
    root = BarefootJS(None, {"backend": backend})
    base = f"{BASE}/blog"
    sort = as_sort_key(request.args.get("sort"))
    tag = request.args.get("tag") or ""
    items = BLOG_DATA["listItems"]
    post_list = blog_island(
        root, "PostList",
        # Client props (-> bf-p): `visible()` re-derives from these on every
        # `searchParams()` change, so they must reach the client.
        {"items": items, "tags": BLOG_DATA["allTags"], "base": base},
        {
            # SSR-only derived values -- see the blog section docstring above
            # for why these can't be lowered in-template. `params` from the
            # request query (correct server-side labels); `visible` falls
            # back to the full list. `sortClass`/`tagClass`/`root` are the
            # neutral defaults the compiled template's collapsed per-link
            # getters share -- the client sets the correct active
            # highlight + hrefs from searchParams.
            "params": {"sort": sort, "tag": tag},
            "visible": items,
            "sortClass": "sort",
            "root": base,
            "tagClass": "tag",
        },
        {"post_list_item": "PostListItem"},
    )
    now = blog_island(root, "NowPlaying", {}, {"Math": {"min": 0}})
    title = f"#{tag} — Barefoot Blog" if tag else "Barefoot Blog — Latest posts"
    return html_response(blog_page(root, title, base, post_list + now))


@bp.get("/blog/posts/<slug>")
def blog_post_route(slug: str):
    # Sort newest-first (the index's default display order) so the article
    # pager walks down the list the reader is browsing; the corpus is
    # authored oldest-first.
    posts = sorted(BLOG_DATA["posts"], key=lambda p: p["date"], reverse=True)
    idx = next((i for i, p in enumerate(posts) if p["slug"] == slug), None)
    if idx is None:
        return Response("Not Found", status=404, mimetype="text/plain")
    p = posts[idx]
    prev_post = posts[idx - 1] if idx > 0 else None
    next_post = posts[idx + 1] if idx < len(posts) - 1 else None
    base = f"{BASE}/blog"
    root = BarefootJS(None, {"backend": backend})
    # The whole article is the shared <PostArticle> island; the interactive
    # widgets are its nested children (NowPlaying needs Math seeded).
    content = blog_island(
        root, "PostArticle",
        {
            "slug": p["slug"], "title": p["title"], "date": p["date"],
            "tags": p["tags"], "body": p["body"],
            "position": idx + 1, "total": len(posts), "base": base,
            "prevSlug": prev_post["slug"] if prev_post else None,
            "prevTitle": prev_post["title"] if prev_post else None,
            "nextSlug": next_post["slug"] if next_post else None,
            "nextTitle": next_post["title"] if next_post else None,
        },
        {},
        {
            "like_button": "LikeButton",
            "reading_timer": "ReadingTimer",
            "now_playing": ("NowPlaying", {"Math": {"min": 0}}),
        },
    )
    return html_response(blog_page(root, f"{p['title']} — Barefoot Blog", base, content))


def home_page() -> str:
    body = f"""<p>This example renders the same shared JSX components with Jinja2
under a plain Flask app.</p>
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
    <li><a href="{BASE}/blog">Blog (@barefootjs/router - partial navigation)</a></li>
</ul>
"""
    return layout(
        title="BarefootJS + Flask Example",
        heading="BarefootJS + Flask Example",
        back="",
        scripts="",
        body=body,
    )


app.register_blueprint(bp)


# A bare-root request redirects into the base path (mirrors app.psgi's
# `mount '/' => sub { [302, [Location => "$BASE/"], []] }`).
@app.get("/")
def root_redirect():
    return redirect(f"{BASE}/")


if __name__ == "__main__":
    # `threaded=True` so the SSE route (a blocking per-character sleep loop)
    # doesn't stall the rest of the app -- see ai_chat_stream's docstring.
    # `FLASK_DEBUG=1` (set by `bun run dev` / Dockerfile.dev) turns on
    # Werkzeug's stat-based reloader, which restarts the process on app.py /
    # lib changes -- the Python analogue of Starman's `plackup -R`.
    watch = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=PORT, threaded=True, debug=watch, use_reloader=watch)
