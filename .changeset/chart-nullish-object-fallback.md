---
"@barefootjs/jsx": minor
"@barefootjs/erb": minor
"@barefootjs/jinja": minor
"@barefootjs/rust": minor
"@barefootjs/twig": minor
"@barefootjs/xslate": minor
"@barefootjs/mojolicious": minor
"@barefootjs/go-template": minor
---

Support `x ?? {}` (an empty object-literal `??` fallback) on every SSR template adapter (#2087), fixing the `chart` UI component's `<ChartConfigContext.Provider value={{ config: props.config ?? {} }}>`, the last remaining `ui/compat.lock.json` failures (erb, jinja, minijinja, mojolicious, twig, xslate all now `ok: true` — 496/496).

The shared `isSupported` gate (`packages/jsx/src/expression-parser.ts`) previously refused any expression containing a standalone object literal, including one used only as `??`'s fallback operand. `logical` now narrowly admits an EMPTY object-literal right operand of `??` specifically — not `&&`/`||`, and not a non-empty object literal, both of which still refuse. Every template adapter's `??` lowering already had a correct definedness test; only the right-operand VALUE emit needed to change: erb/jinja/minijinja/twig/xslate/mojolicious's `objectLiteral` dispatcher now emits the language's real empty dict/hashref literal (`{}`) for the zero-property case, matching the `'{}'` convention their spread-codegen (`objectLiteralToXxx`) already used, instead of the filter-context truthy sentinel leaking into value position.

Go templates have no object/map literal syntax at all, so `GoTemplateAdapter.objectLiteral` now self-reports BF101 for this shape (the shared gate no longer does, since it now considers `x ?? {}` supported) and falls back to the safe `""` string sentinel, so the emitted action stays valid Go template syntax instead of splicing an `[UNSUPPORTED: …]` marker into an `or`/`and` operand. Go's chart cell was already `ok: true` via `extendProviderContext`'s pre-existing non-literal-provider-value skip (unchanged) — a new unit test pins both paths explicitly.

New conformance fixture `context-provider-nullish-object-fallback` pins the exact chart shape (a context-provider value member falling back to `?? {}`, consumed by a child reading a missing key off it) across all seven template adapters; go-template is `skipJsx`'d with a docstring — the fixture's `createContext` DEFAULT is itself an object, and Go's context-value skip only ever handled a string/number/boolean default, a pre-existing gap orthogonal to this fix.
