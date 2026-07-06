<?php

declare(strict_types=1);

namespace Barefoot;

/**
 * Port of packages/adapter-perl/lib/BarefootJS.pm (see also the Python port
 * packages/adapter-jinja/python/barefootjs/runtime.py).
 *
 * Engine- and framework-agnostic server runtime for BarefootJS marked
 * templates. This class is the server-side runtime the compiled marked
 * templates call into at render time (as the `bf` object:
 * `{{ bf.scope_attr() }}`, `{{ bf.json(data) }}`, `{{ bf.spread_attrs(bag) }}`
 * for the Twig syntax the `@barefootjs/twig` adapter emits -- other PHP
 * engine adapters bind the same methods in their own template syntax).
 * Every operation that depends on *how* a template is rendered -- JSON
 * marshalling, raw-string marking, JSX-children materialisation,
 * named-template rendering, and template-variable-name mangling -- is
 * delegated to a pluggable `backend` (see e.g. `packages/adapter-twig`'s
 * `TwigBackend`), mirroring the Perl runtime's `BarefootJS::Backend::*` seam
 * and the Python port's `JinjaBackend` seam.
 *
 * Method names are kept snake_case and VERBATIM from the Perl runtime
 * (`render_child`, `scope_attr`, `hydration_attrs`, ...) per the adapter
 * design doc section 2 -- the TS emitter generates calls to these exact
 * names, and Twig resolves `bf.foo(...)` to the PHP method `foo`.
 *
 * Divergences from the Perl port (mirroring the Python port's documented
 * divergences where the same reasoning applies):
 *
 *   - `new`/`__construct` does not lazily fall back to a default framework
 *     backend (Perl falls back to `BarefootJS::Backend::Mojo`). This
 *     engine-agnostic runtime package ships NO backend implementations --
 *     each PHP engine adapter package (e.g. `packages/adapter-twig`'s
 *     `TwigBackend`) supplies exactly one; a host MUST inject it via
 *     `new BarefootJS($c, ['backend' => $backend])`.
 *   - The per-render mutable state Perl mutates through dual get/set
 *     accessors (`_scope_id`, `_bf_parent`, `_bf_mount`, `_props`,
 *     `_data_key`, `_is_child`, `_scripts`, `_script_seen`,
 *     `_child_renderers`) keeps the SAME call-as-getter/call-as-setter shape
 *     here (via `__call`), because generated render scripts and ported
 *     tests call them exactly as the Perl/Python harnesses do
 *     (`$bf->_scope_id('Widget_test')`).
 *   - PHP has a cycle-collecting garbage collector (like CPython), so
 *     `register_components_from_manifest` captures `$parent` directly with
 *     no `weaken()` dance, unlike the Perl port (which has no cyclic GC by
 *     default) -- functionally equivalent, no leak. Same reasoning the
 *     Python port documents.
 *   - `index_of` / `last_index_of` compare array elements with
 *     `Evaluator::strictEq()` (JS `===` semantics) rather than Perl's `eq`
 *     stringy comparison -- PHP's `json_decode()` (without `assoc`) already
 *     preserves the JS type distinction (int vs. float vs. string vs. bool),
 *     so no stringify-both-sides workaround is needed; this is a strict
 *     improvement over the Perl port's documented "cross-type probe is
 *     strict-equality false" divergence AND avoids the Python port's noted
 *     `bool` -is-an-`int`-subclass wrinkle (PHP `bool` is its own type).
 *   - `spread_attrs`'s boolean-attribute detection uses `is_bool()` --
 *     PHP has a real boolean type, so no Perl-style `JSON::PP::Boolean`
 *     sentinel-ref dance is needed.
 *   - `truthy`, `mod`, and `eq`/`neq` do not exist in the Perl runtime
 *     (`eq`/`neq` are the NEW helpers the design doc calls out; `truthy` and
 *     `mod` mirror the Python-port additions the Twig TS emitter's lowering
 *     policy needs uniformly for JS-truthiness condition routing and JS `%`).
 */
final class BarefootJS
{
    /** @var mixed Framework controller/context (kept for API parity; unused internally). */
    public $c;

    /** @var array<string, mixed> */
    public array $config;

    /** @var mixed The pluggable rendering backend (e.g. TwigBackend). */
    public $backend;

    /** @var array<string, mixed> Backing store for the dual get/set accessors. */
    private array $attrs = [];

    /** @var array<string, list<mixed>> SSR mirror of client provideContext/useContext. */
    private static array $contextStacks = [];

    /** @var list<string> Dual get/set (Perl accessor-base) attribute names that
     * default to `null` when unread. */
    private const SIMPLE_ACCESSORS = ['_scope_id', '_bf_parent', '_bf_mount', '_props', '_data_key'];

    public function __construct($c = null, array $config = [])
    {
        $this->c = $c;
        $this->config = $config;
        $this->backend = $config['backend'] ?? null;
    }

    /**
     * Dual get/set accessors mirroring the Perl accessor base: calling with
     * no args reads (building the default on first access for the
     * collection-typed attrs); calling with one positional arg writes and
     * returns `$this` for chaining. Covers `_scope_id`, `_bf_parent`,
     * `_bf_mount`, `_props`, `_data_key`, `_is_child`, `_scripts`,
     * `_script_seen`, `_child_renderers` -- the internal state generated
     * render scripts and the test harness poke directly (e.g.
     * `$bf->_scope_id('Widget_test')`), mirroring the Python port's
     * `_dual_accessor` factory.
     */
    public function __call(string $name, array $args)
    {
        if (in_array($name, self::SIMPLE_ACCESSORS, true)) {
            if ($args) {
                $this->attrs[$name] = $args[0];
                return $this;
            }
            return $this->attrs[$name] ?? null;
        }
        if ($name === '_is_child') {
            if ($args) {
                $this->attrs[$name] = $args[0];
                return $this;
            }
            return $this->attrs[$name] ?? false;
        }
        if ($name === '_scripts' || $name === '_script_seen' || $name === '_child_renderers') {
            if ($args) {
                $this->attrs[$name] = $args[0];
                return $this;
            }
            if (!isset($this->attrs[$name])) {
                $this->attrs[$name] = [];
            }
            return $this->attrs[$name];
        }
        throw new \BadMethodCallException("Call to undefined method Barefoot\\BarefootJS::{$name}()");
    }

    // -----------------------------------------------------------------
    // search_params(query='')
    // -----------------------------------------------------------------

    public static function search_params(string $query = ''): SearchParams
    {
        return new SearchParams($query);
    }

    // -----------------------------------------------------------------
    // Scope & Props
    // -----------------------------------------------------------------

    public function scope_attr(): string
    {
        // bf-s is the addressable scope id only (#1249).
        $id = $this->_scope_id();
        return $id !== null ? (string) $id : '';
    }

    /** Emits `bf-h="<host>" bf-m="<slot>" bf-r=""` conditionally. See
     * spec/compiler.md "Slot identity". */
    public function hydration_attrs(): string
    {
        $parts = [];
        $host = $this->_bf_parent();
        $mount = $this->_bf_mount();
        if ($host !== null && $host !== '') {
            $h = str_replace('"', '&quot;', $this->string($host));
            $parts[] = 'bf-h="' . $h . '"';
        }
        if ($mount !== null && $mount !== '') {
            $m = str_replace('"', '&quot;', $this->string($mount));
            $parts[] = 'bf-m="' . $m . '"';
        }
        if (!$this->_is_child()) {
            $parts[] = 'bf-r=""';
        }
        return implode(' ', $parts);
    }

