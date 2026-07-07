<?php

declare(strict_types=1);

namespace App\Support;

use Barefoot\BarefootJS;
use Barefoot\BladeBackend;

/**
 * Request-independent BarefootJS glue -- the Laravel counterpart of
 * integrations/rails' `ExampleApp` module (config/initializers/example_app.rb):
 * constants + the pure render helpers, namespaced so nothing leaks into the
 * app's controllers. The request-facing seams (renderComponent, layout, the
 * session cookie) live in the BarefootHelper controller concern; the split
 * mirrors the Rails example, which itself mirrors the plain-PHP/Blade
 * example's top-level functions vs route bodies.
 *
 * Everything here is a 1:1 port of integrations/blade/index.php's section of
 * the same name (same adapter, same compiled templates, same manifest
 * semantics) -- only the framework glue around it differs, so the two PHP
 * integrations can be diffed side by side the way sinatra/rails can.
 */
final class ExampleApp
{
    public const SESSION_COOKIE = 'bf_session';
    public const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

    public const BLOG_SORT_KEYS = ['date', 'title', 'tag'];

    /** AI Chat dummy responses (streamed char-by-char over SSE). */
    public const AI_RESPONSES = [
        '[Dummy response] This text is streaming one character at a time via SSE. In production, replace /api/ai-chat with a real LLM API.',
        '[Dummy response] BarefootJS compiles JSX to Blade templates + client JS. Signals drive reactivity on any backend.',
        '[Dummy response] SSE (Server-Sent Events) lets the server push data to the client over a single HTTP connection.',
        '[Dummy response] The Blade backend reuses this Laravel app\'s own view factory -- `php artisan serve` streams each character with a 30ms delay.',
        '[Dummy response] Out-of-Order Streaming SSR and interactive SSE streaming are two different features of BarefootJS.',
    ];

    /**
     * URL prefix the app is mounted under. Defaults to /integrations/laravel
     * so the app is deploy-ready for barefootjs.dev/integrations/laravel.
     * `getenv` (not the `env()` helper) for parity with the sibling PHP
     * integrations, and because this is read at route-registration time.
     */
    public static function base(): string
    {
        return rtrim(getenv('BASE_PATH') ?: '/integrations/laravel', '/');
    }

    public static function backend(): BladeBackend
    {
        return app(BladeBackend::class);
    }

    /**
     * The build manifest -- a plain build artifact (dist/templates/manifest.json),
     * not adapter internals -- lists each component's `ssrDefaults`: the set of
     * signal/memo names an optional-prop-derived initial value needs BOUND (to
     * the real prop or to `null`) in the render context. This integration's
     * shared components aren't manifest-registered under `ui/*` (see
     * BarefootHelper::renderComponent's manual child wiring, mirroring
     * integrations/blade), so root-level renders derive the stash themselves
     * via stashFromSsrDefaults().
     *
     * PHP's cli-server resets statics per request, so this (and blogData) is
     * a per-request lazy read -- the same cost point as integrations/blade
     * reading it at the top of index.php.
     */
    public static function manifest(): array
    {
        static $manifest = null;
        if ($manifest === null) {
            $path = base_path('dist/templates/manifest.json');
            $manifest = is_file($path) ? (json_decode((string) file_get_contents($path), true) ?: []) : [];
        }
        return $manifest;
    }

    /**
     * The blog post corpus -- generated at build time by
     * scripts/gen-blog-data.ts from ../shared/blog/posts.ts (the single TS
     * source of truth the JS adapters import directly; this PHP server reads
     * the JSON mirror instead).
     */
    public static function blogData(): array
    {
        static $data = null;
        if ($data === null) {
            $path = base_path('dist/blog-data.json');
            $data = is_file($path)
                ? (json_decode((string) file_get_contents($path), true) ?: ['posts' => [], 'listItems' => [], 'allTags' => []])
                : ['posts' => [], 'listItems' => [], 'allTags' => []];
        }
        return $data;
    }

    public static function seedTodos(): array
    {
        return [
            ['id' => 1, 'text' => 'Setup project', 'done' => false, 'editing' => false],
            ['id' => 2, 'text' => 'Create components', 'done' => false, 'editing' => false],
            ['id' => 3, 'text' => 'Write tests', 'done' => true, 'editing' => false],
        ];
    }

    public static function randSuffix(): string
    {
        return substr(bin2hex(random_bytes(4)), 0, 6);
    }

    /** Mirrors PostList's `asSortKey`: an unknown/absent `?sort=` falls back
     * to 'date' so the SSR row order always matches a valid post-hydration
     * state. */
    public static function asSortKey(?string $raw): string
    {
        return in_array($raw, self::BLOG_SORT_KEYS, true) ? $raw : 'date';
    }

