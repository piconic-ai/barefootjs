---
"@barefootjs/jsx": minor
"@barefootjs/jinja": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
"@barefootjs/rust": patch
"@barefootjs/go-template": patch
---

#2696 Step 1: value-position object literals are admitted by the SSR seed support gate; `callback-param-shadows-prop` graduates, `todo-app`/`todo-app-ssr` remain pinned.

`checkSupport` (expression-parser.ts) gains a `pos: 'rendered' | 'value'` parameter: an `object-literal` was refused unconditionally as a standalone template expression, which also blocked it at every VALUE position reachable through it — an array-literal element, an object-literal property value, and the receiver/callback-body/args of a `.map()`-family call or `array-method` (all container-CONTENTS positions; every other recursive site inherits the position it was entered at, so `cond ? {a:1} : {b:2}` at a rendered position stays refused). `isSupported` keeps checking at `'rendered'` (unchanged, byte-identical refusal reason — Roadmap A-1); the new `isSupportedValue` checks at `'value'`, admitting an object literal there when every property value is itself supported. `computeSsrSeedPlan`'s `classify` now uses `isSupportedValue` (a signal/memo initializer is an assignment, never a render).

This makes `[{ a: 'p' }].map(t => t.a).join(',')` (`callback-param-shadows-prop`'s `first` signal) classify `derived` instead of `opaque`. Its free set is empty (a compile-time constant), so every template-stash adapter's derived-seed generator still degrades to the STATIC `extractSsrDefaults` value rather than emitting an in-template recompute (no free var survives into the lowered text) — exactly the graduation path #2696 calls out, so `extractSsrDefaults`'s static evaluator (`ssr-defaults.ts`) gains `.map()` support (single-param expression-bodied arrow over a resolved array) and its property-access arm now reads a resolved plain-object base instead of unconditionally refusing, closing the gap the `renderDivergences` entries named ("`.map()` is unsupported for any receiver").

Each of the 7 template-stash adapters' `objectLiteral` `ParsedExprEmitter` case — previously reachable ONLY as the empty (`?? {}`) fallback and refusing any populated literal — now lowers a populated object literal to its language's native dict/hash/hashref (PHP/Perl array, Ruby Hash, Jinja/Twig/minijinja dict, Kolon hashref), keyed the same way each adapter's existing spread-path `objectLiteralTo*` helper quotes keys. `@barefootjs/go-template` has no map-literal template syntax at all, so its `objectLiteral` case instead lowers through a new variadic `bf_map` runtime helper (`packages/adapter-go-template/runtime/bf.go`), the object counterpart of the existing `bf_arr`; the pre-existing `?? {}` self-reported BF101 (Go genuinely can't render an empty map literal as a template action either) is unchanged.

`callback-param-shadows-prop` graduates off `renderDivergences` on all 7 template-stash adapters. `todo-app` / `todo-app-ssr` remain pinned — their `.map(t => ({ ...t, editing: false }))` uses object SPREAD, which `checkSupport`'s `object-literal` arm still refuses regardless of `pos` (out of scope for this step; spreads, computed keys, methods, and getters/setters all still fall through to `unsupported`).

New fixture `map-object-literal-body`: a `.map()` callback body returning an object literal with a NON-EMPTY free set (a sibling signal), forcing a genuine in-template recompute (not the constant-skip path above) on every template-stash adapter and Go's `bf_map`.