    /** Emits ` data-key="<key>"` for a keyed loop item, else ''. */
    public function data_key_attr(): string
    {
        $k = $this->_data_key();
        if ($k === null) {
            return '';
        }
        $ks = str_replace(['&', '"'], ['&amp;', '&quot;'], $this->string($k));
        return ' data-key="' . $ks . '"';
    }

    public function props_attr(): string
    {
        $props = $this->_props();
        if (!self::hasEntries($props)) {
            return '';
        }
        // The JSON must be attribute-escaped: a raw `'` inside a string value
        // (e.g. a blog paragraph) terminates the single-quoted attribute and
        // truncates the hydration payload. The browser entity-decodes the
        // attribute value, so the client's JSON.parse sees the original text
        // (#2086, same fix as the Perl/Python/Ruby/Rust runtimes).
        $json = $this->htmlEscape($this->backend->encode_json($props));
        return " bf-p='" . $json . "'";
    }

    // -----------------------------------------------------------------
    // Context (SSR mirror of the client provideContext / useContext)
    // -----------------------------------------------------------------

    public function provide_context(string $name, $value): string
    {
        self::$contextStacks[$name][] = $value;
        return '';
    }

    public function revoke_context(string $name): string
    {
        if (!empty(self::$contextStacks[$name])) {
            array_pop(self::$contextStacks[$name]);
        }
        return '';
    }

    public function use_context(string $name, $default = null)
    {
        if (empty(self::$contextStacks[$name])) {
            return $default;
        }
        return end(self::$contextStacks[$name]);
    }

    // -----------------------------------------------------------------
    // Comment Markers
    // -----------------------------------------------------------------

    public function comment(string $text): string
    {
        return "<!--bf-{$text}-->";
    }

    // -----------------------------------------------------------------
    // Async streaming boundary (#2100)
    // -----------------------------------------------------------------

    /**
     * Wrap a synchronously-resolved async boundary's fallback markup in a
     * `<div bf-async="ID">` placeholder. Ported from the Python/Perl/Ruby
     * runtimes' `async_boundary` (`packages/adapter-jinja/python/barefootjs/
     * runtime.py`, `packages/adapter-perl/lib/BarefootJS.pm`,
     * `packages/adapter-erb/lib/barefoot_js.rb`) -- was previously missing
     * from this PHP port entirely; Twig's dot-attribute call resolution
     * silently no-ops an unresolvable method under `strict_variables:
     * false`, masking the gap, but Blade's `$bf->async_boundary(...)` is a
     * direct PHP method call with no such fallback, surfacing it as a hard
     * `BadMethodCallException` (#2100 Phase 2). `$fallbackHtml` is
     * materialized through the backend first (mirrors `render_child`'s
     * `children` handling) so a captured-but-not-yet-stringified value
     * (e.g. a closure, on backends that model capture that way) renders as
     * its resolved HTML rather than a PHP value dump.
     */
    public function async_boundary(string $id, $fallbackHtml): string
    {
        $fallbackHtml = $this->backend->materialize($fallbackHtml);
        return "<div bf-async=\"{$id}\">{$fallbackHtml}</div>";
    }

    /**
     * Wrap resolved async content in a `<template bf-async-resolve="ID">`
     * swap target plus the inline swap-trigger script. Ported from the same
     * sibling runtimes as `async_boundary` above; not currently invoked by
     * any first-party adapter template emitter (both Twig's and Blade's
     * `renderAsync` only emit the synchronous `async_boundary` fallback
     * wrapper), but included for parity with the engine-agnostic contract
     * every other PHP-runtime-consuming adapter can rely on.
     */
    public function async_resolve(string $id, $contentHtml): string
    {
        return "<template bf-async-resolve=\"{$id}\">{$contentHtml}</template><script>__bf_swap(\"{$id}\")</script>";
    }

    // -----------------------------------------------------------------
    // JS-equivalent value stringification
    // -----------------------------------------------------------------

    /** Contract is boolean-only: callers must have classified the
     * expression as boolean-result before routing through this helper. */
    public function bool_str($value): string
    {
        return $value ? 'true' : 'false';
    }

    public function text_start(string $slotId): string
    {
        return "<!--bf:{$slotId}-->";
    }

    public function text_end(): string
    {
        return '<!--/-->';
    }

    /** See spec/compiler.md "Slot identity" for the comment-scope wire format. */
    public function scope_comment(): string
    {
        $scopeId = $this->_scope_id() ?? '';
        $hostSegment = '';
        $host = $this->_bf_parent();
        $mount = $this->_bf_mount();
        if ($host !== null && $host !== '') {
            $hostSegment = '|h=' . $host . '|m=' . ($mount ?? '');
        }
        $propsJson = '';
        $props = $this->_props();
        if (self::hasEntries($props)) {
            $propsJson = '|' . $this->backend->encode_json($props);
        }
        return "<!--bf-scope:{$scopeId}{$hostSegment}{$propsJson}-->";
    }

    // -----------------------------------------------------------------
    // Script Registration
    // -----------------------------------------------------------------

    public function register_script(string $path): void
    {
        $seen = $this->_script_seen();
        if (!empty($seen[$path])) {
            return;
        }
        $seen[$path] = true;
        $this->_script_seen($seen);
        $scripts = $this->_scripts();
        $scripts[] = $path;
        $this->_scripts($scripts);
    }

    // -----------------------------------------------------------------
    // Child Component Rendering
    // -----------------------------------------------------------------

    /** Register a renderer for `render_child($name, ...)`. The renderer is
     * invoked as `$renderer($props, $invokingBf)` (#1897). */
    public function register_child_renderer(string $name, callable $renderer): void
    {
        $renderers = $this->_child_renderers();
        $renderers[$name] = $renderer;
        $this->_child_renderers($renderers);
    }

    /**
     * Renderer contract (#1897): the renderer is invoked with TWO arguments
     * -- the props array and the INVOKING instance. Accepts both the
     * flat-pairs form -- `bf.render_child(name, 'k', v, ...)` -- and the
     * single-array form -- `bf.render_child(name, {'k': v})` -- mirroring
     * the Perl port's hashref form for callers that can't splat a hash into
     * positional args.
     */
    public function render_child(string $name, ...$args)
    {
        $renderers = $this->_child_renderers();
        $renderer = $renderers[$name] ?? null;
        if ($renderer === null) {
            throw new \RuntimeException("No renderer registered for child component '{$name}'");
        }
        if (count($args) === 1 && (is_array($args[0]) || $args[0] instanceof \stdClass)) {
            $props = $args[0] instanceof \stdClass ? get_object_vars($args[0]) : $args[0];
        } else {
            $props = [];
            for ($i = 0; $i + 1 < count($args); $i += 2) {
                $props[$args[$i]] = $args[$i + 1];
            }
        }
        // Guard on array_key_exists so a childless invocation doesn't gain a
        // spurious `children: null` key -- preserves the historical
        // "only touch children when present" behaviour.
        if (array_key_exists('children', $props)) {
            $props['children'] = $this->backend->materialize($props['children']);
        }
        // Keyword mangling applied wherever a props array becomes template
        // variables -- delegated to the backend's `ident()` (the fifth
        // engine-specific operation in the backend contract) so this
        // engine-agnostic runtime carries no engine-specific reserved-word
        // set of its own (e.g. Twig's, in `packages/adapter-twig/php/src/naming.php`).
        $mangled = [];
        foreach ($props as $k => $v) {
            $mangled[$this->backend->ident((string) $k)] = $v;
        }
        return $renderer($mangled, $this);
    }

