/**
 * Per-fixture build-time contracts for shapes this adapter intentionally
 * refuses to lower. Declared per adapter, not on the shared fixtures, so
 * adding a new adapter never touches a cross-adapter file. Per-fixture
 * rationale lives on each fixture's docstring
 * (`packages/adapter-tests/fixtures/<id>.ts`) and spec/callback-fidelity.md;
 * comments below only mark where this adapter's set diverges from siblings.
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {
  'format-date': [{ code: 'BF056', severity: 'error', limitation: 'authored-format-date-call' }],
  'create-query-action-read': [{ code: 'BF117', severity: 'error', limitation: 'query-action-read-in-template' }],
  // #2843: graduated — a registered lowering call inside a ternary
  // attribute branch (or any nested value position) is now recognised via
  // `MojoTopLevelEmitter`'s `lowering` seam + the registry-aware support
  // gate, matching the direct-call attribute path exactly.
  'filter-typeof-predicate': [{ code: 'BF021', severity: 'error', limitation: 'off-subset-callback-body' }],
  'map-array-builder-body': [{ code: 'BF021', severity: 'error', limitation: 'statement-body-callback' }],
  'map-array-builder-escaping': [{ code: 'BF021', severity: 'error', limitation: 'statement-body-callback' }],
  'fill-unsupported': [{ code: 'BF101', severity: 'error', limitation: 'array-fill' }],
  'find-typeof-predicate': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'some-typeof-predicate': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'every-typeof-predicate': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'reduce-typeof-body': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'reduce-right-typeof-body': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'flatmap-typeof-projection': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  // A pure PROJECTION flatMap body (`flatmap-expression-body`) is NOT pinned —
  // it lowers to neutral nested-loop IR this adapter templatizes natively;
  // only the statement-carrying body refuses.
  'tag-cloud': [{ code: 'BF021', severity: 'error', limitation: 'statement-body-callback' }],
  'preamble-cells': [{ code: 'BF021', severity: 'error', limitation: 'statement-body-callback' }],
  // Refused for the COMPUTED loop array (`const entries = Object.entries(...)
  // .filter(...)`), not the destructure param (that lowers, #2087) — loud
  // BF101 instead of silently iterating an unbound name zero times.
  'static-array-from-props': [
    {
      code: 'BF101',
      severity: 'error',
      limitation: 'computed-const-loop-source',
    },
  ],
  // No BF103 pin: the harness registers sibling templates (#2205).
  'static-array-from-props-with-component': [
    {
      code: 'BF101',
      severity: 'error',
      limitation: 'computed-const-loop-source',
    },
  ],
  // Module-scope companion of `static-array-from-props` above: the const
  // is computed via a function call, not a static literal — genuinely
  // unresolvable at SSR render time, same #2321 design gap applied
  // uniformly regardless of which scope the const lives in (#2946 fixed
  // the STATIC-literal module-scope case; this is the still-open
  // computed-const case). Escape twin: `module-const-loop-source-computed-client`.
  'module-const-loop-source-computed': [
    {
      code: 'BF101',
      severity: 'error',
      limitation: 'computed-const-loop-source',
    },
  ],
  // Only `.find` is pinned — `find*` returns an element, not a boolean, so
  // there's no inline predicate form; the nested-`.some` sibling lowers to a
  // real inline Perl `grep` and must render to Hono parity instead.
  'filter-nested-find-predicate': [{ code: 'BF101', severity: 'error', limitation: 'nested-callback-in-filter-predicate' }],
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', limitation: 'ambient-locale-date-formatting' }],
  'rich-prop-client-read': [{ code: 'BF049', severity: 'error', limitation: 'rich-typed-prop-hydration' }],
  // A ternary or array literal LITERALLY WRAPPING JSX at a non-children prop
  // position (e.g. `header={cond ? <a/> : <b/>}`) is refused ahead of
  // `adapter.generate()` in the shared jsx-to-ir.ts phase, so it is pinned
  // identically on every adapter (including Hono) — same reasoning as
  // `rich-prop-client-read` above. This is the permanent, intended behavior
  // (formerly tracked as #2667, closed): the issue's own acceptance criteria
  // treated a loud refusal as fully resolving the silent-divergence bug, so
  // no open issue tracks further work here.
  'jsx-element-prop-ternary': [{ code: 'BF021', severity: 'error', limitation: 'jsx-wrapped-in-non-children-prop' }],
  'jsx-element-prop-array': [{ code: 'BF021', severity: 'error', limitation: 'jsx-wrapped-in-non-children-prop' }],
  // A reactive primitive invoked through a namespace import
  // (`import * as bf from '@barefootjs/client'`, `bf.createSignal(...)`)
  // that the analyzer's checker-less fast path cannot recognize refuses
  // loudly (BF013) instead of silently dropping the declaration — fired
  // in the shared analyzer pass ahead of any adapter's `adapter.generate()`,
  // so all nine adapters (including Hono) pin this identically. A compile
  // that supplies a shared `ts.Program` (e.g. via `@barefootjs/vite`)
  // resolves the primitive normally and never reaches this refusal (formerly
  // tracked as #2771, closed) — no open issue tracks further work.
  'namespace-import-primitive': [{ code: 'BF013', severity: 'error', limitation: 'namespace-import-primitive-without-program' }],
  // #2911: `staticValueToPerl` (`adapter/lib/static-value.ts`) deliberately
  // returns `null` for a `boolean` anywhere inside a static loop array's
  // item shape — Perl has no native boolean literal, and baking `1`/`''`
  // would diverge from JS's `String(true) === "true"` the moment that value
  // is ever interpolated as text. This fixture's item shape has an `active:
  // boolean` field (feeding a conditional, never interpolated as text
  // itself), so the whole array fails to serialize and falls through to the
  // generic "local computed value" BF101 refusal. Unrelated to #2898 (a
  // Go-template-only fix) — this fixture happened to be the first to
  // combine a boolean item field with a conditional in this adapter's own
  // corpus.
  'static-loop-item-conditional': [{
    code: 'BF101',
    severity: 'error',
    limitation: 'boolean-in-static-loop-item',
  }],
  // #2911: same trigger as `static-loop-item-conditional` above — this
  // fixture's item shape has a `disabled: boolean` field (feeding a boolean
  // HTML attribute rather than a conditional), found alongside it while
  // reviewing #2898.
  'static-loop-item-boolean-attr': [{
    code: 'BF101',
    severity: 'error',
    limitation: 'boolean-in-static-loop-item',
  }],
  // #2994 graduated the render-divergence pin: a call to a module-scope
  // helper (arrow-valued const OR `function` declaration) by bare name
  // has no Perl binding in Mojolicious template scope — `call()`'s
  // generic fallback now refuses it loudly (BF101) instead of falling
  // through to a bare `$fmt` lookup that crashes Perl `strict` mode at
  // render time. No verified escape twin exists yet (the shape has no
  // structural lowering — see #2994's "Suggested fix shape" for the
  // deferred, harder direction); `/* @client */` works informally but
  // isn't pinned as a corpus fixture yet.
  'module-const-arrow-helper': [
    { code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call', unescapable: true },
  ],
  'module-function-helper-chain': [
    { code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call', unescapable: true },
  ],
  // #3012: same #2994 refusal as the two entries above, exercised from a
  // boolean-TEST position (a ternary's `test`) instead of a plain text
  // position. Unlike the six adapters #3012 is actually about, this
  // adapter's `isValidElement` handling (`emitters.ts`) was ALREADY
  // identity-scoped (registered by name via the shared `isValidElement`
  // runtime primitive, #2266) rather than exempted by structural
  // position, so it never had the `_boolContext` gap — every other
  // bare-name call already refused loudly here regardless of position.
  // This pin just extends the existing #2994 contract to the new fixture.
  'module-helper-boolcontext-call': [
    { code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call', unescapable: true },
  ],
  // #3063: a client-interactive component with a multi-return chain
  // where one branch is a bare JSX fragment refuses ahead of
  // `adapter.generate()` in the shared jsx-to-ir.ts phase (the client
  // hydration claim can't tell branches apart — see the registry entry),
  // so it is pinned identically on every adapter including Hono.
  'conditional-return-fragment-branch': [
    { code: 'BF029', severity: 'error', limitation: 'fragment-wrapped-conditional-return-branch-scope' },
  ],
  // A `ref` callback writing an attribute on mount that the element's JSX
  // never renders refuses (BF063) in the shared jsx-to-ir.ts phase, ahead
  // of `adapter.generate()` — a ref never runs at SSR, so the attribute
  // could never reach the server HTML on any backend — so it is pinned
  // identically on every adapter including Hono.
  'ref-mount-attr': [
    { code: 'BF063', severity: 'error', limitation: 'ref-effect-attr-state-ssr' },
  ],
  // #3144: a component-body local bound to an opaque call
  // (`const label = makeLabel(); {label()}`), invoked in text position,
  // refuses ahead of the generic signal-getter fallback in this
  // adapter's own `call()` (`adapter/expr/emitters.ts` /
  // `go-template-adapter.ts`) -- not a shared jsx-to-ir.ts refusal, since
  // Hono's real JS runtime evaluates this shape correctly and must keep
  // doing so.
  'opaque-local-accessor-call': [{ code: 'BF101', severity: 'error', limitation: 'opaque-local-accessor-call' }],
}