    /**
     * Port of BarefootJS::deriveStashFromDefaults for root-level renders (see
     * manifest()'s docstring for why root renders need their own copy instead
     * of getting it via `register_components_from_manifest`). Same
     * always-BIND-the-prop-or-null contract integrations/blade documents on
     * its stash_from_ssr_defaults -- PHP's `??` coalesces silently for an
     * entirely undefined variable, but the seeded arithmetic must still see
     * the SAME value as every other adapter.
     */
    public static function stashFromSsrDefaults(string $component, array $props): array
    {
        $entry = self::manifest()[$component] ?? [];
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

    /**
     * Root-level script collector. Plain PHP arrays are copy-on-write VALUES;
     * `ArrayObject` gives the runtime's `_scripts()`/`_script_seen()`
     * accessors real shared-reference semantics so sibling islands see each
     * other's registered `<script>` tags -- see integrations/blade's
     * new_script_collector docstring for the full rationale (this is a
     * verbatim port).
     */
    public static function newScriptCollector(BarefootJS $bf): void
    {
        $bf->_scripts(new \ArrayObject());
        $bf->_script_seen(new \ArrayObject());
    }

    public static function shareScriptCollector(BarefootJS $from, BarefootJS $to): void
    {
        $to->_scripts($from->_scripts());
        $to->_script_seen($from->_script_seen());
    }

    // -------------------------------------------------------------------
    // Blog -- the @barefootjs/router showcase. Ports of integrations/blade's
    // register_blog_child / blog_island / blog_page; see that file's blog
    // section docstring for the searchParams() SSR seeding rationale.
    // -------------------------------------------------------------------

    /** Register a renderer for a flat (non-`ui/*`) child component from the
     * build manifest (`post_list_item` -> PostListItem, `reader_toolbar` ->
     * ReaderToolbar): a fresh child scope chained off the caller's slot, the
     * shared script collector + renderer registry, and the manifest's
     * ssrDefaults seeded (caller prop wins). */
    public static function registerBlogChild(BarefootJS $parentBf, string $slot, string $component, array $extraSeed = []): void
    {
        $backend = self::backend();
        $entry = self::manifest()[$component] ?? null;
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
            $child->_scope_id($slotId !== null ? "{$hostScope}_{$slotId}" : $component . '_' . self::randSuffix());
            $child->_is_child(true);
            if ($slotId !== null) {
                $child->_bf_parent($hostScope);
                $child->_bf_mount($slotId);
            }
            $child->_child_renderers($parentBf->_child_renderers());
            self::shareScriptCollector($parentBf, $child);
            $extra = $hasDefaults ? self::stashFromSsrDefaults($component, $props) : [];
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
    public static function blogIsland(BarefootJS $root, string $component, array $props = [], array $extra = [], array $children = []): string
    {
        $backend = self::backend();
        $bf = new BarefootJS(null, ['backend' => $backend]);
        $bf->_scope_id($component . '_' . self::randSuffix());
        if ($props) {
            $bf->_props($props);
        }
        self::shareScriptCollector($root, $bf);
        $bf->_child_renderers($root->_child_renderers());
        foreach ($children as $slot => $spec) {
            if (is_array($spec)) {
                [$templateName, $seed] = $spec;
            } else {
                $templateName = $spec;
                $seed = [];
            }
            self::registerBlogChild($bf, $slot, $templateName, $seed);
        }
        $seed = self::stashFromSsrDefaults($component, $props);
        return $backend->render_named($component, $bf, array_merge($seed, $props, $extra));
    }

    /** Assemble the region-shell page around already-rendered content HTML.
     * `$root` is the request-scoped runtime whose script collector the content
     * islands (and the shell islands rendered here) all share. */
    public static function blogPage(BarefootJS $root, string $title, string $base, string $contentHtml): string
    {
        $BASE = self::base();
        $static = "{$BASE}/client";
        $theme = self::blogIsland($root, 'ThemeToggle');
        $sidebar = self::blogIsland($root, 'Sidebar');
        $shell = self::blogIsland(
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

    // -------------------------------------------------------------------
    // Static assets: dist/client + dist/styles, mounted under base(). Served
    // by explicit routes (routes/web.php) because the URL path
    // (client/...) doesn't match the filesystem path (dist/client/...) --
    // same rationale as integrations/blade's serve_static_file, expressed as
    // a Laravel response.
    // -------------------------------------------------------------------
    public const STATIC_MIME_TYPES = [
        'js' => 'text/javascript; charset=utf-8',
        'mjs' => 'text/javascript; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'map' => 'application/json; charset=utf-8',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'json' => 'application/json; charset=utf-8',
    ];

    public static function serveStaticFile(string $root, string $relative)
    {
        // Reject traversal outside $root (`..`, absolute paths).
        $normalized = str_replace('\\', '/', $relative);
        if ($normalized === '' || str_contains($normalized, '..') || str_starts_with($normalized, '/')) {
            return response('Not Found', 404)->header('Content-Type', 'text/plain');
        }
        $path = $root . '/' . $normalized;
        if (!is_file($path)) {
            return response('Not Found', 404)->header('Content-Type', 'text/plain');
        }
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        return response()->file($path, [
            'Content-Type' => self::STATIC_MIME_TYPES[$ext] ?? 'application/octet-stream',
        ]);
    }
}
