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
  // #2843: graduated — a registered lowering call inside a ternary
  // attribute branch (or any nested value position) is now recognised via
  // `XslateTopLevelEmitter`'s `lowering` seam + the registry-aware support
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
  // #2038: Kolon has no inline `grep` form (unlike mojo, which lowers a
  // nested `.some` to a real inline Perl `grep`) — loud BF101 instead of the
  // old silent degradation to the receiver.
  'filter-nested-callback-predicate': [
    { code: 'BF101', severity: 'error', limitation: 'nested-callback-in-filter-predicate' },
  ],
  'filter-nested-find-predicate': [{ code: 'BF101', severity: 'error', limitation: 'nested-callback-in-filter-predicate' }],
  // Top-level `.find`/`.findIndex`/`.findLast`/`.findLastIndex` are NOT
  // pinned — unlike mojo (which refuses them), Xslate lowers them via the
  // same Kolon-lambda mechanism as `.filter`/`.some`. Only the nested form
  // above is refused.
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
  // has no Perl binding in Text::Xslate template scope — `call()`'s
  // generic fallback now refuses it loudly (BF101) instead of silently
  // resolving against Xslate's undefined-variable semantics (renders
  // empty) and dropping the call's arguments. No verified escape twin
  // exists yet (the shape has no structural lowering — see #2994's
  // "Suggested fix shape" for the deferred, harder direction);
  // `/* @client */` works informally but isn't pinned as a corpus
  // fixture yet.
  'module-const-arrow-helper': [
    { code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call', unescapable: true },
  ],
  'module-function-helper-chain': [
    { code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call', unescapable: true },
  ],
  // #3012: same #2994 refusal as the two entries above, but exercised from
  // a boolean-TEST position (a ternary's `test`) instead of a plain text
  // position — pins that the refusal is scoped by CALLEE IDENTITY, not by
  // structural position. Before #3012, this adapter exempted ANY call
  // inside a boolean-test position from BF101 (`_boolContext`), not just
  // `isValidElement` (the one caller that legitimately needs it, for
  // `ui/components/ui/slot`'s `asChild` guard) — so a non-`isValidElement`
  // helper called from a condition/ternary test silently kept the broken
  // pre-#2994 fallback instead of refusing. `isValidElement` now resolves
  // as an identity-scoped `templatePrimitive` (`lib/constants.ts`, backed
  // by the shared BarefootJS Perl runtime's `is_element` method) before
  // `call()`'s generic fallback is ever reached, so the structural
  // `_boolContext` exemption was removed entirely for this adapter — every
  // other bare-name call now refuses here regardless of position.
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
}
