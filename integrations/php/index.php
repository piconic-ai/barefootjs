<?php

declare(strict_types=1);

/**
 * BarefootJS + plain PHP example.
 *
 * PHP/Twig port of integrations/flask/app.py (itself a port of
 * integrations/xslate/app.psgi). Structured the same way (section-by-section,
 * same route table shape, same session/child-renderer helpers) so the two
 * files can be diffed side by side; only the Python/Flask -> PHP idiom
 * differences change (a hand-rolled front-controller router instead of
 * Werkzeug's routing table -- plain PHP has no framework router -- and a
 * file-backed session store instead of an in-process dict, see the SESSION
 * STORAGE section below for why).
 *
 * Served by PHP's built-in web server as a "router script":
 *   php -S 0.0.0.0:$PORT index.php
 * `PHP_CLI_SERVER_WORKERS=8` (set by package.json's dev/test:e2e scripts and
 * the Dockerfiles) gives the built-in server a small worker-process pool so
 * the SSE stream (a per-character blocking loop, see ai_chat_stream_route)
 * doesn't stall the rest of the app, and so parallel asset requests (CSS/JS
 * fetched concurrently by the browser) don't queue behind it -- the
 * PHP-built-in-server analogue of Flask's `threaded=True` dev server /
 * Starman's prefork pool.
 *
 * RUNTIME AUTOLOAD -- mirrors app.py's `sys.path` dance (see its HERE / lib
 * comment): `./lib` is populated by `scripts/assemble-deps.ts` at build time
 * (used in the container / CI, via `composer install` against THIS
 * directory's composer.json, see that file's docstring); the workspace
 * package's own already-`composer install`-ed vendor dir
 * (`packages/adapter-twig/php/vendor`) is tried as a fallback so local dev
 * resolves without the assemble/build step -- it resolves the engine-
 * agnostic runtime (`packages/adapter-php`) via its `barefootjs/runtime`
 * composer path-repo dependency (see that package's composer.json). Either
 * location provides the `Barefoot\*` runtime classes, `Barefoot\TwigBackend`,
 * and `twig/twig`.
 */

$HERE = __DIR__;
$assembledAutoload = $HERE . '/vendor/autoload.php';
$workspaceAutoload = $HERE . '/../../packages/adapter-twig/php/vendor/autoload.php';
if (is_file($assembledAutoload)) {
    require $assembledAutoload;
} elseif (is_file($workspaceAutoload)) {
    require $workspaceAutoload;
} else {
    http_response_code(500);
    header('Content-Type: text/plain');
    echo "BarefootJS runtime not found. Run `bun run build` (or `composer install` after "
        . "`bun run scripts/assemble-deps.ts`) in integrations/php first.\n";
    exit(1);
}

use Barefoot\BarefootJS;
use Barefoot\TwigBackend;

// URL prefix the app is mounted under. Defaults to /integrations/php so the
// app is deploy-ready for barefootjs.dev/integrations/php.
$BASE = rtrim(getenv('BASE_PATH') ?: '/integrations/php', '/');
$PORT = (int) (getenv('PORT') ?: 3013);
// Mirrors app.py's `FLASK_ENV` dev/production switch (there is no PHP-wide
// standard for this, so -- like Flask's own `FLASK_DEBUG` only controlling
// error pages/reloader, not our hand-rolled Twig Environment -- we read a
// parity env var directly). Dockerfile (production) sets APP_ENV=production;
// dev / e2e leave it unset (falls through to "development").
$DEV = (getenv('APP_ENV') ?: 'development') !== 'production';

// One TwigBackend renders every component from dist/templates. In dev the
// template cache is disabled (`cache: false`) and `auto_reload: true` so
// edits picked up by `bun run build:watch` render on the next request
// without a server restart -- the PHP-runtime equivalent of app.py's
// JinjaBackend `cache_size=0 if DEV else 400`. There is no PHP port of
// BarefootJS::DevReload (browser push on file change) yet, same as the Flask
// port's documented gap.
$backend = new TwigBackend([
    'paths' => [$HERE . '/dist/templates'],
    'environment_options' => [
        'cache' => $DEV ? false : sys_get_temp_dir() . '/twig-cache',
        'auto_reload' => $DEV,
    ],
]);

// The build manifest -- a plain build artifact (dist/templates/manifest.json),
// not adapter internals -- lists each component's `ssrDefaults`: the set of
// signal/memo names an optional-prop-derived initial value needs BOUND (to
// the real prop or to `null`) in the render context. This integration's
// shared components aren't manifest-registered under `ui/*` (see
// render_component's manual child wiring below, mirroring app.py's comment),
// so root-level renders derive the stash themselves via
// stash_from_ssr_defaults(), the same way app.py does.
$manifestPath = $HERE . '/dist/templates/manifest.json';
$MANIFEST = is_file($manifestPath) ? (json_decode(file_get_contents($manifestPath), true) ?: []) : [];