    // -----------------------------------------------------------------
    // Bulk registration from build manifest
    // -----------------------------------------------------------------

    /**
     * `bf build` emits a manifest describing every component the page might
     * invoke. Walks that manifest and registers one child renderer per UI
     * registry entry -- the path shape `ui/<name>/index` maps to the
     * `<name>` slot key the generated template invokes via
     * `bf.render_child('<name>', ...)`.
     *
     * `$manifest` may be a `stdClass` (canonical JSON-object decode) or a
     * plain associative array; likewise each entry and its `ssrDefaults`.
     */
    public function register_components_from_manifest($manifest, array $opts = []): void
    {
        $signalInits = $opts['signal_init'] ?? [];
        $parentScope = $this->_scope_id();
        $parent = $this;

        foreach (self::toAssoc($manifest) as $entryName => $entry) {
            // `__barefoot__` is the runtime entry, not a component.
            if ($entryName === '__barefoot__') {
                continue;
            }
            if (!preg_match('#^ui/([^/]+)/index$#', (string) $entryName, $m)) {
                continue;
            }
            $slotKey = $m[1];
            $entryArr = self::toAssoc($entry);
            $marked = $entryArr['markedTemplate'] ?? '';
            if ($marked === '' || $marked === null) {
                continue;
            }
            $templateName = (string) $marked;
            if (str_starts_with($templateName, 'templates/')) {
                $templateName = substr($templateName, strlen('templates/'));
            }
            foreach (['.html.ep', '.tx', '.jinja', '.twig'] as $suffix) {
                if (str_ends_with($templateName, $suffix)) {
                    $templateName = substr($templateName, 0, -strlen($suffix));
                    break;
                }
            }

            $signalInit = $signalInits[$slotKey] ?? null;
            $manifestDefaults = $entryArr['ssrDefaults'] ?? null;

            $renderer = function (array $props, ?BarefootJS $caller = null) use ($parent, $parentScope, $templateName, $signalInit, $manifestDefaults) {
                $host = $caller ?? $parent;
                $hostScope = $host->_scope_id() ?? $parentScope;
                // Child shares the parent's backend so nested renders go
                // through the same engine.
                $childBf = new BarefootJS($parent->c, ['backend' => $parent->backend]);
                $slotId = $props['_bf_slot'] ?? null;
                unset($props['_bf_slot']);
                // JSX `key` (a reserved prop) -> data-key on the child's
                // scope root for keyed-loop reconciliation.
                $dataKey = $props['key'] ?? null;
                unset($props['key']);
                if ($dataKey !== null) {
                    $childBf->_data_key($dataKey);
                }
                if ($slotId) {
                    $childBf->_scope_id($hostScope . '_' . $slotId);
                } else {
                    $childBf->_scope_id($templateName . '_' . substr(bin2hex(random_bytes(4)), 0, 6));
                }
                $childBf->_is_child(true);
                // (#1249) Slot identity: host scope + slot id.
                if ($slotId) {
                    $childBf->_bf_parent($hostScope);
                    $childBf->_bf_mount($slotId);
                }
                // Share the root registry so the child's own template can
                // render further imported components (#1897).
                $childBf->_child_renderers($parent->_child_renderers());
                $childBf->_scripts($parent->_scripts());
                $childBf->_script_seen($parent->_script_seen());

                $extra = [];
                if ($signalInit !== null) {
                    $extra = $signalInit($props);
                } elseif ($manifestDefaults !== null) {
                    $extra = self::deriveStashFromDefaults($manifestDefaults, $props);
                }

                $html = $parent->backend->render_named($templateName, $childBf, array_merge($props, $extra));
                if (is_string($html) && str_ends_with($html, "\n")) {
                    $html = substr($html, 0, -1); // chomp: remove at most one trailing newline
                }
                return $html;
            };

            $this->register_child_renderer($slotKey, $renderer);
        }
    }

    /** `$manifest`/`$entry` values may arrive as `stdClass` (canonical) or
     * a plain associative array (accepted per the design's tolerance
     * convention). Normalises either shape to an associative array; a
     * non-object/array value normalises to `[]`. */
    private static function toAssoc($v): array
    {
        if ($v instanceof \stdClass) {
            return get_object_vars($v);
        }
        if (is_array($v)) {
            return $v;
        }
        return [];
    }

    /** True for a non-empty JSON object/array value under either canonical
     * shape (stdClass or a non-empty PHP array). */
    private static function hasEntries($v): bool
    {
        if ($v instanceof \stdClass) {
            return (bool) get_object_vars($v);
        }
        if (is_array($v)) {
            return (bool) $v;
        }
        return false;
    }

    /** Derive template-stash kvs from a manifest entry's `ssrDefaults`
     * section. Each entry shape: `{value, propName, isRestProps}`. */
    private static function deriveStashFromDefaults($defaults, array $props): array
    {
        $extra = [];
        foreach (self::toAssoc($defaults) as $name => $d) {
            $dArr = ($d instanceof \stdClass || is_array($d)) ? self::toAssoc($d) : null;
            if ($dArr === null) {
                $extra[$name] = $d;
                continue;
            }
            if (!empty($dArr['isRestProps'])) {
                $extra[$name] = array_key_exists($name, $props) ? $props[$name] : ($dArr['value'] ?? null);
                continue;
            }
            $propName = $dArr['propName'] ?? null;
            if ($propName !== null && array_key_exists($propName, $props) && $props[$propName] !== null) {
                $extra[$name] = $props[$propName];
            } else {
                $extra[$name] = $dArr['value'] ?? null;
            }
        }
        return $extra;
    }

    // -----------------------------------------------------------------
    // Script Output
    // -----------------------------------------------------------------

    public function scripts(): string
    {
        $tags = [];
        foreach ($this->_scripts() as $path) {
            $tags[] = '<script type="module" src="' . $path . '"></script>';
        }
        return implode("\n", $tags);
    }

    // -----------------------------------------------------------------
    // JS-compat callees (#1189) -- invoked from generated Twig templates as
    // `{{ bf.json(val) }}`, `{{ bf.floor(val) }}`, etc.
    // -----------------------------------------------------------------

    public function json($value): string
    {
        return $this->backend->encode_json($value);
    }

    /** JS `String(v)` mirror: `null` renders as the empty string (not
     * "null") so an unset prop doesn't surface a literal "null"/"undefined"
     * in user-facing HTML (documented divergence, matches the Perl/Python
     * ports).
     *
     * A per-engine "already-safe markup" wrapper (`\Twig\Markup` for the
     * Twig backend, `\Illuminate\Support\HtmlString` for the Blade backend —
     * see #2100) passes through UNCHANGED (object identity, not its string
     * content): captured children / `render_child` output arrive at a
     * text-interpolation position wrapped in the engine's own markup type,
     * and only that wrapped instance survives the ENGINE's own autoescaper
     * un-escaped (Twig's `{{ }}`, Blade's `{!! e(...) !!}` — see each
     * backend's file header). Rather than hard-coding each engine's concrete
     * class here (which would make this engine-agnostic runtime depend on
     * knowing every backend that will ever exist), this checks the built-in
     * `\Stringable` interface: EVERY value this runtime's own `mark_raw`
     * implementations ever produce declares (or auto-implements, PHP 8's
     * behavior for any class with `__toString()`) `\Stringable` — verified
     * for both `Twig\Markup` and `Illuminate\Support\HtmlString` — while the
     * OTHER object shapes this method ever receives (JSON-decoded
     * `stdClass`, plain assoc arrays) never do. The Python port gets the
     * Twig case for free (`markupsafe.Markup` is a `str` subclass, so
     * `js_string` returns it via the string arm, safety intact); PHP's
     * markup wrappers are not strings, so the pass-through must be explicit
     * here.
     *
     * @return string|\Stringable
     */
    public function string($value)
    {
        if ($value instanceof \Stringable) {
            return $value;
        }
        if ($value === null) {
            return '';
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_int($value)) {
            return (string) $value;
        }
        if (is_float($value)) {
            if (is_nan($value)) {
                return 'NaN';
            }
            if ($value === INF) {
                return 'Infinity';
            }
            if ($value === -INF) {
                return '-Infinity';
            }
            return Evaluator::formatNumber($value);
        }
        if (is_string($value)) {
            return $value;
        }
        if (Evaluator::isJsArray($value)) {
            // JS `Array.prototype.toString` == `.join(',')`.
            $parts = array_map(fn ($v) => $v === null ? '' : $this->string($v), $value);
            return implode(',', $parts);
        }
        return '[object Object]'; // stdClass or a non-list (assoc) array
    }

