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

The 7 template-stash adapters' conformance test harnesses (`test-render.ts`) now seed a root component's signal/memo template vars EXCLUSIVELY from `deriveStashFromDefaults(extractSsrDefaults(...), props)` — the same manifest-driven value a real before_render-equivalent plugin/integration consumes at runtime. Removes the harness's own `evaluateSignalInit` re-evaluation of a signal's initializer against raw props, and the `?? 0` fallback a memo used to get when the manifest had no entry for it; the #2669 self-derivation propName-skip these loops carried is gone too, since `deriveStashFromDefaults` already resolves a propName-carrying entry correctly on its own. Root-path seeding is now the same semantics the child-component-renderer path already had.

`@barefootjs/jsx` removes `evaluateSignalInit`/`tryEvaluateSignalInit`/`SignalInitEvalResult` (`signal-init-eval.ts`, added for #2209): a test-harness-only sandboxed real-JS evaluator (`new Function`) strictly more powerful than production's own static `extractSsrDefaults`/`tryStaticEval`, which has no support for `.map()` on any receiver shape. That extra power was silently masking a real production gap — a signal/memo initialized via a `.map()` chain never gets a working SSR seed in production either, on any of the 7 backends. The 7 harnesses were its only remaining callers.

This export removal is a breaking change, bumped **minor** rather than patch: pre-1.0 (0.31.x), a minor is this repo's breaking-change slot under semver §4 (precedent: the `renderImportMapHtml`/`BfImportMap`/`TemplateAdapter.importMapInjection` removal, 0.31.0). #2209, which ADDED this export, was correctly patch — adding an export isn't breaking — but removing one is.

Surfaced (and pinned via `renderDivergences`, `#2696`) on all 7 adapters:

- `todo-app` / `todo-app-ssr`: the `todos` signal (`(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))`) seeds `null`/`nil`/`undef`/`None` — `extractSsrDefaults` can't statically resolve the `.map()` over a differently-named prop, and `computeSsrSeedPlan` classifies it opaque (no in-template recompute). `todo-app-ssr`'s unmarked todo-list loop throws on Python/Ruby/Perl (jinja, erb, mojolicious) and silently renders empty on Kolon/PHP/minijinja (xslate, blade, twig, rust); `todo-app`'s unmarked toggle-all conditional silently renders as if there are zero todos on every backend.
- `callback-param-shadows-prop`: the `first` signal (`[{ a: 'p' }].map((title) => title.a).join(',')`) is a constant expression that's still unresolvable the same way, and — unlike the fixture's sibling `joined` memo, whose structurally similar `.map().join()` chain over a signal getter DOES get an in-template recompute — also classifies opaque, so `<span>{first()}</span>` SSRs empty instead of `p`.

`@barefootjs/mojolicious`'s child-renderer path (`buildChildDefaultsPerl`) had one further leftover `evaluateSignalInit(..., undefined)` call for an ordinary (non-propName) child signal default, inconsistent with the memo loop right beside it (which already used the static `ssrDefaults` value verbatim) — fixed to match; no currently-covered fixture exercises a child component with a non-statically-resolvable signal, so this is not a new pinned divergence.

Graduation path per entry: fix `extractSsrDefaults`'s static evaluator (or add an in-template recompute for the affected signal shapes) so the manifest's own seed is correct, regenerate `expectedHtml` from the fixed reference, delete the `renderDivergences` entries.

## Step 1 follow-up (#2696): `callback-param-shadows-prop` graduated, `todo-app`/`todo-app-ssr` remain

`checkSupport` (expression-parser.ts) gains a `pos: 'rendered' | 'value'` parameter: an `object-literal` was refused unconditionally as a standalone template expression, which also blocked it at every VALUE position reachable through it — an array-literal element, an object-literal property value, and the receiver/callback-body/args of a `.map()`-family call or `array-method` (all container-CONTENTS positions; every other recursive site inherits the position it was entered at, so `cond ? {a:1} : {b:2}` at a rendered position stays refused). `isSupported` keeps checking at `'rendered'` (unchanged, byte-identical refusal reason — Roadmap A-1); the new `isSupportedValue` checks at `'value'`, admitting an object literal there when every property value is itself supported. `computeSsrSeedPlan`'s `classify` now uses `isSupportedValue` (a signal/memo initializer is an assignment, never a render).

This makes `[{ a: 'p' }].map(t => t.a).join(',')` (`callback-param-shadows-prop`'s `first` signal) classify `derived` instead of `opaque`. Its free set is empty (a compile-time constant), so every template-stash adapter's derived-seed generator still degrades to the STATIC `extractSsrDefaults` value rather than emitting an in-template recompute (no free var survives into the lowered text) — this is exactly the graduation path called out above, so `extractSsrDefaults`'s static evaluator (`ssr-defaults.ts`) gains `.map()` support (single-param expression-bodied arrow over a resolved array) and its property-access arm now reads a resolved plain-object base instead of unconditionally refusing, closing the gap the `renderDivergences` entries named ("`.map()` is unsupported for any receiver").

Each of the 7 template-stash adapters' `objectLiteral` `ParsedExprEmitter` case — previously reachable ONLY as the empty (`?? {}`) fallback and refusing any populated literal — now lowers a populated object literal to its language's native dict/hash/hashref (PHP/Perl array, Ruby Hash, Jinja/Twig/minijinja dict, Kolon hashref), keyed the same way each adapter's existing spread-path `objectLiteralTo*` helper quotes keys. `@barefootjs/go-template` has no map-literal template syntax at all, so its `objectLiteral` case instead lowers through a new variadic `bf_map` runtime helper (`packages/adapter-go-template/runtime/bf.go`), the object counterpart of the existing `bf_arr`; the pre-existing `?? {}` self-reported BF101 (Go genuinely can't render an empty map literal as a template action either) is unchanged.

`callback-param-shadows-prop` graduates off `renderDivergences` on all 7 template-stash adapters. `todo-app` / `todo-app-ssr` remain pinned — their `.map(t => ({ ...t, editing: false }))` uses object SPREAD, which `checkSupport`'s `object-literal` arm still refuses regardless of `pos` (out of scope for this step; spreads, computed keys, methods, and getters/setters all still fall through to `unsupported`).

New fixture `map-object-literal-body`: a `.map()` callback body returning an object literal with a NON-EMPTY free set (a sibling signal), forcing a genuine in-template recompute (not the constant-skip path above) on every template-stash adapter and Go's `bf_map`.