// The blog post corpus -- generated at build time by scripts/gen-blog-data.ts
// from ../shared/blog/posts.ts (the single TS source of truth the JS adapters
// import directly; this PHP server reads the JSON mirror instead). See
// BLOG_DATA's use in the blog routes below.
$blogDataPath = $HERE . '/dist/blog-data.json';
$BLOG_DATA = is_file($blogDataPath)
    ? (json_decode(file_get_contents($blogDataPath), true) ?: ['posts' => [], 'listItems' => [], 'allTags' => []])
    : ['posts' => [], 'listItems' => [], 'allTags' => []];

/**
 * Port of BarefootJS::deriveStashFromDefaults for root-level renders (see the
 * $MANIFEST comment above for why root renders need their own copy instead
 * of getting it via `register_components_from_manifest`).
 *
 * Why this matters: a signal whose initial value derives from an optional
 * prop (`const [count] = createSignal(props.initial ?? 0)`) is seeded
 * in-template as `{% set count = (initial ?? 0) %}` (see
 * packages/adapter-twig's memo/seed lowering) -- that lowering expects
 * `initial` to always be BOUND in the render context (to the real value or
 * to `null`), never omitted outright, since Twig's `strict_variables: false`
 * makes an undefined variable coalesce silently via `??` too, BUT an
 * entirely absent key still needs the SAME value here as every other adapter
 * so the seeded arithmetic never diverges. Without this, `/counter` would
 * render with the wrong initial value whenever `initial` is a real prop (the
 * same shape as the ssrDefaults contract's `propName` field documents).
 */
function stash_from_ssr_defaults(string $component, array $props): array
{
    global $MANIFEST;
    $entry = $MANIFEST[$component] ?? [];
    $defaults = $entry['ssrDefaults'] ?? [];
    $extra = [];
    foreach ($defaults as $name => $d) {
        if (!is_array($d)) {
            $extra[$name] = $d;
            continue;
        }
        $propName = $d['propName'] ?? null;
        if ($propName !== null && array_key_exists($propName, $props) && $props[$propName] !== null) {
            $extra[$name] = $props[$propName];
        } else {
            $extra[$name] = $d['value'] ?? null;
        }
    }
    return $extra;
}

// ---------------------------------------------------------------------------
// Per-session file-backed todo storage.
//
// app.py (and the Perl/Xslate reference before it) keeps this in a plain
// process-local dict, safe because Flask's dev server (threaded=True) and
// Starman's prefork workers still share one interpreter's memory space per
// worker for the LIFETIME of a request but Python's dict itself lives in ONE
// process. PHP's built-in server run with `PHP_CLI_SERVER_WORKERS=8` (see
// this file's top docstring) is different: it forks 8 SEPARATE worker
// processes up front, round-robins requests across them, and each process
// has its OWN memory -- an in-memory PHP array would make a browser's todo
// list flicker between two (or three, or eight) completely different lists
// depending on which worker happened to answer each request. So the session
// store here is a small JSON file per session id (keyed by the `bf_session`
// cookie) under the system temp dir, guarded by `flock()` so concurrent
// requests to the SAME session (even across worker processes) still
// serialize correctly. No LRU eviction (unlike app.py's SESSION_STORE_MAX):
// this is a demo, files are tiny, and OS temp dirs get reaped independently.
// ---------------------------------------------------------------------------
const SESSION_COOKIE = 'bf_session';
const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

function seed_todos(): array
{
    return [
        ['id' => 1, 'text' => 'Setup project', 'done' => false, 'editing' => false],
        ['id' => 2, 'text' => 'Create components', 'done' => false, 'editing' => false],
        ['id' => 3, 'text' => 'Write tests', 'done' => true, 'editing' => false],
    ];
}

function session_dir(): string
{
    $dir = sys_get_temp_dir() . '/barefootjs-php-sessions';
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }
    return $dir;
}

function session_file(string $sid): string
{
    // Session ids are minted here (hex-only, see new_session_id), but guard
    // against a hostile/garbled cookie value reaching the filesystem path
    // anyway.
    $safe = preg_replace('/[^a-zA-Z0-9]/', '', $sid);
    return session_dir() . '/' . $safe . '.json';
}

function new_session_id(): string
{
    return bin2hex(random_bytes(16));
}

/** Returns [sid, is_new_cookie]. The caller sets the cookie on the response
 * only when a new id was minted (mirrors app.py's get_session()). */
function resolve_session_id(): array
{
    $sid = $_COOKIE[SESSION_COOKIE] ?? null;
    if (is_string($sid) && $sid !== '' && preg_match('/^[a-f0-9]{32}$/', $sid)) {
        return [$sid, false];
    }
    return [new_session_id(), true];
}