    /** JS `Number(v)` mirror. Deliberate divergence (matches the Perl/Python
     * ports): `null` and non-numeric/empty strings yield real NaN (not 0),
     * so an unset prop / parse failure can't silently zero downstream
     * arithmetic. */
    public function number($value): float
    {
        if ($value === null) {
            return NAN;
        }
        if (is_bool($value)) {
            return $value ? 1.0 : 0.0;
        }
        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }
        if (is_string($value)) {
            $t = trim($value);
            if ($t === '') {
                return NAN;
            }
            return Evaluator::looksLikeNumber($t) ? Evaluator::parseNumberLiteral($t) : NAN;
        }
        return NAN; // array / object
    }

    public function truthy($value): bool
    {
        return Evaluator::truthy($value);
    }

    /** JS `%`: remainder with the dividend's sign. PHP's `fmod` already
     * implements C-style fmod semantics matching JS `%` for every case
     * (zero divisor, infinite/NaN operands all yield NaN natively). */
    public function mod($a, $b): float
    {
        return fmod($this->number($a), $this->number($b));
    }

    public function floor($value): float
    {
        $n = $this->number($value);
        return (is_nan($n) || is_infinite($n)) ? $n : floor($n);
    }

    public function ceil($value): float
    {
        $n = $this->number($value);
        return (is_nan($n) || is_infinite($n)) ? $n : ceil($n);
    }

    /** JS `Math.round` rounds half toward +Infinity (`Math.round(-1.5)` is
     * -1, not -2). `floor(n + 0.5)` reproduces that for both signs. */
    public function round($value): float
    {
        $n = $this->number($value);
        return (is_nan($n) || is_infinite($n)) ? $n : floor($n + 0.5);
    }

    // -----------------------------------------------------------------
    // Array / String method helpers (#1448 Tier A)
    // -----------------------------------------------------------------

    /** String receivers arriving as an array/object coerce to '' (mirrors
     * Perl's `ref($recv) ? '' : "$recv"`); anything else (incl. null) goes
     * through `string()`. Shared by every string-method helper below. */
    private function scalarOrEmpty($value): string
    {
        if (is_array($value) || $value instanceof \stdClass) {
            return '';
        }
        return $this->string($value);
    }

    private function getField($el, string $key)
    {
        if ($el instanceof \stdClass) {
            return property_exists($el, $key) ? $el->$key : null;
        }
        if (is_array($el) && !Evaluator::isJsArray($el)) {
            return array_key_exists($key, $el) ? $el[$key] : null;
        }
        return null;
    }

    /** `Array.prototype.includes(x)` / `String.prototype.includes(sub)`
     * share a method name in JS and lower to the same call. Dispatches on
     * the receiver's PHP type: a JS-array scans elements with
     * `Evaluator::sameValueZero()` (SameValueZero membership -- no
     * cross-type coercion, e.g. `[2].includes("2")` is false; NaN matches
     * NaN); anything else falls back to substring search. */
    public function includes($recv, $elem): bool
    {
        if (Evaluator::isJsArray($recv)) {
            foreach ($recv as $item) {
                if (Evaluator::sameValueZero($item, $elem)) {
                    return true;
                }
            }
            return false;
        }
        if (is_array($recv) || $recv instanceof \stdClass) {
            return false; // a plain object is not a JS `.includes` target
        }
        return str_contains($this->scalarOrEmpty($recv), $this->scalarOrEmpty($elem));
    }

    public function filter($recv, callable $pred): array
    {
        if (!Evaluator::isJsArray($recv)) {
            return [];
        }
        return array_values(array_filter($recv, $pred));
    }

    public function every($recv, callable $pred): bool
    {
        if (!Evaluator::isJsArray($recv)) {
            return true;
        }
        foreach ($recv as $item) {
            if (!$pred($item)) {
                return false;
            }
        }
        return true;
    }

    public function some($recv, callable $pred): bool
    {
        if (!Evaluator::isJsArray($recv)) {
            return false;
        }
        foreach ($recv as $item) {
            if ($pred($item)) {
                return true;
            }
        }
        return false;
    }

    public function find($recv, callable $pred)
    {
        if (!Evaluator::isJsArray($recv)) {
            return null;
        }
        foreach ($recv as $item) {
            if ($pred($item)) {
                return $item;
            }
        }
        return null;
    }

    public function find_index($recv, callable $pred): int
    {
        if (!Evaluator::isJsArray($recv)) {
            return -1;
        }
        foreach (array_values($recv) as $i => $item) {
            if ($pred($item)) {
                return $i;
            }
        }
        return -1;
    }

    public function find_last($recv, callable $pred)
    {
        if (!Evaluator::isJsArray($recv)) {
            return null;
        }
        $arr = array_values($recv);
        for ($i = count($arr) - 1; $i >= 0; $i--) {
            if ($pred($arr[$i])) {
                return $arr[$i];
            }
        }
        return null;
    }

    public function find_last_index($recv, callable $pred): int
    {
        if (!Evaluator::isJsArray($recv)) {
            return -1;
        }
        $arr = array_values($recv);
        for ($i = count($arr) - 1; $i >= 0; $i--) {
            if ($pred($arr[$i])) {
                return $i;
            }
        }
        return -1;
    }

    public function lc($s): string
    {
        return $s === null ? '' : mb_strtolower($this->string($s), 'UTF-8');
    }

    public function uc($s): string
    {
        return $s === null ? '' : mb_strtoupper($this->string($s), 'UTF-8');
    }

    /** `Array.prototype.join(sep)` -- separator defaults to ",", undefined/
     * null elements render as empty. */
    public function join($recv, $sep = null): string
    {
        if (!Evaluator::isJsArray($recv)) {
            return '';
        }
        $sepStr = $sep === null ? ',' : $this->string($sep);
        $parts = array_map(fn ($x) => $x === null ? '' : $this->string($x), $recv);
        return implode($sepStr, $parts);
    }

    /** `.length` -- JS works on both arrays (element count) and strings
     * (character count). Code-point length (see the design doc's `len`
     * vector note: the golden vectors only pin ASCII cases). */
    public function length($recv): int
    {
        if (Evaluator::isJsArray($recv)) {
            return count($recv);
        }
        if (is_array($recv) || $recv instanceof \stdClass) {
            return 0; // a plain object has no `.length`
        }
        return mb_strlen($this->scalarOrEmpty($recv), 'UTF-8');
    }

    private function arrayIndexOf($recv, $elem, bool $reverse): int
    {
        if (!Evaluator::isJsArray($recv)) {
            return -1;
        }
        $arr = array_values($recv);
        $n = count($arr);
        if ($n === 0) {
            return -1;
        }
        $indices = $reverse ? range($n - 1, 0) : range(0, $n - 1);
        foreach ($indices as $i) {
            if (Evaluator::strictEq($arr[$i], $elem)) {
                return $i;
            }
        }
        return -1;
    }

    public function index_of($recv, $elem): int
    {
        return $this->arrayIndexOf($recv, $elem, false);
    }

    public function last_index_of($recv, $elem): int
    {
        return $this->arrayIndexOf($recv, $elem, true);
    }

    /** `Array.prototype.at(i)` -- supports negative indices. */
    public function at($recv, $i)
    {
        if (!Evaluator::isJsArray($recv) || $i === null) {
            return null;
        }
        $len = count($recv);
        if ($len === 0) {
            return null;
        }
        $idx = $i < 0 ? $len + $i : $i;
        if ($idx < 0 || $idx >= $len) {
            return null;
        }
        return array_values($recv)[$idx];
    }

    public function concat($a, $b): array
    {
        $out = [];
        if (Evaluator::isJsArray($a)) {
            foreach ($a as $x) {
                $out[] = $x;
            }
        }
        if (Evaluator::isJsArray($b)) {
            foreach ($b as $x) {
                $out[] = $x;
            }
        }
        return $out;
    }

    /** `Array.prototype.slice(start, end?)`. */
    public function slice($recv, $start, $end): array
    {
        if (!Evaluator::isJsArray($recv)) {
            return [];
        }
        $arr = array_values($recv);
        $len = count($arr);
        if ($len === 0) {
            return [];
        }
        $s = $start ?? 0;
        if ($s < 0) {
            $s += $len;
        }
        $s = max($s, 0);
        $s = min($s, $len);
        $e = $end ?? $len;
        if ($e < 0) {
            $e += $len;
        }
        $e = max($e, 0);
        $e = min($e, $len);
        if ($s >= $e) {
            return [];
        }
        return array_slice($arr, (int) $s, (int) ($e - $s));
    }

    public function reverse($recv): array
    {
        return Evaluator::isJsArray($recv) ? array_reverse($recv) : [];
    }

    /** `Array.prototype.flat(depth?)` -- a `$depth` of -1 is the `Infinity`
     * sentinel (flatten fully); 0 returns a shallow copy. */
    public function flat($recv, $depth = 1): array
    {
        if (!Evaluator::isJsArray($recv)) {
            return [];
        }
        $out = [];
        foreach ($recv as $el) {
            if ($depth != 0 && Evaluator::isJsArray($el)) {
                $next = $depth > 0 ? $depth - 1 : $depth;
                foreach ($this->flat($el, $next) as $x) {
                    $out[] = $x;
                }
            } else {
                $out[] = $el;
            }
        }
        return $out;
    }

    /**
     * Coerce an arbitrary PHP value to `[float, ok]` mirroring JS
     * `ToNumber`, for `flat_dynamic()`'s depth-coercion pipeline. `ok` is
     * `false` for a shape `ToNumber` can't coerce meaningfully (`null`, or a
     * non-numeric string) -- `coerceFlatDepth()` treats that the same as an
     * actual `NaN` result (-> depth `0`), matching JS. Mirrors Go's
     * `flatDepthToFloat` (adapter-go-template/runtime/bf.go).
     *
     * PHP-specific traps this deliberately avoids: PHP's `(int)`/`(float)`
     * casts on a non-numeric string silently yield `0` rather than
     * signalling failure (`(int)"Infinity"` is `0` in PHP), which would
     * misclassify `"Infinity"` as a NaN-that-looks-like-0 instead of
     * `+Infinity`; and PHP's `is_numeric()` returns `false` for
     * `"Infinity"`/`"NaN"` (unlike JS `Number("Infinity")`), so those exact
     * (case-sensitive, as JS spells them) spellings are checked explicitly
     * BEFORE falling back to `is_numeric()` + `(float)` for ordinary
     * numeric strings.
     *
     * @return array{0: float, 1: bool}
     */
    private static function flatDepthToFloat($depth): array
    {
        if ($depth === null) {
            return [0.0, false];
        }
        if (is_int($depth) || is_float($depth)) {
            return [(float) $depth, true];
        }
        if (is_bool($depth)) {
            return [$depth ? 1.0 : 0.0, true];
        }
        if (is_string($depth)) {
            $s = trim($depth);
            if ($s === '') {
                return [0.0, true]; // JS: Number("") is 0
            }
            if ($s === 'Infinity' || $s === '+Infinity') {
                return [INF, true];
            }
            if ($s === '-Infinity') {
                return [-INF, true];
            }
            if ($s === 'NaN') {
                return [NAN, false]; // NaN input -> "not ok", like Go
            }
            if (is_numeric($s)) {
                return [(float) $s, true];
            }
            return [0.0, false]; // not numeric -> NaN
        }
        return [0.0, false]; // array / object
    }

    /**
     * JS `ToIntegerOrInfinity` coercion for `.flat(depth)`'s dynamic
     * argument (#2094): truncate toward zero; NaN/non-numeric -> 0;
     * negative -> 0; `+Infinity` or a huge finite value -> flatten fully
     * (mapped to `flat()`'s existing `-1` "flatten fully" sentinel).
     *
     * Mirrors Go's `coerceFlatDepth` (adapter-go-template/runtime/bf.go) --
     * see that function's doc for why `flat_dynamic()` cannot share
     * `flat()`'s literal-depth entry point: a genuinely dynamic depth that
     * evaluates to `-1` means "never recurse" in real JS
     * (`[1,[2]].flat(-1)` behaves like `.flat(0)`) -- the OPPOSITE of what
     * `flat()`'s `-1` argument means when it arrives from a *literal*
     * `Infinity` in the source. Since both call sites would otherwise hand
     * the same literal-looking `-1` to one shared function, that function
     * cannot tell which case it's in, so the two paths must stay separate
     * entry points.
     */
    private static function coerceFlatDepth($depth): int
    {
        [$f, $ok] = self::flatDepthToFloat($depth);
        if (!$ok || is_nan($f)) {
            return 0;
        }
        if ($f === INF) {
            return -1; // flat()'s "flatten fully" sentinel
        }
        if ($f === -INF) {
            return 0;
        }
        $trunc = $f >= 0 ? floor($f) : ceil($f); // truncate toward zero
        if ($trunc < 0) {
            return 0;
        }
        if ($trunc > 1_000_000) {
            return -1; // huge finite depth ~= flatten fully
        }
        return (int) $trunc;
    }

    /**
     * `Array.prototype.flat(depth)` where `$depth` is a genuinely dynamic
     * value (#2094) -- e.g. a prop -- rather than a compile-time literal.
     * Coerces `$depth` via JS `ToIntegerOrInfinity` (`coerceFlatDepth()`)
     * then delegates to `flat()`. Deliberately a DISTINCT entry point from
     * `flat()` rather than a smarter overload of it -- see
     * `coerceFlatDepth()`'s docstring for why.
     */
    public function flat_dynamic($recv, $depth): array
    {
        return $this->flat($recv, self::coerceFlatDepth($depth));
    }

    /** `Array.prototype.flatMap(fn)` field/self projection then flatten one
     * level. */
    public function flat_map($recv, string $keyKind, string $key): array
    {
        if (!Evaluator::isJsArray($recv)) {
            return [];
        }
        $projected = [];
        foreach ($recv as $el) {
            $projected[] = $keyKind === 'field' ? $this->getField($el, $key) : $el;
        }
        return $this->flat($projected, 1);
    }

    /** `Array.prototype.flatMap(i => [i.a, i.b])` -- array-literal tuple
     * projection. `$flat` is a flat (kind, key, kind, key, ...) sequence,
     * paired internally. */
    public function flat_map_tuple($recv, ...$flat): array
    {
        if (!Evaluator::isJsArray($recv)) {
            return [];
        }
        $specs = [];
        for ($i = 0; $i + 1 < count($flat); $i += 2) {
            $specs[] = [$flat[$i], $flat[$i + 1]];
        }
        $out = [];
        foreach ($recv as $el) {
            foreach ($specs as [$kind, $key]) {
                $out[] = $kind === 'field' ? $this->getField($el, $key) : $el;
            }
        }
        return $out;
    }

    public function trim($recv): string
    {
        if ($recv === null || is_array($recv) || $recv instanceof \stdClass) {
            return '';
        }
        return (string) preg_replace('/^\s+|\s+$/u', '', $this->string($recv));
    }

    /** `Number.prototype.toFixed(digits)` -- JS rounds the scaled integer
     * half toward +Infinity (the spec's "pick the larger n" tie-break); a
     * bare `sprintf('%.*f')` would round half-to-even, diverging. */
    public function to_fixed($value, $digits = 0): string
    {
        $n = $this->number($value);
        if (is_nan($n)) {
            return 'NaN';
        }
        if (is_infinite($n)) {
            return $n < 0 ? '-Infinity' : 'Infinity';
        }
        $digits = $digits === null ? 0 : (int) $digits;
        if ($digits < 0) {
            $digits = 0;
        }
        $factor = 10 ** $digits;
        $rounded = floor($n * $factor + 0.5);
        return sprintf('%.' . $digits . 'f', $rounded / $factor);
    }

    /** `String.prototype.split(sep)`. An empty separator splits into
     * individual (UTF-8) characters; undefined separator -> single-element
     * array; empty receiver with a non-empty separator -> `['']`. */
    public function split($recv, $sep = null, $limit = null): array
    {
        $s = $this->scalarOrEmpty($recv);
        if ($sep === null) {
            $parts = [$s];
        } elseif ($this->string($sep) === '') {
            $parts = $s === '' ? [] : preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY);
        } elseif ($s === '') {
            $parts = [''];
        } else {
            $parts = explode($this->string($sep), $s);
        }
        if ($limit !== null) {
            $n = (int) $limit;
            if ($n === 0) {
                $parts = [];
            } elseif ($n > 0 && $n < count($parts)) {
                $parts = array_slice($parts, 0, $n);
            }
        }
        return $parts;
    }

    public function starts_with($recv, $prefix, $position = null): bool
    {
        $s = $this->scalarOrEmpty($recv);
        $p = $this->string($prefix);
        if ($position !== null) {
            $len = mb_strlen($s, 'UTF-8');
            $n = max(0, min((int) $position, $len));
            $s = mb_substr($s, $n, null, 'UTF-8');
        }
        return str_starts_with($s, $p);
    }

    public function ends_with($recv, $suffix, $endPosition = null): bool
    {
        $s = $this->scalarOrEmpty($recv);
        $x = $this->string($suffix);
        if ($endPosition !== null) {
            $len = mb_strlen($s, 'UTF-8');
            $e = max(0, min((int) $endPosition, $len));
            $s = mb_substr($s, 0, $e, 'UTF-8');
        }
        if ($x === '') {
            return true;
        }
        return str_ends_with($s, $x);
    }

    /** `String.prototype.replace(pattern, replacement)` -- string-pattern
     * form only, replacing the FIRST occurrence (literal, not regex). */
    public function replace($recv, $pattern, $replacement): string
    {
        $s = $this->scalarOrEmpty($recv);
        $o = $this->string($pattern);
        $n = $this->string($replacement);
        if ($o === '') {
            return $n . $s;
        }
        $i = strpos($s, $o);
        if ($i === false) {
            return $s;
        }
        return substr($s, 0, $i) . $n . substr($s, $i + strlen($o));
    }

    /** `queryHref(base, {...})` (#2042) -- build `"$base?k=v&..."` from a
     * flat (guard, key, value) triple sequence. A pair is included iff its
     * guard is JS-truthy AND its value is a non-empty string; an array value
     * appends one pair per non-empty member; repeating a key overwrites the
     * value at its first position. */
    public function query($base, ...$triples): string
    {
        $b = $this->scalarOrEmpty($base);
        $pairs = [];
        $pos = [];
        $n = count($triples);
        $i = 0;
        while ($i + 2 < $n) {
            $guard = $triples[$i];
            $key = $triples[$i + 1];
            $val = $triples[$i + 2];
            $i += 3;
            if (!$this->truthy($guard)) {
                continue;
            }
            $keyS = $this->scalarOrEmpty($key);
            if (Evaluator::isJsArray($val)) {
                foreach ($val as $m) {
                    $s = $this->scalarOrEmpty($m);
                    if ($s === '') {
                        continue;
                    }
                    $pairs[] = [$keyS, $s];
                }
                continue;
            }
            $valS = $this->scalarOrEmpty($val);
            if ($valS === '') {
                continue;
            }
            if (array_key_exists($keyS, $pos)) {
                $pairs[$pos[$keyS]] = [$keyS, $valS];
            } else {
                $pos[$keyS] = count($pairs);
                $pairs[] = [$keyS, $valS];
            }
        }
        if (!$pairs) {
            return $b;
        }
        $parts = array_map(fn ($p) => self::formEscape($p[0]) . '=' . self::formEscape($p[1]), $pairs);
        return $b . '?' . implode('&', $parts);
    }

    /** `application/x-www-form-urlencoded` serialisation matching the
     * browser's `URLSearchParams`: keep ASCII alphanumerics and `* - . _`;
     * encode every other byte as `%XX` (upper hex); space -> `+`. Byte-wise
     * (PHP strings are raw bytes), so UTF-8 multi-byte sequences are
     * percent-encoded byte-by-byte, matching the Perl/Python ports. */
    private static function formEscape(string $s): string
    {
        $encoded = preg_replace_callback(
            '/[^A-Za-z0-9*\-._ ]/',
            static fn (array $m) => '%' . strtoupper(bin2hex($m[0])),
            $s
        );
        return str_replace(' ', '+', $encoded);
    }

    public function repeat($recv, $count): string
    {
        $s = $this->scalarOrEmpty($recv);
        $n = $count !== null ? (int) $count : 0;
        return $n > 0 ? str_repeat($s, $n) : '';
    }

    /** Pad `$s` to `$target` (UTF-8) characters with `$pad` (default a
     * single space) repeated and truncated to fill. */
    private function pad(string $s, $target, $pad, bool $atStart): string
    {
        $p = $pad === null ? ' ' : $this->string($pad);
        if ($p === '') {
            return $s;
        }
        $len = mb_strlen($s, 'UTF-8');
        $t = $target !== null ? (int) $target : 0;
        if ($len >= $t) {
            return $s;
        }
        $need = $t - $len;
        $plen = mb_strlen($p, 'UTF-8');
        $reps = intdiv($need, $plen) + 1;
        $fill = mb_substr(str_repeat($p, $reps), 0, $need, 'UTF-8');
        return $atStart ? $fill . $s : $s . $fill;
    }

    public function pad_start($recv, $target, $pad = null): string
    {
        return $this->pad($this->scalarOrEmpty($recv), $target, $pad, true);
    }

    public function pad_end($recv, $target, $pad = null): string
    {
        return $this->pad($this->scalarOrEmpty($recv), $target, $pad, false);
    }

    // -----------------------------------------------------------------
    // Array.prototype.sort(cmp) / reduce(fn) -- structured dispatch
    // (#1448 Tier B/C). `$opts` is an associative array (or stdClass)
    // with the field shapes documented in the Perl port.
    // -----------------------------------------------------------------

    private function toOptsArray($opts): array
    {
        if ($opts instanceof \stdClass) {
            return get_object_vars($opts);
        }
        return is_array($opts) ? $opts : [];
    }

    private function isNumericLike($v): bool
    {
        if ($v === null || is_bool($v)) {
            return false;
        }
        if (is_int($v) || is_float($v)) {
            return true;
        }
        if (is_string($v)) {
            return Evaluator::looksLikeNumber($v);
        }
        return false;
    }

    private function numericValue($v): float
    {
        if ($v === null || is_array($v) || $v instanceof \stdClass) {
            return 0.0;
        }
        if (is_bool($v)) {
            return $v ? 1.0 : 0.0;
        }
        if (is_int($v) || is_float($v)) {
            return (float) $v;
        }
        if (is_string($v)) {
            return Evaluator::looksLikeNumber($v) ? Evaluator::parseNumberLiteral($v) : 0.0;
        }
        return 0.0;
    }

    /** Compare two projected sort keys, ascending orientation (-1/0/1); the
     * caller negates for 'desc'. 'auto' compares numerically when both keys
     * look like numbers, else lexically. `null` coalesces to '' / 0. */
    private function compareSortKey($av, $bv, string $compareType): int
    {
        // String comparisons below MUST use strcmp(), not PHP's `<=>`: PHP
        // applies "smart" numeric-string comparison when both operands look
        // numeric ("10" <=> "9" compares 10 > 9 numerically), which would
        // silently make the 'string' compare_type behave like 'auto' for
        // numeric-looking values -- see the matching note on
        // Evaluator::relational().
        if ($compareType === 'string') {
            $a = $av === null ? '' : $this->string($av);
            $b = $bv === null ? '' : $this->string($bv);
            return strcmp($a, $b) <=> 0;
        }
        if ($compareType === 'auto') {
            if ($this->isNumericLike($av) && $this->isNumericLike($bv)) {
                return $this->numericValue($av) <=> $this->numericValue($bv);
            }
            $a = $av === null ? '' : $this->string($av);
            $b = $bv === null ? '' : $this->string($bv);
            return strcmp($a, $b) <=> 0;
        }
        // numeric
        $an = $av === null ? 0.0 : $this->numericValue($av);
        $bn = $bv === null ? 0.0 : $this->numericValue($bv);
        return $an <=> $bn;
    }

    public function sort($recv, $opts = null): array
    {
        if (!Evaluator::isJsArray($recv)) {
            return [];
        }
        $optsArr = $this->toOptsArray($opts);
        $keysRaw = $optsArr['keys'] ?? [];
        $spec = [];
        foreach ((is_array($keysRaw) ? $keysRaw : []) as $k) {
            $kArr = $this->toOptsArray($k);
            $spec[] = [
                'key_kind' => $kArr['key_kind'] ?? 'self',
                'key' => $kArr['key'] ?? '',
                'compare_type' => $kArr['compare_type'] ?? 'numeric',
                'direction' => $kArr['direction'] ?? 'asc',
            ];
        }
        if (!$spec) {
            return array_values($recv);
        }

        $keyed = [];
        foreach ($recv as $item) {
            $ks = [];
            foreach ($spec as $s) {
                $ks[] = $s['key_kind'] === 'field' ? $this->getField($item, $s['key']) : $item;
            }
            $keyed[] = [$ks, $item];
        }

        usort($keyed, function ($a, $b) use ($spec) {
            foreach ($spec as $i => $s) {
                $c = $this->compareSortKey($a[0][$i], $b[0][$i], $s['compare_type']);
                if ($c === 0) {
                    continue;
                }
                return $s['direction'] === 'desc' ? -$c : $c;
            }
            return 0;
        });

        return array_map(fn ($p) => $p[1], $keyed);
    }

    /** Fold an array into a scalar via the arithmetic-fold catalogue
     * (`{op, key_kind, key, type, init, direction}`). */
    public function reduce($recv, $opts = null)
    {
        $optsArr = $this->toOptsArray($opts);
        $op = $optsArr['op'] ?? '+';
        $keyKind = $optsArr['key_kind'] ?? 'self';
        $key = $optsArr['key'] ?? '';
        $type = $optsArr['type'] ?? 'numeric';
        $direction = $optsArr['direction'] ?? 'left';

        $items = Evaluator::isJsArray($recv) ? $recv : [];
        if ($direction === 'right') {
            $items = array_reverse($items);
        }

        $project = fn ($item) => $keyKind === 'field' ? $this->getField($item, $key) : $item;

        if ($type === 'string') {
            $acc = $optsArr['init'] ?? '';
            foreach ($items as $item) {
                $acc .= $this->string($project($item));
            }
            return $acc;
        }

        $acc = $optsArr['init'] ?? 0;
        foreach ($items as $item) {
            $n = $project($item);
            $numeric = ($n !== null && $this->isNumericLike($n)) ? $this->numericValue($n) : 0;
            $acc = $op === '*' ? $acc * $numeric : $acc + $numeric;
        }
        return $acc;
    }

    // -----------------------------------------------------------------
    // JSX intrinsic-element spread (#1407)
    // -----------------------------------------------------------------

    private const SVG_CAMEL_CASE_ATTRS = [
        'allowReorder', 'attributeName', 'attributeType', 'autoReverse',
        'baseFrequency', 'baseProfile', 'calcMode', 'clipPathUnits',
        'contentScriptType', 'contentStyleType', 'diffuseConstant', 'edgeMode',
        'externalResourcesRequired', 'filterRes', 'filterUnits', 'glyphRef',
        'gradientTransform', 'gradientUnits', 'kernelMatrix', 'kernelUnitLength',
        'keyPoints', 'keySplines', 'keyTimes', 'lengthAdjust', 'limitingConeAngle',
        'markerHeight', 'markerUnits', 'markerWidth', 'maskContentUnits',
        'maskUnits', 'numOctaves', 'pathLength', 'patternContentUnits',
        'patternTransform', 'patternUnits', 'pointsAtX', 'pointsAtY', 'pointsAtZ',
        'preserveAlpha', 'preserveAspectRatio', 'primitiveUnits', 'refX', 'refY',
        'repeatCount', 'repeatDur', 'requiredExtensions', 'requiredFeatures',
        'specularConstant', 'specularExponent', 'spreadMethod', 'startOffset',
        'stdDeviation', 'stitchTiles', 'surfaceScale', 'systemLanguage',
        'tableValues', 'targetX', 'targetY', 'textLength', 'viewBox', 'viewTarget',
        'xChannelSelector', 'yChannelSelector', 'zoomAndPan',
    ];

    private static function toAttrName(string $key): string
    {
        if ($key === 'className') {
            return 'class';
        }
        if ($key === 'htmlFor') {
            return 'for';
        }
        if (in_array($key, self::SVG_CAMEL_CASE_ATTRS, true)) {
            return $key;
        }
        // camelCase -> kebab-case, with a leading `-` for an initial
        // uppercase letter (JS-reference parity -- same documented
        // behaviour as the Go/Perl/Python adapters).
        return (string) preg_replace_callback('/([A-Z])/', fn ($m) => '-' . strtolower($m[1]), $key);
    }

    /** HTML attribute-value escape -- numeric-entity quotes (`&#34;`/`&#39;`)
     * for cross-adapter byte parity (matches Go's `template.HTMLEscapeString`
     * / the Perl/Python ports' `_html_escape`). Used only by the runtime's
     * OWN escape paths (`spread_attrs`, `style` values) that bypass Twig's
     * autoescaper via `mark_raw` -- NOT by plain `{{ }}` interpolation, which
     * uses Twig's own (differently-spelled but conformance-equivalent)
     * default escaper. */
    private function htmlEscape($value): string
    {
        $s = $this->string($value);
        $s = str_replace('&', '&amp;', $s);
        $s = str_replace('<', '&lt;', $s);
        $s = str_replace('>', '&gt;', $s);
        $s = str_replace('"', '&#34;', $s);
        $s = str_replace("'", '&#39;', $s);
        return $s;
    }

    private function styleToCss($value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (!($value instanceof \stdClass || is_array($value))) {
            // Non-object values pass through stringified.
            $s = $this->string($value);
            return $s !== '' ? $s : null;
        }
        $assoc = self::toAssoc($value);
        ksort($assoc, SORT_STRING);
        $parts = [];
        foreach ($assoc as $key => $v) {
            if ($v === null) {
                continue;
            }
            $prop = preg_replace_callback('/([A-Z])/', fn ($m) => '-' . strtolower($m[1]), (string) $key);
            $parts[] = $prop . ':' . $this->string($v);
        }
        return $parts ? implode(';', $parts) : null;
    }

    /** Mirrors the JS `spreadAttrs` runtime so SSR output stays byte-equal
     * across adapters. Skip rules: null values, event handlers
     * (`on[A-Z]...`), `children`. Real PHP booleans -> bare attr (true) /
     * dropped (false) -- no sentinel dance needed, unlike Perl. Keys sorted
     * alphabetically; `style` routes through `styleToCss`; result wrapped
     * `mark_raw`. */
    public function spread_attrs($bag)
    {
        if ($bag instanceof \stdClass) {
            $assoc = get_object_vars($bag);
        } elseif (is_array($bag)) {
            $assoc = $bag;
        } else {
            return '';
        }
        ksort($assoc, SORT_STRING);

        $parts = [];
        foreach ($assoc as $key => $val) {
            $key = (string) $key;
            if (strlen($key) > 2 && substr($key, 0, 2) === 'on') {
                $c = substr($key, 2, 1);
                if (strtoupper($c) === $c) {
                    continue; // event handler
                }
            }
            if ($key === 'children') {
                continue;
            }
            if ($val === null) {
                continue;
            }
            if (is_bool($val)) {
                if ($val) {
                    $parts[] = self::toAttrName($key);
                }
                continue;
            }
            if ($key === 'style') {
                $css = $this->styleToCss($val);
                if ($css === null || $css === '') {
                    continue;
                }
                $parts[] = 'style="' . $this->htmlEscape($css) . '"';
                continue;
            }
            $parts[] = self::toAttrName($key) . '="' . $this->htmlEscape($val) . '"';
        }
        if (!$parts) {
            return '';
        }
        return $this->backend->mark_raw(implode(' ', $parts));
    }

    /**
     * Object-rest residual (`{ id, title, ...rest }` -> `rest`), #2087 Phase
     * B. Returns a TRUE residual -- a fresh assoc array holding every key of
     * `$bag` EXCEPT those in `$exclude` (the sibling keys the destructure
     * pattern already bound explicitly) -- not an alias of the whole item,
     * so a template read of `rest.someExplicitlyDestructuredKey` can't
     * observe a value the JS destructure semantics say it shouldn't see.
     *
     * Mirrors `spread_attrs`'s bag-shape handling: `$bag` is either a
     * `stdClass` (a JSON-decoded loop item) or a plain PHP assoc array (the
     * "canonical value convention" accepts both as an "object" -- see
     * `spread_attrs`'s docstring above). Returns a plain PHP array (not
     * `stdClass`) so both Twig's dot accessor (`rest.flag`) and
     * `spread_attrs`'s own bag handling work on the result unchanged --
     * verified empirically against Twig 3.x: dot notation resolves an
     * ARRAY-ITEM key before falling back to an object property, so `.flag`
     * on an assoc array works exactly like `.flag` on a `stdClass`.
     */
    public function omit($bag, array $exclude): array
    {
        if ($bag instanceof \stdClass) {
            $assoc = get_object_vars($bag);
        } elseif (is_array($bag)) {
            $assoc = $bag;
        } else {
            return [];
        }
        $excludeSet = array_flip(array_map('strval', $exclude));
        $out = [];
        foreach ($assoc as $key => $val) {
            if (array_key_exists((string) $key, $excludeSet)) {
                continue;
            }
            $out[$key] = $val;
        }
        return $out;
    }

    // -----------------------------------------------------------------
    // NEW helpers vs. the Perl/Python ports (design doc section 2): JS
    // `===`/`!==` for the JSON value domain -- Twig `==` compiles to PHP
    // loose `==` (`'1' == 1` is true, wrong), and `is same as` is PHP `===`
    // which fails `1 === 1.0`. ONE shared implementation with the Evaluator.
    // -----------------------------------------------------------------

    public function eq($a, $b): bool
    {
        return Evaluator::strictEq($a, $b);
    }

    public function neq($a, $b): bool
    {
        return !Evaluator::strictEq($a, $b);
    }

    // -----------------------------------------------------------------
    // Evaluator-driven sort / reduce / higher-order predicates (#2018): the
    // comparator/reducer/predicate body rides as a serialized-ParsedExpr
    // JSON string and is evaluated per element, delegating to Evaluator.
    // -----------------------------------------------------------------

    public function sort_eval($recv, string $cmpJson, string $paramA, string $paramB, array $baseEnv = []): array
    {
        return Evaluator::sortByJson($recv, $cmpJson, $paramA, $paramB, $baseEnv);
    }

    public function reduce_eval($recv, string $bodyJson, string $accName, string $itemName, $init, string $direction = 'left', array $baseEnv = [])
    {
        return Evaluator::foldJson($recv, $bodyJson, $accName, $itemName, $init, $direction, $baseEnv);
    }

    public function filter_eval($recv, string $predJson, string $param, array $baseEnv = []): array
    {
        return Evaluator::filterJson($recv, $predJson, $param, $baseEnv);
    }

    public function every_eval($recv, string $predJson, string $param, array $baseEnv = []): bool
    {
        return Evaluator::everyJson($recv, $predJson, $param, $baseEnv);
    }

    public function some_eval($recv, string $predJson, string $param, array $baseEnv = []): bool
    {
        return Evaluator::someJson($recv, $predJson, $param, $baseEnv);
    }

    public function find_eval($recv, string $predJson, string $param, bool $forward = true, array $baseEnv = [])
    {
        return Evaluator::findJson($recv, $predJson, $param, $forward, $baseEnv);
    }

    public function find_index_eval($recv, string $predJson, string $param, bool $forward = true, array $baseEnv = []): int
    {
        return Evaluator::findIndexJson($recv, $predJson, $param, $forward, $baseEnv);
    }

    public function flat_map_eval($recv, string $projJson, string $param, array $baseEnv = []): array
    {
        return Evaluator::flatMapJson($recv, $projJson, $param, $baseEnv);
    }

    public function map_eval($recv, string $projJson, string $param, array $baseEnv = []): array
    {
        return Evaluator::mapJson($recv, $projJson, $param, $baseEnv);
    }
}
