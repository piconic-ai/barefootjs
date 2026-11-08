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
 *
 * JS `undefined` is the singleton `Undefined::value()` (`bf.undefined()` /
 * `$bf->undefined()` in a template) and PHP's `null` is JS `null`
 * (spec/js-undefined-value.md). A props array has JS's four states for a
 * prop: the key left out (absent), `Undefined` (present `undefined`), `null`
 * and a value. `Undefined` is a PHP object: truthy under PHP's own tests and
 * "set" for `??` / `isset`, so every nullish test on a JS value in this
 * runtime goes through `is_nullish` / `is_undefined` / `is_null`
 * (`Undefined::isNullish()` ...), never `??` / `isset` / `=== null` /
 * `empty()`. A `??` / `isset` left here reads internal state or an options
 * array the compiler writes, never a JS value.
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

    /** @var list<array<string, true>> The keys each `render_child` call
     * passed, innermost last (see `passed`). */
    private static array $callerKeys = [];

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
     * `_script_seen`, `_preloads`, `_preload_seen`, `_child_renderers`,
     * `_portal_elements` --
     * the internal state generated render scripts and the test harness
     * poke directly (e.g.
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
        if (
            $name === '_scripts' || $name === '_script_seen'
            || $name === '_preloads' || $name === '_preload_seen'
            || $name === '_child_renderers' || $name === '_portal_elements'
        ) {
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
        if (Undefined::isNullish($k)) {
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
        // `JSON.stringify`: an `undefined` member is dropped, an `undefined`
        // element is `null` (`Json::ready`), whatever encoder the backend has.
        $json = $this->htmlEscape($this->backend->encode_json(Json::ready($props)));
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

    /** A consumer with no provider reads the context's default, or JS
     * `undefined` when the call gives none. */
    public function use_context(string $name, $default = null)
    {
        if (empty(self::$contextStacks[$name])) {
            return func_num_args() < 2 ? Undefined::value() : $default;
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

    /**
     * Neutralize a value for splicing into comment()'s HTML comment content
     * (#2795 follow-up). comment() itself does no escaping -- fine for every
     * other caller (marker IDs like "cond-start:s0", "loop:l0", ...), which
     * are entirely compiler-generated, but the whole-item-conditional loop's
     * "loop-i:<key>" anchor carries a user-controlled key. Standard HTML
     * escaping doesn't help inside a comment -- only the literal sequence
     * "-->" terminates it early, and &/</>/"/' are not special there. The
     * key's exact text doesn't need to round-trip (the client's
     * mapArrayAnchored matches items positionally and by its own
     * JS-computed key, never by re-parsing the anchor Comment.nodeValue), so
     * replacing every "-" with the visually-similar U+2010 is sufficient and
     * needs no decoding.
     */
    public function escape_comment_key($value): string
    {
        return str_replace('-', '‐', $this->string($value));
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

    /**
     * A JSX text child's value: JSX renders nothing for a boolean (#3824
     * step 5). Any other value passes through to the text sink.
     */
    public function display($value)
    {
        return is_bool($value) ? '' : $value;
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
            $propsJson = '|' . $this->backend->encode_json(Json::ready($props));
        }
        return "<!--bf-scope:{$scopeId}{$hostSegment}{$propsJson}-->";
    }

    /** Paired end marker for scope_comment above. Bounds the scope's sibling
     * range so client-side queries from a fragment-rooted scope don't leak
     * onto later siblings owned by the parent (#2289). No `|h=`/`|m=`/props
     * segments — the client only needs the scope id to find the matching end. */
    public function scope_comment_end(): string
    {
        $scopeId = $this->_scope_id() ?? '';
        return "<!--bf-/scope:{$scopeId}-->";
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

    /**
     * Register a `<link rel="modulepreload">` hint (a component's resolved
     * TRANSITIVE-chunk preload URL, per `AdapterGenerateOptions.
     * preloadAssets`) -- mirrors `register_script` above exactly, including
     * its dedup-then-append shape and its reliance on a shared-by-reference
     * collector (`ArrayObject`, seeded by the host -- see e.g.
     * `integrations/php/index.php`'s `new_script_collector`) for
     * cross-component propagation, since plain PHP arrays are
     * copy-on-write VALUES, not references (see `register_script`'s own
     * class docblock note above this method's usage sites for the full
     * rationale). Kept as a SEPARATE `_preloads`/`_preload_seen` pair from
     * `_scripts`/`_script_seen` -- a preload URL and a script URL are never
     * the same concern, so there is no cross-dedup to do between the two.
     */
    public function register_preload(string $path): void
    {
        $seen = $this->_preload_seen();
        if (!empty($seen[$path])) {
            return;
        }
        $seen[$path] = true;
        $this->_preload_seen($seen);
        $preloads = $this->_preloads();
        $preloads[] = $path;
        $this->_preloads($preloads);
    }

    // -----------------------------------------------------------------
    // SSR Portal Collection (#3119)
    // -----------------------------------------------------------------

    /**
     * Register an already-rendered element (with `bf-po` stamped directly
     * on its own tag, matching what the client `createPortal(el,
     * document.body, { ownerScope })` stamps onto the SAME element at
     * hydrate time -- see `packages/client/src/runtime/portal.ts`) to be
     * output at the `bf.portals()` outlet instead of its original inline
     * position -- the compiler's `ref`-callback SSR-portal pattern
     * (`ssrPortalOwnerScope`, `isSsrPortalRefCallback` in `@barefootjs/jsx`),
     * the overlay/content pattern the dialog-style primitives use. Mirrors
     * `register_script`'s shared-by-reference-collector reliance (see that
     * method's docblock, and the host's `new_script_collector` /
     * `share_script_collector` in e.g. `integrations/php/index.php`) --
     * `_portal_elements` needs the SAME `ArrayObject` treatment the host
     * seeds for `_scripts` for cross-component propagation to actually
     * reach the root's `portals()` output.
     *
     * No dedup (unlike `register_script`): each call renders a distinct
     * element instance, never the same URL registered twice. Called from
     * the compiled template as `{{ $bf->register_portal_element(...) }}` /
     * `@php($bf->register_portal_element(...))` and always returns `''` so
     * it is safe wherever the caller echoes its result.
     */
    public function register_portal_element(string $html): string
    {
        $elements = $this->_portal_elements();
        $elements[] = $html;
        $this->_portal_elements($elements);
        return '';
    }

    /**
     * Renders every collected `ref`-callback SSR-portal element (#3119),
     * UNWRAPPED, in registration order. Place this near `</body>` in the
     * page's own layout -- mirrors the Hono reference adapter's
     * `<BfPortals />` (`packages/adapter-hono/src/portals.tsx`) and the
     * Go adapter's `{{.Portals.Render}}` (`packages/adapter-go-template/
     * runtime/bf.go`).
     */
    public function portals(): string
    {
        $out = [];
        foreach ($this->_portal_elements() as $html) {
            $out[] = $html;
        }
        return implode("\n", $out);
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
        // Record the keys this call passes for the child's `passed` while its
        // template renders. The renderer builds the child's own instance, so
        // the record rides on a stack rather than on that object; rendering
        // is synchronous, so its top is always the keys of the component
        // whose template is running.
        $keys = [];
        foreach (array_keys($props) as $k) {
            $keys[(string) $k] = true;
        }
        self::$callerKeys[] = $keys;
        try {
            return $renderer($mangled, $this);
        } finally {
            array_pop(self::$callerKeys);
        }
    }

    /**
     * Whether this component's caller passed the prop `$name`, even as
     * `null` or `undefined`: JS's `name in props`, which a template can't
     * ask of its variables (every declared prop is seeded, so an omitted one
     * reads as its default or `undefined`, as a present `undefined` one
     * does). A `{...props}` spread onto a child carries a param only when
     * this is true. The keys are those `render_child` recorded for a child
     * and `_props` for the root; with neither recorded (a root rendered
     * without `_props`), `$fallback`, the template's own "not undefined"
     * test, decides.
     */
    public function passed(string $name, $fallback = false): bool
    {
        if (self::$callerKeys !== []) {
            return isset(self::$callerKeys[count(self::$callerKeys) - 1][$name]);
        }
        $props = $this->_props();
        if (is_array($props)) {
            return array_key_exists($name, $props);
        }
        if ($props instanceof \stdClass) {
            return property_exists($props, $name);
        }
        return (bool) $fallback;
    }

    // -----------------------------------------------------------------
    // Bulk registration from build manifest
    // -----------------------------------------------------------------

    /**
     * `vite build` emits a manifest describing every component the page might
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
                $dataKey = array_key_exists('key', $props) ? $props['key'] : null;
                unset($props['key']);
                if (!Undefined::isNullish($dataKey)) {
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
                $childBf->_preloads($parent->_preloads());
                $childBf->_preload_seen($parent->_preload_seen());
                // (#3119) Same reference-sharing reasoning as scripts/preloads
                // above -- a portal-owning element nested several "use client"
                // boundaries deep (DialogContent inside Dialog inside the
                // page's own component) must reach the SAME collector the
                // root's `portals()` reads.
                $childBf->_portal_elements($parent->_portal_elements());

                $extra = [];
                if ($signalInit !== null) {
                    $extra = $signalInit($props);
                } elseif ($manifestDefaults !== null) {
                    $extra = self::deriveStashFromDefaults($manifestDefaults, $props, $parent->backend);
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
     * section. Each entry shape: `{value, propName, isRestProps}`. For
     * `isRestProps`, the rest bag passes through unchanged (or the static
     * `{}` if the caller didn't supply one). For ordinary entries the
     * caller's `$props[propName]` wins when present -- `null` (JS `null`)
     * included -- and an absent or `undefined` prop takes the static
     * `value`, or `undefined` when the entry has none (the manifest writes
     * `value` only for a prop with a default; spec/js-undefined-value.md,
     * decision 6). `propName`-less entries (signal / memo locals) always use
     * the static value.
     *
     * `$props` arrives ALREADY keyword-mangled -- `render_child` above (and
     * every generated child-renderer closure calling this method directly)
     * mangles every prop key via the engine's `Backend::ident()` before
     * handing the props array in -- but `$defaults`' own keys and each
     * entry's `propName` are the RAW (un-mangled) spellings `extractSsrDefaults`
     * emitted. `$backend`, when supplied, mangles both the output key and
     * the `propName` lookup through the SAME `ident()` the caller's props
     * were mangled with, so a reserved-word prop (Twig's `for`/`filter`,
     * Blade's `bf`, ...) resolves against the mangled `$props` map instead
     * of silently missing it and falling back to the static default even
     * when the caller DID supply a value (#2524 follow-up). `$backend` is
     * optional (defaults to no mangling) only because a caller with no
     * engine identity to mangle against -- none exist in this codebase
     * today, but the signature stays permissive for a hand-rolled caller
     * outside it -- has nothing meaningful to pass; every real caller
     * (production `register_components_from_manifest` below and the
     * Twig/Blade `test-render.ts` harnesses) has a `$backend` in scope and
     * MUST pass it.
     *
     * Public (not `private`): mirrors the Ruby port's
     * `derive_vars_from_defaults` (`packages/adapter-erb/lib/barefoot_js.rb`)
     * being deliberately public — `register_components_from_manifest` above
     * uses it for the `ui/*` registry path, but a caller composing a
     * template render by hand (e.g. this package's own conformance test
     * harnesses, `packages/adapter-blade` / `packages/adapter-twig`'s
     * `test-render.ts`, which register child renderers directly rather than
     * through a manifest) needs the exact same ssrDefaults-seeding logic,
     * not a hand-flattened re-derivation (#2157 lesson, restated at
     * `packages/adapter-erb/src/test-render.ts:276-287` — a harness-local
     * shortcut is exactly what let that class of bug hide). */
    public static function deriveStashFromDefaults($defaults, array $props, $backend = null): array
    {
        $ident = ($backend !== null) ? static fn(string $n): string => $backend->ident($n) : static fn(string $n): string => $n;
        $extra = [];
        foreach (self::toAssoc($defaults) as $name => $d) {
            $key = $ident((string) $name);
            $dArr = ($d instanceof \stdClass || is_array($d)) ? self::toAssoc($d) : null;
            if ($dArr === null) {
                $extra[$key] = Undefined::decode($d);
                continue;
            }
            if (!empty($dArr['isRestProps'])) {
                $extra[$key] = array_key_exists($key, $props) ? $props[$key] : self::staticFallback($dArr);
                continue;
            }
            $propName = $dArr['propName'] ?? null;
            $mangledPropName = $propName !== null ? $ident((string) $propName) : null;
            if ($mangledPropName !== null && array_key_exists($mangledPropName, $props) && !Undefined::isUndefined($props[$mangledPropName])) {
                $extra[$key] = $props[$mangledPropName];
            } else {
                $extra[$key] = self::staticFallback($dArr);
            }
        }
        return $extra;
    }

    /** An `ssrDefaults` entry's seed when the caller's prop is absent or
     * `undefined`: its `value` (a `{"$undef": true}` sentinel in it is
     * `undefined`, `Undefined::decode`), or `undefined` when it has none. */
    private static function staticFallback(array $d)
    {
        return array_key_exists('value', $d) ? Undefined::decode($d['value']) : Undefined::value();
    }

    // -----------------------------------------------------------------
    // Script Output
    // -----------------------------------------------------------------

    /**
     * Renders every collected `<link rel="modulepreload">` hint, THEN every
     * collected `<script type="module">` tag -- preloads always precede the
     * scripts they describe, or the hint is useless. Preloads carry no
     * execution-order constraint the way scripts do (they are just hints,
     * not code that runs), so registration order is emitted as-is.
     */
    public function scripts(): string
    {
        $tags = [];
        foreach ($this->_preloads() as $path) {
            $tags[] = '<link rel="modulepreload" crossorigin href="' . $path . '">';
        }
        foreach ($this->_scripts() as $path) {
            $tags[] = '<script type="module" src="' . $path . '"></script>';
        }
        return implode("\n", $tags);
    }

    // -----------------------------------------------------------------
    // JS-compat callees (#1189) -- invoked from generated Twig templates as
    // `{{ bf.json(val) }}`, `{{ bf.floor(val) }}`, etc.
    // -----------------------------------------------------------------

    /** JS `JSON.stringify`. A number is written as JS writes it
     * (`Evaluator::formatNumber`): an integral float has no `.0`, `-0` is
     * `0`, an exponent is unpadded (`-4e-8`, `-4e+21`), and NaN / Infinity
     * are `null`, at any depth (#3698, #3787). `json_encode` would write
     * `-4.0e-8` / `-0.0`. Lists and objects are walked here with sorted
     * keys, as the canonical encoder does; strings and other leaves go
     * through the backend's encoder.
     *
     * `null` is "null"; `undefined` gives no string at the top level -- the
     * result is `undefined` itself, which prints nothing and omits an
     * attribute -- an object member holding it is skipped, and an array
     * element holding it is written as `null`.
     *
     * @return string|Undefined
     */
    public function json($value)
    {
        if ($value instanceof Undefined) {
            return $value;
        }
        if (is_int($value) || is_float($value)) {
            $n = (float) $value;
            return (is_nan($n) || is_infinite($n)) ? 'null' : Evaluator::formatNumber($n);
        }
        if (is_array($value) && array_is_list($value)) {
            return '[' . implode(',', array_map(fn ($v) => $v instanceof Undefined ? 'null' : $this->json($v), $value)) . ']';
        }
        if (is_array($value) || $value instanceof \stdClass) {
            $vars = is_array($value) ? $value : get_object_vars($value);
            ksort($vars, SORT_STRING);
            $members = [];
            foreach ($vars as $k => $v) {
                if ($v instanceof Undefined) {
                    continue;
                }
                $members[] = $this->backend->encode_json((string) $k) . ':' . $this->json($v);
            }
            return '{' . implode(',', $members) . '}';
        }
        return $this->backend->encode_json($value);
    }

    /** JS `String(v)` mirror for a display sink: `null` and `undefined`
     * render as the empty string (not "null" / "undefined"), as JSX renders
     * them in a text or attribute position (documented divergence, matches
     * the Perl/Python ports). JS ToString itself is `to_string`.
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
        // Before the `\Stringable` pass-through: `Undefined` has a
        // `__toString()` too.
        if (Undefined::isNullish($value)) {
            return '';
        }
        if ($value instanceof \Stringable) {
            return $value;
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
            $parts = array_map(fn ($v) => Undefined::isNullish($v) ? '' : $this->string($v), $value);
            return implode(',', $parts);
        }
        return '[object Object]'; // stdClass or a non-list (assoc) array
    }

    /** JS `Number(v)` mirror for a display sink. Deliberate divergence
     * (matches the Perl/Python ports): `null`, `undefined` and
     * non-numeric/empty strings yield real NaN (not 0), so an unset prop /
     * parse failure can't silently zero downstream arithmetic. JS ToNumber
     * itself is `to_number`. */
    public function number($value): float
    {
        if (Undefined::isNullish($value)) {
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

    /**
     * The box for a value-position JS `l ?? r` (#3848 U6): the Blade adapter
     * spells it as `($bf->keep_nonnil(l ?? null) ?: [r])[0]`, so each operand
     * appears once. Only the two nils (`null`, `undefined`) are absent; `0`,
     * `''` and `false` are kept, as in JS. PHP's own `??` would keep
     * `undefined`.
     *
     * @return array<int, mixed>
     */
    public function keep_nonnil($value): array
    {
        return Undefined::isNullish($value) ? [] : [$value];
    }

    /**
     * JS `undefined` as a template spells it (`bf.undefined()` /
     * `$bf->undefined()`): the `undefined` identifier, an omitted method
     * argument's default, the result of a `?.` over a nullish receiver.
     */
    public function undefined(): Undefined
    {
        return Undefined::value();
    }

    /** JS `x === undefined` (spec/js-undefined-value.md, decision 7). */
    public function is_undefined($value): bool
    {
        return Undefined::isUndefined($value);
    }

    /** JS `x === null`: PHP's `null` only. */
    public function is_null($value): bool
    {
        return $value === null;
    }

    /** JS `x == null`: `null` or `undefined`. A template spells a loose nil
     * test, an attribute omission and a `??` through it; PHP's `??` /
     * `isset` / `=== null` see `undefined` as a value. */
    public function is_nullish($value): bool
    {
        return Undefined::isNullish($value);
    }

    /** JS `o?.k`: `undefined` over a nullish receiver, the read of `k`
     * (`index`) otherwise. */
    public function get_opt($target, $key)
    {
        return Undefined::isNullish($target) ? Undefined::value() : Evaluator::index($target, $key);
    }

    /** A loop source as PHP's `foreach` iterates it: `[]` for `null` and
     * `undefined` (an object, which `foreach` would walk as its
     * properties), the value itself otherwise. */
    public function iterable($value)
    {
        return Undefined::isNullish($value) ? [] : $value;
    }

    /**
     * Boxes for a value-position JS `l || r` / `l && r` (#3824): the Blade
     * adapter spells `l || r` as `(keep_truthy(l) ?: [r])[0]` and
     * `l && r` as `(keep_falsy(l) ?: [r])[0]`. `keepTruthy` is the
     * one-element array `[$value]` when `$value` is JS-truthy and `[]`
     * otherwise (`keepFalsy` the reverse), so PHP's `?:` stops at the box
     * exactly when JS returns `$value` itself and builds `[r]` only
     * otherwise (the short circuit); `[0]` unboxes the operand. Each operand
     * appears once, so a chain grows linearly.
     *
     * @return array<int, mixed>
     */
    public function keep_truthy($value): array
    {
        return Evaluator::truthy($value) ? [$value] : [];
    }

    /** @return array<int, mixed> */
    public function keep_falsy($value): array
    {
        return Evaluator::truthy($value) ? [] : [$value];
    }

    /** JS binary `-` / `*` over operands Phase 1 does not prove numbers
     * (#3848 U6): each operand goes through JS ToNumber (`null` is 0,
     * `undefined` NaN, a string its JS numeric value), where PHP's own
     * operator throws on an object (`Undefined`) and a non-numeric string.
     * Two int operands keep PHP's exact int arithmetic, as `div` does. */
    public function sub($a, $b): int|float
    {
        if (is_int($a) && is_int($b)) {
            return $a - $b;
        }
        return Evaluator::toNumber($a) - Evaluator::toNumber($b);
    }

    public function mul($a, $b): int|float
    {
        if (is_int($a) && is_int($b)) {
            return $a * $b;
        }
        return Evaluator::toNumber($a) * Evaluator::toNumber($b);
    }

    /** JS `/` (#3474): IEEE division. The quotient keeps its fraction, and
     * a zero divisor gives `NaN` or an infinity signed by both operands
     * (`1 / -0` is `-Infinity`), where PHP's `/` throws `DivisionByZeroError`.
     * Two int operands and a non-zero divisor keep PHP's own `/`, whose
     * exact quotient stays an int and so still indexes a list. Each operand
     * goes through JS ToNumber: `null` is `0`, `undefined` NaN. */
    public function div($a, $b): int|float
    {
        if (is_int($a) && is_int($b) && $b !== 0) {
            return $a / $b;
        }
        return fdiv(Evaluator::toNumber($a), Evaluator::toNumber($b));
    }

    /** JS `%`: remainder with the dividend's sign. PHP's `fmod` already
     * implements C-style fmod semantics matching JS `%` for every case
     * (zero divisor, infinite/NaN operands all yield NaN natively).
     *
     * A zero remainder of two int operands is the int `0` when the
     * dividend is not negative. A negative dividend keeps `fmod`'s float
     * `-0.0`: JS gives `-4 % 2` as `-0`, so `1 / (-4 % 2)` is `-Infinity`.
     * It still prints `"0"`, compares equal to `0`, and indexes a list as
     * `0` through the runtime's `index`.
     *
     * Each operand goes through JS ToNumber, as with `div`: `null % 2` is
     * `0`, `undefined % 2` NaN. */
    public function mod($a, $b): int|float
    {
        $r = fmod(Evaluator::toNumber($a), Evaluator::toNumber($b));
        return $r === 0.0 && is_int($a) && is_int($b) && $a >= 0 ? 0 : $r;
    }

    /** JS `target[key]`: a single-level read of the target's own key or
     * element, `undefined` on a miss. Delegates to `Evaluator::index()`, the
     * one implementation the callback evaluator's index read shares, so a
     * template read and the same read inside a callback give the same
     * answer. */
    public function index($target, $key)
    {
        return Evaluator::index($target, $key);
    }

    public function floor($value): float
    {
        $n = Evaluator::toNumber($value);
        return (is_nan($n) || is_infinite($n)) ? $n : floor($n);
    }

    public function ceil($value): float
    {
        $n = Evaluator::toNumber($value);
        return (is_nan($n) || is_infinite($n)) ? $n : ceil($n);
    }

    /** JS `Math.round` rounds half toward +Infinity (`Math.round(-1.5)` is
     * -1, not -2). `floor(n + 0.5)` reproduces that for both signs. */
    public function round($value): float
    {
        $n = Evaluator::toNumber($value);
        return (is_nan($n) || is_infinite($n)) ? $n : floor($n + 0.5);
    }

    /** `Math.min(a, b)` / `Math.max(a, b)` -- two-arg forms only (#2168
     * math-methods). JS returns NaN if either operand is NaN. The `Math`
     * helpers coerce through JS ToNumber (`null` is 0, `undefined` NaN), as
     * `Math.floor(null)` is 0. */
    public function min($a, $b): float
    {
        $x = Evaluator::toNumber($a);
        $y = Evaluator::toNumber($b);
        if (is_nan($x)) return $x;
        if (is_nan($y)) return $y;
        return $x < $y ? $x : $y;
    }

    public function max($a, $b): float
    {
        $x = Evaluator::toNumber($a);
        $y = Evaluator::toNumber($b);
        if (is_nan($x)) return $x;
        if (is_nan($y)) return $y;
        return $x > $y ? $x : $y;
    }

    /** `Math.abs()` (#2168 math-methods). */
    public function abs($value): float
    {
        $n = Evaluator::toNumber($value);
        return is_nan($n) ? $n : abs($n);
    }

    /**
     * `date($recv, $op)` -- zero-arg `Date.prototype` method lowering
     * (#2274, spec entry "date"). `$recv` arrives as either this runtime's
     * own `\DateTimeInterface` or an ISO-8601 string (a template prop may
     * carry either depending on how the host populated it); both normalize
     * to a UTC `DateTimeImmutable` before dispatch. PHP's month accessor
     * (`n`) is 1-based; only `getUTCMonth` subtracts 1 to match JS's
     * 0-based month. `getTime` sums whole milliseconds from
     * `getTimestamp()` (whole seconds) and `format('v')` -- the ALWAYS
     * non-negative 0-999 sub-second remainder PHP's `DateTime` already
     * normalizes, even for a pre-epoch instant -- rather than
     * `format('Uv')`, which string-CONCATENATES `U` and `v` and produces a
     * garbage value for a negative timestamp (verified against a live PHP
     * 8.4 interpreter: `(new DateTimeImmutable('1969-07-20T20:17:40.123Z'))
     * ->format('Uv')` is `"-14182940123"`, not the correct `-14182939877`).
     */
    public function date($recv, string $op)
    {
        // A nil or unparseable receiver degrades to the zero value the
        // Go / Rust / Perl helpers document (empty string for toISOString,
        // 0 otherwise). Without this an empty string would silently become
        // `new DateTimeImmutable('')` = the current time (non-deterministic
        // render), and a malformed string would throw mid-render.
        if ($recv instanceof \DateTimeInterface) {
            $d = \DateTimeImmutable::createFromInterface($recv);
        } else {
            $s = $this->string($recv);
            if ($s === '') {
                return $op === 'toISOString' ? '' : 0;
            }
            try {
                $d = new \DateTimeImmutable($s);
            } catch (\Throwable $e) {
                // \Throwable, not \Exception: a malformed string throws
                // DateMalformedStringException (an Exception), but under
                // Xdebug the exception's dynamic-property enrichment raises
                // a bare Error (not an Exception) on PHP >= 8.2 — degrade
                // on any Throwable so the render survives either way.
                return $op === 'toISOString' ? '' : 0;
            }
        }
        $d = $d->setTimezone(new \DateTimeZone('UTC'));
        switch ($op) {
            case 'getUTCFullYear': return (int) $d->format('Y');
            case 'getUTCMonth': return (int) $d->format('n') - 1;
            case 'getUTCDate': return (int) $d->format('j');
            case 'getUTCHours': return (int) $d->format('H');
            case 'getUTCMinutes': return (int) $d->format('i');
            case 'getUTCSeconds': return (int) $d->format('s');
            case 'getTime': return ($d->getTimestamp() * 1000) + (int) $d->format('v');
            case 'toISOString': return $d->format('Y-m-d\TH:i:s.v\Z');
            default: return 0;
        }
    }

    /**
     * `format_date($recv, $pattern, $tz, $names = [])` -- pure-function date
     * formatter (#2324 numeric tokens, #2334 name tokens, spec entry
     * "format_date"), mirroring packages/client/src/format-date.ts
     * byte-for-byte. `$recv` shares `date()`'s receiver contract above
     * (native `\DateTimeInterface` or an ISO-8601 string; a nil or
     * unparseable receiver degrades to `''`, never throws). From there it's
     * pure arithmetic, deliberately NOT PHP's timezone database: shift the
     * epoch-ms instant by the offset, then read the shifted instant's own
     * UTC calendar fields -- the shifted UTC clock face IS the local clock
     * face at that offset. No locale, no host TZ, no time().
     *
     * `$tz` (#2344) is 'UTC', a range-valid fixed offset `±HH:MM` (hours
     * 00-23, minutes 00-59), or a canonical IANA zone name ('Asia/Tokyo')
     * resolved through PHP's timezone database -- the zone's UTC offset AT
     * THE INSTANT being formatted (DST-aware, historical-transition-aware,
     * seconds precision: pre-standard LMT offsets like Tokyo's +09:18:59
     * count). An unresolvable `$tz` THROWS InvalidArgumentException,
     * aborting the render loudly: the JS reference throws a RangeError
     * there, and a silently substituted timezone is the one failure mode
     * this helper must not have (the pre-#2344 normalize-to-UTC total
     * function is gone). PHP's tz layer accepts a superset of the
     * canonical IDs (case-folded spellings, some offset strings) -- the JS
     * reference throws on those, so behavior there is unspecified by the
     * spec and PHP's native acceptance is fine.
     *
     * The epoch-ms -> seconds step floor-divides (rounds toward negative
     * infinity), NOT `intdiv`'s truncate-toward-zero, so a pre-1970 instant
     * lands on the correct calendar day after shifting; PHP's `@<seconds>`
     * DateTimeImmutable constructor is always UTC, so no further
     * setTimezone() is needed to read the shifted fields. That same
     * `@<seconds>` instant's `format('w')` gives 0-6 with 0 = Sunday
     * directly -- matching JS `getUTCDay()` and this doc's Sunday-first
     * table layout -- with no further remapping.
     *
     * `$names` (#2334) is the caller-owned flat name table this function
     * never derives from locale/ICU data: `[0..11]` wide month names,
     * `[12..23]` abbreviated month names, `[24..30]` wide weekday names
     * (Sunday-first), `[31..37]` abbreviated weekday names. A name token
     * indexing a missing/short table renders `''`, same zero-value
     * discipline as an unparseable date.
     *
     * Token substitution is `YYYY|MMMM|MMM|MM|DD|dddd|ddd|M|D` (longest-match
     * alternation order, `preg_replace_callback`, mirroring the JS
     * reference's `TOKEN_RE`); every other byte -- including multi-byte
     * UTF-8 like `年`/`月`/`日` or table values like `月曜日` -- passes
     * through literally (no `/u` modifier needed: every token is ASCII, so
     * a multi-byte UTF-8 sequence can never match the token alternation and
     * always survives untouched).
     */
    public function format_date($recv, string $pattern, string $tz, array $names = []): string
    {
        if ($recv instanceof \DateTimeInterface) {
            $d = \DateTimeImmutable::createFromInterface($recv);
        } else {
            $s = $this->string($recv);
            if ($s === '') {
                return '';
            }
            try {
                $d = new \DateTimeImmutable($s);
            } catch (\Throwable $e) {
                // \Throwable, not \Exception -- see date()'s matching catch
                // above for why (Xdebug's dynamic-property enrichment can
                // raise a bare Error on PHP >= 8.2).
                return '';
            }
        }
        $d = $d->setTimezone(new \DateTimeZone('UTC'));
        $epochMs = ($d->getTimestamp() * 1000) + (int) $d->format('v');

        $m = [];
        $offsetSeconds = 0;
        if ($tz !== 'UTC') {
            if (preg_match('/^([+-])([01]\d|2[0-3]):([0-5]\d)$/', $tz, $m)) {
                $offsetSeconds = ($m[1] === '-' ? -1 : 1) * ((int) $m[2] * 3600 + (int) $m[3] * 60);
            } else {
                // #2344: canonical IANA zone via PHP's own tzdata; anything
                // it can't resolve throws -- loud, never a silent UTC.
                try {
                    $zone = new \DateTimeZone($tz);
                } catch (\Throwable $e) {
                    throw new \InvalidArgumentException(
                        sprintf('format_date: unresolvable timeZone "%s"', $tz)
                    );
                }
                $offsetSeconds = $zone->getOffset($d);
            }
        }
        $shiftedMs = $epochMs + $offsetSeconds * 1000;

        $shiftedSeconds = intdiv($shiftedMs, 1000);
        if ($shiftedMs % 1000 !== 0 && $shiftedMs < 0) {
            $shiftedSeconds--; // floor, not truncate, for a negative shifted instant
        }
        $shifted = new \DateTimeImmutable('@' . $shiftedSeconds);

        $year = (int) $shifted->format('Y');
        $yyyy = ($year < 0 ? '-' : '') . str_pad((string) abs($year), 4, '0', STR_PAD_LEFT);
        $month = (int) $shifted->format('n');
        $day = (int) $shifted->format('j');
        $weekday = (int) $shifted->format('w'); // 0 = Sunday, matching the table's Sunday-first layout

        // `$names`-table section offsets (spec/template-helpers.md
        // "format_date"), mirroring the JS reference's MONTHS_WIDE /
        // MONTHS_ABBR / WEEKDAYS_WIDE / WEEKDAYS_ABBR constants (#2334).
        $nameAt = static fn (int $index): string => $names[$index] ?? '';

        return preg_replace_callback('/YYYY|MMMM|MMM|MM|DD|dddd|ddd|M|D/', function ($matches) use ($yyyy, $month, $day, $weekday, $nameAt) {
            switch ($matches[0]) {
                case 'YYYY': return $yyyy;
                case 'MMMM': return $nameAt($month - 1);
                case 'MMM': return $nameAt(12 + $month - 1);
                case 'MM': return str_pad((string) $month, 2, '0', STR_PAD_LEFT);
                case 'DD': return str_pad((string) $day, 2, '0', STR_PAD_LEFT);
                case 'dddd': return $nameAt(24 + $weekday);
                case 'ddd': return $nameAt(31 + $weekday);
                case 'M': return (string) $month;
                case 'D': return (string) $day;
                default: return $matches[0];
            }
        }, $pattern);
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

    /** A row field's value: JS `item.key`, `undefined` when the row has no
     * such field (or is no object). */
    private function getField($el, string $key)
    {
        if ($el instanceof \stdClass) {
            return property_exists($el, $key) ? $el->$key : Undefined::value();
        }
        if (is_array($el) && !Evaluator::isJsArray($el)) {
            return array_key_exists($key, $el) ? $el[$key] : Undefined::value();
        }
        return Undefined::value();
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
        // The needle is JS ToString'd (`"anullb".includes(null)` is true).
        return str_contains($this->scalarOrEmpty($recv), Evaluator::toStringJs($elem));
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

    /** `find` / `find_last` return the matching element, or JS `undefined`. */
    public function find($recv, callable $pred)
    {
        if (!Evaluator::isJsArray($recv)) {
            return Undefined::value();
        }
        foreach ($recv as $item) {
            if ($pred($item)) {
                return $item;
            }
        }
        return Undefined::value();
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
            return Undefined::value();
        }
        $arr = array_values($recv);
        for ($i = count($arr) - 1; $i >= 0; $i--) {
            if ($pred($arr[$i])) {
                return $arr[$i];
            }
        }
        return Undefined::value();
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
        return mb_strtolower((string) $this->string($s), 'UTF-8');
    }

    public function uc($s): string
    {
        return mb_strtoupper((string) $this->string($s), 'UTF-8');
    }

    /** `Array.prototype.join(sep)` -- an omitted or `undefined` separator is
     * ",", any other one is ToString'd (`null` joins with "null"); undefined/
     * null elements render as empty. */
    public function join($recv, $sep = null): string
    {
        if (!Evaluator::isJsArray($recv)) {
            return '';
        }
        $sepStr = self::omitted(func_num_args(), 1, $sep) ? ',' : Evaluator::toStringJs($sep);
        $parts = array_map(fn ($x) => Undefined::isNullish($x) ? '' : $this->string($x), $recv);
        return implode($sepStr, $parts);
    }

    /** Whether the optional argument at `$position` (0-based, counting the
     * receiver) was left out: the call passed fewer arguments, or passed JS
     * `undefined`, which JS reads as an omitted argument. An explicit `null`
     * is JS `null`, which each helper coerces like any other value
     * (`[1, 2].slice(0, null)` is `[]`). */
    private static function omitted(int $argc, int $position, $value): bool
    {
        return $argc <= $position || $value instanceof Undefined;
    }

    /** `.length` -- JS works on both arrays (element count) and strings.
     * The string branch counts UTF-16 CODE UNITS, matching JS
     * `String.prototype.length` (#2255) -- NOT `mb_strlen`'s Unicode
     * codepoint count. A codepoint outside the Basic Multilingual Plane
     * (astral, U+10000-U+10FFFF -- e.g. '👍') is a surrogate PAIR in
     * UTF-16, so it counts as 2, not 1; '日本語' is 3 either way
     * (BMP-only). An object's `.length` is its own `length` property
     * (`{ length: 3 }`), `undefined` when it has none (#3449). */
    public function length($recv)
    {
        if (Evaluator::isJsArray($recv)) {
            return count($recv);
        }
        if (is_array($recv) || $recv instanceof \stdClass) {
            return Evaluator::index($recv, 'length');
        }
        $s = $this->scalarOrEmpty($recv);
        $n = 0;
        foreach (mb_str_split($s, 1, 'UTF-8') as $char) {
            $n += mb_ord($char, 'UTF-8') > 0xFFFF ? 2 : 1;
        }
        return $n;
    }

    /** True for a JS *object* value under the canonical value convention
     * (`Evaluator::isJsArray`'s docstring): a `stdClass` (the live
     * representation for a `json_decode()`-sourced object prop) or a
     * non-list PHP array (a compiler-baked object literal, `toPhpLiteral`'s
     * `stdClass`-cast form notwithstanding -- defensive, in case a bare
     * assoc array ever reaches here directly). */
    private function isJsObject($recv): bool
    {
        return $recv instanceof \stdClass || (is_array($recv) && !Evaluator::isJsArray($recv));
    }

    /**
     * `isValidElement(x)` -- the framework "is this a renderable element
     * (not plain text)?" predicate `Slot`'s `asChild` pattern uses (#2266,
     * #3012). Mirrors JS's `'tag' in x && 'props' in x`: true only for a
     * JS *object* value (see `isJsObject` above) carrying both keys
     * (case-insensitively, matching the case-tolerant key lookups
     * elsewhere in this runtime, and the Perl / Go / Ruby / Python / Rust
     * ports' own `is_element`/`IsValidElement`). A passed-through JSX
     * child is represented as pre-rendered markup (a plain string) on this
     * SSR model, so a non-empty STRING child is NOT a valid element --
     * routing `isValidElement` through bare truthiness here would wrongly
     * take the element-merge branch. Shared by both Twig and Blade (this
     * runtime backs both backends).
     */
    public function is_element($v): bool
    {
        if (!$this->isJsObject($v)) {
            return false;
        }
        $keys = $v instanceof \stdClass ? array_keys(get_object_vars($v)) : array_keys($v);
        $hasTag = false;
        $hasProps = false;
        foreach ($keys as $key) {
            $lower = strtolower((string) $key);
            if ($lower === 'tag') {
                $hasTag = true;
            }
            if ($lower === 'props') {
                $hasProps = true;
            }
        }
        return $hasTag && $hasProps;
    }

    /**
     * `Object.entries(x)` (#2168 object-entries-map) -- returns a PHP assoc
     * array (`key => value`) so the generated Twig/Blade `for`/`@foreach`
     * unpacks key + value directly via the language's own 2-variable
     * iteration form. `(array)` on a `stdClass` (or a bare assoc array)
     * preserves the object's OWN declaration/insertion order -- a PHP
     * array's iteration order IS its insertion order by language
     * guarantee, unlike e.g. a Go `map[string]T` or a Perl hash, which
     * have no such guarantee (see `IRLoop.objectIteration`'s docstring,
     * `packages/jsx/src/types.ts`, for why those adapters take a
     * different, sorted-order approach instead).
     */
    public function entries($recv): array
    {
        return $this->isJsObject($recv) ? (array) $recv : [];
    }

    /** `Object.keys(x)` -- see `entries()`. */
    public function keys($recv): array
    {
        return $this->isJsObject($recv) ? array_keys((array) $recv) : [];
    }

    /** `Object.values(x)` -- see `entries()`. */
    public function values($recv): array
    {
        return $this->isJsObject($recv) ? array_values((array) $recv) : [];
    }

    /**
     * Shallow-merge any number of JS objects, later arguments winning on a
     * shared key -- an object-literal SPREAD's direct-value-position
     * lowering (`{ ...t, editing: false }`, #2696 Step 2), shared between
     * the Blade (`$bf->merge(...)`) and Twig (`bf.merge(...)`) emitters.
     *
     * NOT PHP's own `array_merge()` / Twig's `merge` filter directly: a
     * `json_decode()`-sourced object prop decodes as `stdClass` (this
     * runtime's canonical JSON-object representation, `isJsObject()`'s
     * docstring), and neither `array_merge()` nor Twig's `merge` filter
     * accepts a `stdClass` operand -- `array_merge(stdClass, ...)` is a
     * PHP `TypeError`, and Twig's filter raises `The "merge" filter
     * expects a sequence or a mapping`. Routing through `isJsObject()` +
     * `(array)` (the SAME normalisation `entries()`/`keys()`/`values()`
     * already use) accepts either representation uniformly. A non-object
     * argument (including a JS null/undefined spread source) is SKIPPED
     * rather than raising -- matching every other backend evaluator's
     * null/undefined-spread-is-a-no-op semantics.
     */
    public function merge(...$args): array
    {
        $out = [];
        foreach ($args as $v) {
            if ($this->isJsObject($v)) {
                $out = array_merge($out, (array) $v);
            }
        }
        return $out;
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

    /**
     * `$s` as JS sees it: a list of UTF-16 code units. JS string positions
     * (`indexOf`, `at`, `startsWith`'s position, ...) count these, so an
     * astral character such as '😀' is two units (#3613).
     *
     * @return list<int>
     */
    private static function utf16Units(string $s): array
    {
        if ($s === '') {
            return [];
        }
        return array_values(unpack('v*', mb_convert_encoding($s, 'UTF-16LE', 'UTF-8')));
    }

    /**
     * JS `ToIntegerOrInfinity` for a string position or index (#3613): NaN
     * -> 0, truncation toward zero, and +/-Infinity clamped to +/-2**53 so
     * the caller's range check treats it as out of range (a bare `(int)`
     * cast turns Infinity into 0).
     */
    private function toIntegerOrInfinity($value): int
    {
        $n = Evaluator::toNumber($value);
        if (is_nan($n)) {
            return 0;
        }
        if ($n >= 9007199254740992) {
            return 9007199254740992;
        }
        if ($n <= -9007199254740992) {
            return -9007199254740992;
        }
        return (int) $n;
    }

    /** Whether `$needle` occurs in `$hay` (unit lists) at unit offset `$at`. */
    private static function utf16HasAt(array $hay, array $needle, int $at): bool
    {
        $n = count($needle);
        if ($at < 0 || $at + $n > count($hay)) {
            return false;
        }
        return array_slice($hay, $at, $n) === $needle;
    }

    private function utf16IndexOf(string $recv, $elem, bool $reverse): int
    {
        $hay = self::utf16Units($recv);
        // The needle is JS ToString'd (`'anullb'.indexOf(null)` is 1).
        $needle = self::utf16Units(Evaluator::toStringJs($elem));
        $last = count($hay) - count($needle);
        if ($last < 0) {
            return -1;
        }
        $indices = $reverse ? range($last, 0) : range(0, $last);
        foreach ($indices as $i) {
            if (self::utf16HasAt($hay, $needle, $i)) {
                return $i;
            }
        }
        return -1;
    }

    /**
     * `Array.prototype.indexOf(x)`; a string receiver is
     * `String.prototype.indexOf`, counted in UTF-16 code units like JS
     * (#3613).
     */
    public function index_of($recv, $elem): int
    {
        if (is_string($recv)) {
            return $this->utf16IndexOf($recv, $elem, false);
        }
        return $this->arrayIndexOf($recv, $elem, false);
    }

    public function last_index_of($recv, $elem): int
    {
        if (is_string($recv)) {
            return $this->utf16IndexOf($recv, $elem, true);
        }
        return $this->arrayIndexOf($recv, $elem, true);
    }

    /**
     * `Array.prototype.at(i)` -- supports negative indices. A string
     * receiver is indexed in UTF-16 code units (#3613). Half of a
     * surrogate pair, a lone surrogate in JS, comes back as U+FFFD: a
     * UTF-8 PHP string can't hold one, so the halves compare equal and
     * don't rejoin (limitation `string-at-lone-surrogate`). The index is
     * ToIntegerOrInfinity'd, so an omitted, `undefined` or `null` one reads
     * element 0; a miss is JS `undefined`.
     */
    public function at($recv, $i = null)
    {
        if (func_num_args() < 2) {
            $i = Undefined::value();
        }
        if (is_string($recv)) {
            $units = self::utf16Units($recv);
            $idx = $this->relativeIndex($i, count($units));
            if ($idx === null) {
                return Undefined::value();
            }
            $u = $units[$idx];
            return ($u >= 0xD800 && $u <= 0xDFFF) ? "\u{FFFD}" : mb_chr($u, 'UTF-8');
        }
        if (!Evaluator::isJsArray($recv)) {
            return Undefined::value();
        }
        $idx = $this->relativeIndex($i, count($recv));
        return $idx === null ? Undefined::value() : $recv[$idx];
    }

    /** `Array.prototype.at`'s index: ToIntegerOrInfinity, counted from the
     * end when negative; `null` when it falls outside `[0, length)`. */
    private function relativeIndex($value, int $len): ?int
    {
        $idx = $this->toIntegerOrInfinity($value);
        if ($idx < 0) {
            $idx += $len;
        }
        return ($idx >= 0 && $idx < $len) ? $idx : null;
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

    /** `Array.prototype.slice(start, end?)` AND `String.prototype.slice`
     * (the `string-slice` divergence) -- the adapter emits the same
     * `slice(recv, start, end)` call for both receiver shapes (it can't
     * disambiguate string vs. array at compile time), so this dispatches
     * on the receiver's PHP type, mirroring `includes` above. String
     * length/positions use `mb_strlen`/`mb_substr` (UTF-8 code points,
     * not bytes), matching this runtime's other string helpers. Both
     * bounds are ToIntegerOrInfinity'd; an omitted or `undefined` start is
     * 0 and end "to the length", a `null` one is 0. */
    public function slice($recv, $start = null, $end = null)
    {
        $argc = func_num_args();
        $start = self::omitted($argc, 1, $start) ? 0 : $this->toIntegerOrInfinity($start);
        $end = self::omitted($argc, 2, $end) ? null : $this->toIntegerOrInfinity($end);
        if (is_string($recv)) {
            $len = mb_strlen($recv, 'UTF-8');
            [$s, $e] = $this->clampSliceRange($len, $start, $end);
            if ($s >= $e) {
                return '';
            }
            return mb_substr($recv, (int) $s, (int) ($e - $s), 'UTF-8');
        }
        if (!Evaluator::isJsArray($recv)) {
            return [];
        }
        $arr = array_values($recv);
        $len = count($arr);
        if ($len === 0) {
            return [];
        }
        [$s, $e] = $this->clampSliceRange($len, $start, $end);
        if ($s >= $e) {
            return [];
        }
        return array_slice($arr, (int) $s, (int) ($e - $s));
    }

    /** Shared bounds arithmetic for both `slice` branches above: `$start`
     * an integer, `$end` an integer or `null` for "to the length". */
    private function clampSliceRange(int $len, int $start, ?int $end): array
    {
        $s = $start;
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
        return [$s, $e];
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
        // An `undefined` depth is the default, 1; `null` coerces to 0.
        if ($depth instanceof Undefined) {
            return $this->flat($recv, 1);
        }
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
        if (Undefined::isNullish($recv) || is_array($recv) || $recv instanceof \stdClass) {
            return '';
        }
        return (string) preg_replace('/^\s+|\s+$/u', '', $this->string($recv));
    }

    /** `String.prototype.trimStart()` / `.trimEnd()` -- the one-sided
     * siblings of `trim` above (#2183 follow-up), same `\s` /u regex
     * restricted to one side. */
    public function trim_start($recv): string
    {
        if (Undefined::isNullish($recv) || is_array($recv) || $recv instanceof \stdClass) {
            return '';
        }
        return (string) preg_replace('/^\s+/u', '', $this->string($recv));
    }

    public function trim_end($recv): string
    {
        if (Undefined::isNullish($recv) || is_array($recv) || $recv instanceof \stdClass) {
            return '';
        }
        return (string) preg_replace('/\s+$/u', '', $this->string($recv));
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
        // An omitted or `undefined` digit count is 0, as ToIntegerOrInfinity
        // makes `null` too.
        $digits = self::omitted(func_num_args(), 1, $digits) ? 0 : $this->toIntegerOrInfinity($digits);
        if ($digits < 0) {
            $digits = 0;
        }
        $factor = 10 ** $digits;
        $rounded = floor($n * $factor + 0.5);
        return sprintf('%.' . $digits . 'f', $rounded / $factor);
    }

    /** `String.prototype.split(sep)`. An empty separator splits into
     * individual (UTF-8) characters; an omitted or `undefined` separator ->
     * single-element array, any other one is ToString'd (`null` splits on
     * "null"); empty receiver with a non-empty separator -> `['']`. An
     * omitted or `undefined` limit is unbounded, any other one ToUint32'd
     * (`null` and NaN are 0 -> empty; a negative limit wraps to a large one). */
    public function split($recv, $sep = null, $limit = null): array
    {
        $argc = func_num_args();
        $s = $this->scalarOrEmpty($recv);
        $sepStr = self::omitted($argc, 1, $sep) ? null : Evaluator::toStringJs($sep);
        if ($sepStr === null) {
            $parts = [$s];
        } elseif ($sepStr === '') {
            $parts = $s === '' ? [] : preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY);
        } elseif ($s === '') {
            $parts = [''];
        } else {
            $parts = explode($sepStr, $s);
        }
        if (!self::omitted($argc, 2, $limit)) {
            $n = self::toUint32($limit);
            if ($n < count($parts)) {
                $parts = array_slice($parts, 0, (int) $n);
            }
        }
        return $parts;
    }

    /** JS `ToUint32` (`split`'s limit): NaN and the infinities are 0. */
    private static function toUint32($value): float
    {
        $n = Evaluator::toNumber($value);
        if (is_nan($n) || is_infinite($n)) {
            return 0.0;
        }
        $t = fmod($n < 0 ? ceil($n) : floor($n), 4294967296.0);
        return $t < 0 ? $t + 4294967296.0 : $t;
    }

    /** The prefix is JS ToString'd; an omitted or `undefined` position is 0,
     * and `null` is 0 too. */
    public function starts_with($recv, $prefix, $position = null): bool
    {
        $s = $this->scalarOrEmpty($recv);
        $p = Evaluator::toStringJs($prefix);
        if (!self::omitted(func_num_args(), 2, $position)) {
            // `position` counts UTF-16 code units, like JS (#3613).
            $units = self::utf16Units($s);
            $n = max(0, min($this->toIntegerOrInfinity($position), count($units)));
            return self::utf16HasAt($units, self::utf16Units($p), $n);
        }
        return str_starts_with($s, $p);
    }

    /** The suffix is JS ToString'd; an omitted or `undefined` endPosition is
     * the length, a `null` one 0. */
    public function ends_with($recv, $suffix, $endPosition = null): bool
    {
        $s = $this->scalarOrEmpty($recv);
        $x = Evaluator::toStringJs($suffix);
        if (!self::omitted(func_num_args(), 2, $endPosition)) {
            // `endPosition` counts UTF-16 code units, like JS (#3613).
            $units = self::utf16Units($s);
            $needle = self::utf16Units($x);
            $e = max(0, min($this->toIntegerOrInfinity($endPosition), count($units)));
            return self::utf16HasAt($units, $needle, $e - count($needle));
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
        // The pattern and the replacement are JS ToString'd.
        $s = $this->scalarOrEmpty($recv);
        $o = Evaluator::toStringJs($pattern);
        $n = Evaluator::toStringJs($replacement);
        if ($o === '') {
            return $n . $s;
        }
        $i = strpos($s, $o);
        if ($i === false) {
            return $s;
        }
        return substr($s, 0, $i) . $n . substr($s, $i + strlen($o));
    }

    /** `String.prototype.replaceAll(pattern, replacement)` -- string-pattern
     * form only (#2182), replacing EVERY occurrence (the all-occurrences
     * sibling of `replace` above). A non-empty pattern uses PHP's own
     * `str_replace`, which is global-by-default and treats both the pattern
     * and the replacement literally (no backreference interpolation) --
     * matching JS. PHP's `str_replace("", ...)` is a no-op, unlike JS,
     * which inserts the replacement at every boundary (including before
     * the first and after the last character,
     * `"abc".replaceAll("", "X")` -> "XaXbXcX") -- so the empty pattern is
     * special-cased with `mb_str_split` (UTF-8 code points, matching this
     * runtime's other string helpers). */
    public function replace_all($recv, $pattern, $replacement): string
    {
        // The pattern and the replacement are JS ToString'd.
        $s = $this->scalarOrEmpty($recv);
        $o = Evaluator::toStringJs($pattern);
        $n = Evaluator::toStringJs($replacement);
        if ($o === '') {
            $chars = $s === '' ? [] : mb_str_split($s, 1, 'UTF-8');
            return implode($n, array_merge([''], $chars, ['']));
        }
        return str_replace($o, $n, $s);
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

    /** ToIntegerOrInfinity: an omitted, `undefined` or `null` count is 0. */
    public function repeat($recv, $count = null): string
    {
        $s = $this->scalarOrEmpty($recv);
        $n = $this->toIntegerOrInfinity(func_num_args() < 2 ? Undefined::value() : $count);
        return $n > 0 ? str_repeat($s, $n) : '';
    }

    /** Pad `$s` to `$target` (UTF-8) characters with `$pad` repeated and
     * truncated to fill. An omitted or `undefined` pad string is a single
     * space; any other one is ToString'd (`null` pads with "null"). The
     * target is ToIntegerOrInfinity'd. */
    private function pad(string $s, $target, $pad, bool $atStart): string
    {
        $p = $pad instanceof Undefined ? ' ' : Evaluator::toStringJs($pad);
        if ($p === '') {
            return $s;
        }
        $len = mb_strlen($s, 'UTF-8');
        $t = $this->toIntegerOrInfinity($target);
        if ($len >= $t) {
            return $s;
        }
        $need = $t - $len;
        $plen = mb_strlen($p, 'UTF-8');
        $reps = intdiv($need, $plen) + 1;
        $fill = mb_substr(str_repeat($p, $reps), 0, $need, 'UTF-8');
        return $atStart ? $fill . $s : $s . $fill;
    }

    public function pad_start($recv, $target = null, $pad = null): string
    {
        [$target, $pad] = self::padArgs(func_num_args(), $target, $pad);
        return $this->pad($this->scalarOrEmpty($recv), $target, $pad, true);
    }

    public function pad_end($recv, $target = null, $pad = null): string
    {
        [$target, $pad] = self::padArgs(func_num_args(), $target, $pad);
        return $this->pad($this->scalarOrEmpty($recv), $target, $pad, false);
    }

    /** `padStart` / `padEnd`'s arguments with every omitted one read as JS
     * `undefined`. */
    private static function padArgs(int $argc, $target, $pad): array
    {
        $undef = Undefined::value();
        return [$argc < 2 ? $undef : $target, $argc < 3 ? $undef : $pad];
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
     * look like numbers, else lexically. A nil key (`null` / `undefined`)
     * reads as '' lexically and `null` as 0 numerically; a numeric
     * `a.f - b.f` over an `undefined` key is NaN, which the sort reads as
     * "equal". */
    private function compareSortKey($av, $bv, string $compareType): int
    {
        // String comparisons below MUST use strcmp(), not PHP's `<=>`: PHP
        // applies "smart" numeric-string comparison when both operands look
        // numeric ("10" <=> "9" compares 10 > 9 numerically), which would
        // silently make the 'string' compare_type behave like 'auto' for
        // numeric-looking values -- see the matching note on
        // Evaluator::relational().
        if ($compareType === 'string') {
            return strcmp((string) $this->string($av), (string) $this->string($bv)) <=> 0;
        }
        if ($compareType === 'auto') {
            if ($this->isNumericLike($av) && $this->isNumericLike($bv)) {
                return $this->numericValue($av) <=> $this->numericValue($bv);
            }
            return strcmp((string) $this->string($av), (string) $this->string($bv)) <=> 0;
        }
        // numeric
        if ($av instanceof Undefined || $bv instanceof Undefined) {
            return 0;
        }
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

        // JS moves every `undefined` element to the end without handing it
        // to the comparator.
        $tail = [];
        $keyed = [];
        foreach ($recv as $item) {
            if ($item instanceof Undefined) {
                $tail[] = $item;
                continue;
            }
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

        return array_merge(array_map(fn ($p) => $p[1], $keyed), $tail);
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
            // A nil item (`null` / `undefined`) folds as 0, as it always has.
            $numeric = (!Undefined::isNullish($n) && $this->isNumericLike($n)) ? $this->numericValue($n) : 0;
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
        if (Undefined::isNullish($value)) {
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
            if (Undefined::isNullish($v)) {
                continue;
            }
            $prop = preg_replace_callback('/([A-Z])/', fn ($m) => '-' . strtolower($m[1]), (string) $key);
            $parts[] = $prop . ':' . $this->string($v);
        }
        return $parts ? implode(';', $parts) : null;
    }

    /** Structural scan for characters that could break a value out of a CSS
     * declaration -- ported byte-for-byte from Hono's own
     * `hasUnsafeStyleValue` (`hono/jsx/utils.ts`), the ORACLE this adapter's
     * dynamic `style={{...}}` values must match (#2261). NOT real CSSOM
     * property validation. Every character this scan tests is ASCII, and
     * PHP string indexing is byte-based, so a multibyte UTF-8 sequence has
     * no byte in the ASCII range that could spuriously match one of these
     * single-byte comparisons. */
    private function hasUnsafeStyleValue(string $value): bool
    {
        $quote = '';
        $blockStack = [];
        $len = strlen($value);
        for ($i = 0; $i < $len; $i++) {
            $c = $value[$i];
            if ($c === '\\') {
                if ($i === $len - 1) {
                    return true;
                }
                $i++;
            } elseif ($quote !== '') {
                if ($c === "\n" || $c === "\f" || $c === "\r") {
                    return true;
                }
                if ($c === $quote) {
                    $quote = '';
                }
            } elseif ($c === '/' && $i + 1 < $len && $value[$i + 1] === '*') {
                $end = strpos($value, '*/', $i + 2);
                if ($end === false) {
                    return true;
                }
                $i = $end + 1;
            } elseif ($c === '"' || $c === "'") {
                $quote = $c;
            } elseif ($c === '(') {
                $blockStack[] = ')';
            } elseif ($c === '[') {
                $blockStack[] = ']';
            } elseif ($c === '{' || $c === '}') {
                return true;
            } elseif ($c === ')' || $c === ']') {
                if (empty($blockStack) || end($blockStack) !== $c) {
                    return true;
                }
                array_pop($blockStack);
            } elseif ($c === ';' && empty($blockStack)) {
                return true;
            }
        }
        return $quote !== '' || !empty($blockStack);
    }

    /** Builds the CSS string for a `style={{...}}` JSX object-literal
     * attribute (#2261). `$pairs` alternates CSS key (always compile-time-
     * known), then value. A value that fails `hasUnsafeStyleValue` (after
     * JS-`String()`-style stringification) is DROPPED -- the whole
     * `key:value` pair is omitted -- matching Hono's oracle exactly. The
     * joined string is STILL HTML-escaped (mirroring Hono's own
     * `escapeToBuffer` call) since a structurally "safe" value can still
     * carry a literal `"`/`'`/`&`. Returns the runtime's `mark_raw`-wrapped
     * result so the caller's `{!! !!}` / raw output isn't double-escaped. */
    public function style_object(...$pairs)
    {
        $parts = [];
        for ($i = 0; $i + 1 < count($pairs); $i += 2) {
            $key = $this->string($pairs[$i]);
            $value = $this->string($pairs[$i + 1]);
            if ($this->hasUnsafeStyleValue($value)) {
                continue;
            }
            $parts[] = $this->htmlEscape($key) . ':' . $this->htmlEscape($value);
        }
        return $this->backend->mark_raw(implode(';', $parts));
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
            // null / undefined -> drop.
            if (Undefined::isNullish($val)) {
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

    // JS primitive helpers (spec/js-primitive-semantics.md, "Operation
    // table"): ToNumber, ToString, the relational operators, binary `+` and
    // unary `-`. Each delegates to the evaluator's primitive of the same
    // operation, as `index` and `eq` already do, so a template helper call
    // and a callback body share one implementation. Unlike `number` and
    // `string` (display helpers: null / undefined -> NAN / ''), null reads as
    // JS null here (0 / 'null') and undefined as JS undefined (NaN /
    // 'undefined').

    public function to_number($v): float
    {
        return Evaluator::toNumber($v);
    }

    public function to_string($v): string
    {
        return Evaluator::toStringJs($v);
    }

    public function lt($a, $b): bool
    {
        return Evaluator::relational('<', $a, $b);
    }

    public function le($a, $b): bool
    {
        return Evaluator::relational('<=', $a, $b);
    }

    public function gt($a, $b): bool
    {
        return Evaluator::relational('>', $a, $b);
    }

    public function ge($a, $b): bool
    {
        return Evaluator::relational('>=', $a, $b);
    }

    public function plus($a, $b)
    {
        return Evaluator::binary('+', $a, $b);
    }

    public function neg($v)
    {
        return Evaluator::unary('-', $v);
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