/**
 * Read-modify-write a session's `{todos, next_id}` state under an exclusive
 * lock: `$mutator` receives the current state array and must return
 * `[$newState, $result]`; `$result` is returned to the caller. Opens with
 * `c+` (create-if-missing, don't truncate) so the lock covers the seed-on-
 * first-access case too.
 */
function with_session(string $sid, callable $mutator)
{
    $fh = fopen(session_file($sid), 'c+');
    if ($fh === false) {
        throw new \RuntimeException('failed to open session store');
    }
    try {
        flock($fh, LOCK_EX);
        $raw = stream_get_contents($fh);
        $state = ($raw !== false && $raw !== '') ? json_decode($raw, true) : null;
        if (!is_array($state) || !isset($state['todos'], $state['next_id'])) {
            $state = ['todos' => seed_todos(), 'next_id' => 4];
        }
        [$state, $result] = $mutator($state);
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($state));
        fflush($fh);
        return $result;
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

/** Shared-lock read-only accessor for routes that only need the current
 * todo list (GET /todos, GET /api/todos) -- avoids taking the exclusive
 * lock `with_session` needs for a read-modify-write cycle. */
function read_session(string $sid): array
{
    $path = session_file($sid);
    if (!is_file($path)) {
        // First visit: seed + persist under the exclusive lock, then return.
        return with_session($sid, fn (array $s) => [$s, $s]);
    }
    $fh = fopen($path, 'r');
    if ($fh === false) {
        return ['todos' => seed_todos(), 'next_id' => 4];
    }
    flock($fh, LOCK_SH);
    $raw = stream_get_contents($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    $state = json_decode((string) $raw, true);
    return (is_array($state) && isset($state['todos'], $state['next_id']))
        ? $state
        : ['todos' => seed_todos(), 'next_id' => 4];
}

function set_session_cookie(string $sid): void
{
    global $BASE;
    setcookie(SESSION_COOKIE, $sid, [
        'expires' => time() + SESSION_TTL_SEC,
        'path' => $BASE !== '' ? $BASE : '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

// ---------------------------------------------------------------------------
// Rendering: build a per-request runtime, register child renderers, render
// the component template, and wrap the result in the page layout.
// ---------------------------------------------------------------------------
function rand_suffix(): string
{
    return substr(bin2hex(random_bytes(4)), 0, 6);
}

/**
 * Root-level script collector. `BarefootJS::register_script()` reads its
 * OWN instance's `_scripts()`/`_script_seen()` state, mutates a value it got
 * from the getter, and writes it back with the setter -- in Perl/Python that
 * "value" is a list/dict passed around BY REFERENCE (the same underlying
 * object every accessor call returns), so a component nested three levels
 * deep can `register_script()` and have it show up when the ROOT instance's
 * `scripts()` is read at the very end. Plain PHP arrays are copy-on-write
 * VALUES, not references: `$child->_scripts($parent->_scripts())` would copy
 * the array's current contents into the child, and anything the child later
 * appends would be invisible to the parent. Every component with client JS
 * calls `register_script` for its OWN bundle (see any dist/templates/*.twig
 * file's `{% set _bf_reg1 = bf.register_script(...) %}` line), so sibling
 * islands (the blog shell's ThemeToggle + Sidebar + PageShell + nested
 * PostList/PostArticle islands, or a loop of ToggleItem children) would
 * silently lose each other's `<script>` tags without a real shared
 * reference. `ArrayObject` (implements `ArrayAccess` + `Traversable`, so
 * `register_script`'s `$scripts[] = $path` / `foreach` still work unchanged)
 * gives PHP that reference semantics for free: assigning the SAME
 * `ArrayObject` instance to every `_scripts()`/`_script_seen()` call below
 * means they all mutate one shared list, exactly like the Perl/Python ports.
 */
function new_script_collector(BarefootJS $bf): void
{
    $bf->_scripts(new \ArrayObject());
    $bf->_script_seen(new \ArrayObject());
}

function share_script_collector(BarefootJS $from, BarefootJS $to): void
{
    $to->_scripts($from->_scripts());
    $to->_script_seen($from->_script_seen());
}

function render_component(
    string $component,
    ?string $title = null,
    string $heading = '',
    array $children = [],
    array $signalInit = [],
    array $props = [],
    array $stash = [],
    string $extraCss = '',
    ?string $back = null
): string {
    global $backend;
    $bf = new BarefootJS(null, ['backend' => $backend]);
    new_script_collector($bf);
    $scopeId = $component . '_' . rand_suffix();
    $bf->_scope_id($scopeId);
    if ($props) {
        $bf->_props($props);
    }

    foreach ($children as $childSlot => $childTemplate) {
        $childInit = $signalInit[$childSlot] ?? null;
        $renderer = function (array $props, ?BarefootJS $caller = null) use ($backend, $bf, $scopeId, $childTemplate, $childInit) {
            $childBf = new BarefootJS(null, ['backend' => $backend]);
            // Loop children carry no `_bf_slot`; fall back to template +
            // suffix so each instance gets a distinct scope id (client JS
            // finds children by scope). Slot children pin to
            // <parent>_<slot>.
            $slotId = $props['_bf_slot'] ?? null;
            unset($props['_bf_slot']);
            $childBf->_scope_id($slotId !== null ? "{$scopeId}_{$slotId}" : $childTemplate . '_' . rand_suffix());
            $childBf->_is_child(true);
            // Share the parent's script collector so a child's
            // register_script de-dupes against the page's existing
            // <script> set (see new_script_collector's docstring).
            share_script_collector($bf, $childBf);
            $extra = $childInit !== null ? $childInit($props) : [];
            return $backend->render_named($childTemplate, $childBf, array_merge($props, $extra));
        };
        $bf->register_child_renderer($childSlot, $renderer);
    }

    $ctx = array_merge(stash_from_ssr_defaults($component, $props), $stash);
    $body = $backend->render_named($component, $bf, $ctx);
    return layout(
        title: $title ?? "{$component} - BarefootJS",
        heading: $heading,
        body: $body,
        scripts: $bf->scripts(),
        extraCss: $extraCss,
        back: $back,
    );
}

function layout(string $title, string $heading, string $body, string $scripts, string $extraCss = '', ?string $back = null): string
{
    global $BASE;
    $headingHtml = $heading !== '' ? "<h1>{$heading}</h1>" : '';
    // Subpages link back to the example list ($BASE/); the list page itself
    // passes back='' to suppress the link (the header breadcrumb already
    // navigates up to /integrations).
    $backHref = $back ?? "{$BASE}/";
    $backHtml = $backHref !== '' ? '<p><a href="' . $backHref . '">&larr; Back</a></p>' : '';
    return <<<HTML
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{$title}</title>
    <link rel="stylesheet" href="{$BASE}/styles/tokens.css">
    <link rel="stylesheet" href="{$BASE}/styles/layout.css">
    <link rel="stylesheet" href="{$BASE}/styles/components.css">
    <link rel="stylesheet" href="{$BASE}/styles/todo-app.css">
    {$extraCss}
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
                <span class="bf-header-current" aria-current="page">PHP</span>
            </nav>
        </div>
    </header>
    {$headingHtml}
    <div id="app">{$body}</div>
    {$backHtml}
    {$scripts}
</body>
</html>
HTML;
}

function html_response(string $html, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    echo $html;
}

function json_response($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
}

// ---------------------------------------------------------------------------
// AI Chat dummy responses (streamed char-by-char over SSE).
// ---------------------------------------------------------------------------
$AI_RESPONSES = [
    '[Dummy response] This text is streaming one character at a time via SSE. In production, replace /api/ai-chat with a real LLM API.',
    '[Dummy response] BarefootJS compiles JSX to Twig templates + client JS. Signals drive reactivity on any backend.',
    '[Dummy response] SSE (Server-Sent Events) lets the server push data to the client over a single HTTP connection.',
    '[Dummy response] The Twig backend runs under any PHP app -- here plain PHP\'s built-in server streams each character with a 30ms delay.',
    '[Dummy response] Out-of-Order Streaming SSR and interactive SSE streaming are two different features of BarefootJS.',
];

function home_page(): string
{
    global $BASE;
    $body = <<<HTML
<p>This example renders the same shared JSX components with Twig
under a plain PHP app.</p>
<ul>
    <li><a href="{$BASE}/counter">Counter</a></li>
    <li><a href="{$BASE}/toggle">Toggle</a></li>
    <li><a href="{$BASE}/todos">Todo (@client)</a></li>
    <li><a href="{$BASE}/todos-ssr">Todo (no @client markers)</a></li>
    <li><a href="{$BASE}/ai-chat">AI Chat (SSE Streaming)</a></li>
    <li><a href="{$BASE}/blog">Blog (@barefootjs/router - partial navigation)</a></li>
</ul>
HTML;
    return layout(
        title: 'BarefootJS + PHP Example',
        heading: 'BarefootJS + PHP Example',
        body: $body,
        scripts: '',
        extraCss: '',
        back: '',
    );
}

// ---------------------------------------------------------------------------
// Blog -- the @barefootjs/router showcase (PHP/Twig).
//
// Mirrors app.py's blog section (itself mirroring app.psgi / the Go/
// Mojolicious ports): a region-shell layout (header + ThemeToggle in the
// shell, a hand-authored sidebar region `nav:0` + the compiled <PageShell>
// nested content regions in the main column) whose islands are the shared
// blog components in ../shared/blog, compiled by this integration's
// `bf build`. The client router (client/router-entry.ts, bundled to
// client/router-entry.js) swaps only the content region.
//
// There is no special server-side "partial navigation" endpoint: the router
// (packages/router/src/router.ts) fetches a full HTML page for every
// navigation and diffs `[bf-region]` boundaries client-side, so every blog
// route below just returns a normal HTML document -- the same "any backend,
// zero cooperation" point the other adapters' blog ports make.
//
// searchParams() SSR (#2076): PostList's own `params` memo returns an OBJECT
// (`{ sort, tag }`) built through a helper function (`asSortKey`), and
// `sortClass`/`tagClass` are plain functions called with different literal
// arguments per link -- shapes the seed plan does not lower (the manifest's
// `ssrDefaults` for PostList shows `params`/`visible` as `null`, i.e. still
// caller-provided). We seed `params` from the request query (validated the
// same way the client's `asSortKey` would) and `visible` with the full list;
// the client re-derives the sorted/filtered list + active sort/tag highlight
// from `searchParams()` on hydration. This is the `stash_from_ssr_defaults`-
// adjacent "render-context derivation" app.py calls out as sanctioned -- not
// a workaround, just supplying what the static extractor cannot.
// ---------------------------------------------------------------------------
const BLOG_SORT_KEYS = ['date', 'title', 'tag'];

/** Mirrors PostList's `asSortKey`: an unknown/absent `?sort=` falls back to
 * 'date' so the SSR row order always matches a valid post-hydration state. */
function as_sort_key(?string $raw): string
{
    return in_array($raw, BLOG_SORT_KEYS, true) ? $raw : 'date';
}

/** Register a renderer for a flat (non-`ui/*`) child component from the
 * build manifest (`post_list_item` -> PostListItem, `reader_toolbar` ->
 * ReaderToolbar): a fresh child scope chained off the caller's slot, the
 * shared script collector + renderer registry, and the manifest's
 * ssrDefaults seeded (caller prop wins). */
function register_blog_child(BarefootJS $parentBf, string $slot, string $component, array $extraSeed = []): void
{
    global $backend, $MANIFEST;
    $entry = $MANIFEST[$component] ?? null;
    if ($entry === null) {
        return;
    }
    $hasDefaults = array_key_exists('ssrDefaults', $entry);

    $renderer = function (array $props, ?BarefootJS $caller = null) use ($backend, $parentBf, $component, $hasDefaults, $extraSeed) {
        $host = $caller ?? $parentBf;
        $hostScope = $host->_scope_id();
        $child = new BarefootJS(null, ['backend' => $backend]);
        $slotId = $props['_bf_slot'] ?? null;
        unset($props['_bf_slot']);
        $dataKey = $props['key'] ?? null;
        unset($props['key']);
        if ($dataKey !== null) {
            $child->_data_key($dataKey);
        }
        $child->_scope_id($slotId !== null ? "{$hostScope}_{$slotId}" : $component . '_' . rand_suffix());
        $child->_is_child(true);
        if ($slotId !== null) {
            $child->_bf_parent($hostScope);
            $child->_bf_mount($slotId);
        }
        $child->_child_renderers($parentBf->_child_renderers());
        share_script_collector($parentBf, $child);
        $extra = $hasDefaults ? stash_from_ssr_defaults($component, $props) : [];
        return $backend->render_named($component, $child, array_merge($extra, $extraSeed, $props));
    };

    $parentBf->register_child_renderer($slot, $renderer);
}

/**
 * Render one top-level island to an HTML string, sharing `$root`'s script
 * collector + renderer registry so islands compose into one page.
 *
 *   $props    -- client props (-> bf-p, so the client hydration sees them,
 *                AND template vars)
 *   $extra    -- SSR-only template vars (derived memo / getter values not
 *                lowered)
 *   $children -- slot key -> child template name, OR slot key -> [template,
 *                extraSeed] for the one case (now_playing) that needs both
 */
function blog_island(BarefootJS $root, string $component, array $props = [], array $extra = [], array $children = []): string
{
    global $backend;
    $bf = new BarefootJS(null, ['backend' => $backend]);
    $bf->_scope_id($component . '_' . rand_suffix());
    if ($props) {
        $bf->_props($props);
    }
    share_script_collector($root, $bf);
    $bf->_child_renderers($root->_child_renderers());
    foreach ($children as $slot => $spec) {
        if (is_array($spec)) {
            [$templateName, $seed] = $spec;
        } else {
            $templateName = $spec;
            $seed = [];
        }
        register_blog_child($bf, $slot, $templateName, $seed);
    }
    $seed = stash_from_ssr_defaults($component, $props);
    return $backend->render_named($component, $bf, array_merge($seed, $props, $extra));
}

/** Assemble the region-shell page around already-rendered content HTML.
 * `$root` is the request-scoped runtime whose script collector the content
 * islands (and the shell islands rendered here) all share. */
function blog_page(BarefootJS $root, string $title, string $base, string $contentHtml): string
{
    global $BASE;
    $static = "{$BASE}/client";
    $theme = blog_island($root, 'ThemeToggle');
    $sidebar = blog_island($root, 'Sidebar');
    $shell = blog_island(
        $root,
        'PageShell',
        [],                                                     // no client props
        ['children' => $root->backend->mark_raw($contentHtml)], // SSR-only: page content
        ['reader_toolbar' => 'ReaderToolbar'],
    );
    $importMap = json_encode([
        'imports' => [
            '@barefootjs/client' => "{$static}/barefoot.js",
            '@barefootjs/client/runtime' => "{$static}/barefoot.js",
            '@barefootjs/client/reactive' => "{$static}/barefoot.js",
        ],
    ]);
    $scripts = $root->scripts();
    $escTitle = htmlspecialchars($title, ENT_QUOTES);
    return <<<HTML
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{$escTitle}</title>
<script type="importmap">{$importMap}</script>
<link rel="stylesheet" href="{$BASE}/styles/blog.css">
</head>
<body>
<header class="shell">
<a class="shell-brand" href="{$base}">\u{1F4F0} Barefoot Blog</a>
<div class="shell-island">{$theme}</div>
</header>
<div class="layout">
<aside bf-region="nav:0">{$sidebar}</aside>
<main>{$shell}</main>
</div>
{$scripts}
<script type="module" src="{$static}/router-entry.js"></script>
</body>
</html>
HTML;
}

function blog_index_route(): void
{
    global $backend, $BASE, $BLOG_DATA;
    $root = new BarefootJS(null, ['backend' => $backend]);
    new_script_collector($root);
    $base = "{$BASE}/blog";
    $sort = as_sort_key($_GET['sort'] ?? null);
    $tag = $_GET['tag'] ?? '';
    $items = $BLOG_DATA['listItems'];
    $postList = blog_island(
        $root,
        'PostList',
        // Client props (-> bf-p): `visible()` re-derives from these on every
        // `searchParams()` change, so they must reach the client.
        ['items' => $items, 'tags' => $BLOG_DATA['allTags'], 'base' => $base],
        [
            // SSR-only derived values -- see the blog section docstring
            // above for why these can't be lowered in-template.
            'params' => ['sort' => $sort, 'tag' => $tag],
            'visible' => $items,
            'sortClass' => 'sort',
            'root' => $base,
            'tagClass' => 'tag',
        ],
        ['post_list_item' => 'PostListItem'],
    );
    $now = blog_island($root, 'NowPlaying', [], ['Math' => ['min' => 0]]);
    $title = $tag !== '' ? "#{$tag} \u{2014} Barefoot Blog" : 'Barefoot Blog \u{2014} Latest posts';
    html_response(blog_page($root, $title, $base, $postList . $now));
}

function blog_post_route(string $slug): void
{
    global $backend, $BASE, $BLOG_DATA;
    // Sort newest-first (the index's default display order) so the article
    // pager walks down the list the reader is browsing; the corpus is
    // authored oldest-first.
    $posts = $BLOG_DATA['posts'];
    usort($posts, fn ($a, $b) => strcmp($b['date'], $a['date']));
    $idx = null;
    foreach ($posts as $i => $p) {
        if ($p['slug'] === $slug) {
            $idx = $i;
            break;
        }
    }
    if ($idx === null) {
        http_response_code(404);
        header('Content-Type: text/plain');
        echo 'Not Found';
        return;
    }
    $p = $posts[$idx];
    $prevPost = $idx > 0 ? $posts[$idx - 1] : null;
    $nextPost = $idx < count($posts) - 1 ? $posts[$idx + 1] : null;
    $base = "{$BASE}/blog";
    $root = new BarefootJS(null, ['backend' => $backend]);
    new_script_collector($root);
    // The whole article is the shared <PostArticle> island; the interactive
    // widgets are its nested children (NowPlaying needs Math seeded).
    $content = blog_island(
        $root,
        'PostArticle',
        [
            'slug' => $p['slug'], 'title' => $p['title'], 'date' => $p['date'],
            'tags' => $p['tags'], 'body' => $p['body'],
            'position' => $idx + 1, 'total' => count($posts), 'base' => $base,
            'prevSlug' => $prevPost['slug'] ?? null,
            'prevTitle' => $prevPost['title'] ?? null,
            'nextSlug' => $nextPost['slug'] ?? null,
            'nextTitle' => $nextPost['title'] ?? null,
        ],
        [],
        [
            'like_button' => 'LikeButton',
            'reading_timer' => 'ReadingTimer',
            'now_playing' => ['NowPlaying', ['Math' => ['min' => 0]]],
        ],
    );
    html_response(blog_page($root, "{$p['title']} \u{2014} Barefoot Blog", $base, $content));
}

// ---------------------------------------------------------------------------
// Static assets: dist/client + dist/styles, mounted under $BASE. Explicit
// handlers (rather than letting the PHP built-in server's own file-serving
// fall through) because the URL path ($BASE/client/...) doesn't match the
// filesystem path (dist/client/...) -- the built-in server's `return false`
// convention only helps when the two already line up.
// ---------------------------------------------------------------------------
const STATIC_MIME_TYPES = [
    'js' => 'text/javascript; charset=utf-8',
    'mjs' => 'text/javascript; charset=utf-8',
    'css' => 'text/css; charset=utf-8',
    'map' => 'application/json; charset=utf-8',
    'svg' => 'image/svg+xml',
    'png' => 'image/png',
    'json' => 'application/json; charset=utf-8',
];

function serve_static_file(string $root, string $relative): void
{
    // Reject traversal outside $root (`..`, absolute paths).
    $normalized = str_replace('\\', '/', $relative);
    if ($normalized === '' || str_contains($normalized, '..') || str_starts_with($normalized, '/')) {
        http_response_code(404);
        return;
    }
    $path = $root . '/' . $normalized;
    if (!is_file($path)) {
        http_response_code(404);
        header('Content-Type: text/plain');
        echo 'Not Found';
        return;
    }
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    header('Content-Type: ' . (STATIC_MIME_TYPES[$ext] ?? 'application/octet-stream'));
    header('Content-Length: ' . (string) filesize($path));
    readfile($path);
}

// ---------------------------------------------------------------------------
// Routes -- $BASE-relative dispatch below (no framework router available in
// plain PHP); one function per route, mirroring app.py's `*_route` view
// functions one-for-one.
// ---------------------------------------------------------------------------

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// A bare-root request redirects into the base path (mirrors app.py's
// `@app.get("/")` -> `redirect(f"{BASE}/")`).
if ($requestPath === '/' && $BASE !== '') {
    http_response_code(302);
    header("Location: {$BASE}/");
    exit;
}

if ($BASE !== '' && !str_starts_with($requestPath, $BASE)) {
    http_response_code(404);
    header('Content-Type: text/plain');
    echo 'Not Found';
    exit;
}
$route = $BASE !== '' ? substr($requestPath, strlen($BASE)) : $requestPath;
if ($route === '') {
    $route = '/';
}

// --- static assets ---
if ($method === 'GET' && str_starts_with($route, '/client/')) {
    serve_static_file($HERE . '/dist/client', substr($route, strlen('/client/')));
    exit;
}
if ($method === 'GET' && str_starts_with($route, '/styles/')) {
    serve_static_file($HERE . '/dist/styles', substr($route, strlen('/styles/')));
    exit;
}

// --- todo REST API ---
if (preg_match('#^/api/todos/(\d+)$#', $route, $m)) {
    $todoId = (int) $m[1];
    [$sid, $minted] = resolve_session_id();
    if ($method === 'PUT') {
        $body = json_decode((string) file_get_contents('php://input'), true) ?: [];
        $todo = with_session($sid, function (array $state) use ($todoId, $body) {
            foreach ($state['todos'] as &$t) {
                if ($t['id'] !== $todoId) {
                    continue;
                }
                if (array_key_exists('text', $body)) {
                    $t['text'] = $body['text'];
                }
                if (array_key_exists('done', $body)) {
                    $t['done'] = (bool) $body['done'];
                }
                return [$state, $t];
            }
            return [$state, null];
        });
        if ($minted) {
            set_session_cookie($sid);
        }
        if ($todo === null) {
            json_response(['error' => 'not found'], 404);
        } else {
            json_response($todo);
        }
        exit;
    }
    if ($method === 'DELETE') {
        with_session($sid, function (array $state) use ($todoId) {
            $state['todos'] = array_values(array_filter($state['todos'], fn ($t) => $t['id'] !== $todoId));
            return [$state, null];
        });
        http_response_code(204);
        exit;
    }
}

if ($route === '/api/todos/reset' && $method === 'POST') {
    [$sid, $minted] = resolve_session_id();
    with_session($sid, fn (array $state) => [['todos' => seed_todos(), 'next_id' => 4], null]);
    if ($minted) {
        set_session_cookie($sid);
    }
    header('Content-Type: text/plain');
    echo 'ok';
    exit;
}

if ($route === '/api/todos') {
    [$sid, $minted] = resolve_session_id();
    if ($method === 'GET') {
        $state = read_session($sid);
        if ($minted) {
            set_session_cookie($sid);
        }
        json_response($state['todos']);
        exit;
    }
    if ($method === 'POST') {
        $body = json_decode((string) file_get_contents('php://input'), true) ?: [];
        $todo = with_session($sid, function (array $state) use ($body) {
            $newTodo = ['id' => $state['next_id'], 'text' => $body['text'] ?? null, 'done' => false, 'editing' => false];
            $state['todos'][] = $newTodo;
            $state['next_id']++;
            return [$state, $newTodo];
        });
        if ($minted) {
            set_session_cookie($sid);
        }
        json_response($todo, 201);
        exit;
    }
}

// Char-by-char SSE stream.
if ($route === '/api/ai-chat' && $method === 'GET') {
    global $AI_RESPONSES;
    $text = $AI_RESPONSES[array_rand($AI_RESPONSES)];
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    // Nginx/Cloudflare-style intermediaries buffer proxied responses by
    // default, which would defeat the whole point of streaming; this header
    // is a no-op when there is no such proxy in front (e.g. local dev) and
    // load-bearing when there is (mirrors the SSE guidance in the other
    // adapters' ports).
    header('X-Accel-Buffering: no');
    // Turn off every buffering layer PHP itself might apply so each `echo`
    // actually reaches the socket before the next 30ms sleep.
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    ini_set('output_buffering', 'off');
    ini_set('zlib.output_compression', false);
    foreach (preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) as $ch) {
        echo 'data: ' . json_encode($ch) . "\n\n";
        flush();
        usleep(30_000);
    }
    echo "data: [DONE]\n\n";
    flush();
    exit;
}

// --- blog ---
if ($route === '/blog' && $method === 'GET') {
    blog_index_route();
    exit;
}
if (preg_match('#^/blog/posts/([^/]+)$#', $route, $m) && $method === 'GET') {
    blog_post_route($m[1]);
    exit;
}

// --- component demo pages ---
if ($method === 'GET') {
    switch (true) {
        case $route === '/':
            html_response(home_page());
            exit;

        case $route === '/counter':
            html_response(render_component('Counter', heading: 'Counter Component'));
            exit;

        case $route === '/toggle':
            $items = [
                ['label' => 'Setting 1', 'defaultOn' => true],
                ['label' => 'Setting 2', 'defaultOn' => false],
                ['label' => 'Setting 3', 'defaultOn' => false],
            ];
            html_response(render_component(
                'Toggle',
                heading: 'Toggle Component',
                children: ['toggle_item' => 'ToggleItem'],
                props: ['toggleItems' => $items],
                stash: ['toggleItems' => $items],
            ));
            exit;

        case $route === '/form':
            html_response(render_component('Form', heading: 'Form Example', props: [], stash: ['accepted' => false]));
            exit;

        case $route === '/reactive-props':
            html_response(render_component(
                'ReactiveProps',
                heading: 'Reactive Props Test',
                children: ['reactive_child' => 'ReactiveChild'],
                props: [],
                stash: ['count' => 0, 'doubled' => 0],
            ));
            exit;

        case $route === '/props-reactivity':
            // Not in the task's headline route list, but required: the
            // shared `reactive-props.spec.ts` e2e suite (imported wholesale,
            // like every other adapter integration) has a "Props Access"
            // describe block that navigates to `${baseUrl}/props-reactivity`
            // -- see integrations/shared/e2e/reactive-props.spec.ts. No
            // signal_init override needed here: PropsStyleChild /
            // DestructuredStyleChild's compiled templates already derive
            // `displayValue` in-template (`{% set displayValue = value * 10 %}`).
            html_response(render_component(
                'PropsReactivityComparison',
                heading: 'Props Reactivity Comparison',
                children: [
                    'props_style_child' => 'PropsStyleChild',
                    'destructured_style_child' => 'DestructuredStyleChild',
                ],
                props: [],
                stash: ['count' => 1],
            ));
            exit;

        case $route === '/conditional-return' || $route === '/conditional-return-link':
            $variant = str_ends_with($route, '-link') ? 'link' : '';
            html_response(render_component(
                'ConditionalReturn',
                heading: 'Conditional Return Example' . ($variant !== '' ? ' (Link)' : ''),
                props: ['variant' => $variant],
                stash: ['variant' => $variant, 'count' => 0],
            ));
            exit;

        case $route === '/portal':
            html_response(render_component('PortalExample', heading: 'Portal Example', props: [], stash: ['open' => false]));
            exit;

        case $route === '/ai-chat':
            html_response(render_component(
                'AIChatInteractive',
                title: 'AI Chat -- SSE Streaming (PHP)',
                heading: 'AI Chat -- SSE Streaming',
                stash: ['messages' => [], 'input' => '', 'streamingText' => '', 'isStreaming' => false],
                extraCss: "<link rel=\"stylesheet\" href=\"{$BASE}/styles/ai-chat.css\">",
            ));
            exit;

        case $route === '/todos' || $route === '/todos-ssr':
            [$sid, $minted] = resolve_session_id();
            $state = read_session($sid);
            $todos = $state['todos'];
            $done = count(array_filter($todos, fn ($t) => $t['done']));
            $component = str_ends_with($route, '-ssr') ? 'TodoAppSSR' : 'TodoApp';
            $html = render_component(
                $component,
                children: ['todo_item' => 'TodoItem'],
                props: ['initialTodos' => $todos],
                stash: ['todos' => $todos, 'newText' => '', 'filter' => 'all', 'doneCount' => $done],
            );
            if ($minted) {
                set_session_cookie($sid);
            }
            html_response($html);
            exit;
    }
}

http_response_code(404);
header('Content-Type: text/plain');
echo 'Not Found';
