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
  // #2843: graduated — a registered lowering call inside a ternary
  // attribute branch (or any nested value position) is now recognised via
  // `JinjaTopLevelEmitter`'s `lowering` seam + the registry-aware support
  // gate, matching the direct-call attribute path exactly.
  'filter-typeof-predicate': [{ code: 'BF021', severity: 'error' }],
  'map-array-builder-body': [{ code: 'BF021', severity: 'error' }],
  'map-array-builder-escaping': [{ code: 'BF021', severity: 'error' }],
  'fill-unsupported': [{ code: 'BF101', severity: 'error' }],
  'find-typeof-predicate': [{ code: 'BF101', severity: 'error' }],
  'some-typeof-predicate': [{ code: 'BF101', severity: 'error' }],
  'every-typeof-predicate': [{ code: 'BF101', severity: 'error' }],
  'reduce-typeof-body': [{ code: 'BF101', severity: 'error' }],
  'reduce-right-typeof-body': [{ code: 'BF101', severity: 'error' }],
  'flatmap-typeof-projection': [{ code: 'BF101', severity: 'error' }],
  // A pure PROJECTION flatMap body (`flatmap-expression-body`) is NOT pinned —
  // it lowers to neutral nested-loop IR this adapter templatizes natively;
  // only the statement-carrying body refuses.
  'tag-cloud': [{ code: 'BF021', severity: 'error' }],
  'preamble-cells': [{ code: 'BF021', severity: 'error' }],
  // Refused for the COMPUTED loop array (`const entries = Object.entries(...)
  // .filter(...)`), not the destructure param (that lowers, #2087) — loud
  // BF101 instead of Jinja's ChainableUndefined silently iterating zero times.
  'static-array-from-props': [
    {
      code: 'BF101',
      severity: 'error',
      issue: 'https://github.com/piconic-ai/barefootjs/issues/2321',
    },
  ],
  // No BF103 pin: the harness registers sibling templates (#2205).
  'static-array-from-props-with-component': [
    {
      code: 'BF101',
      severity: 'error',
      issue: 'https://github.com/piconic-ai/barefootjs/issues/2321',
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
      issue: 'https://github.com/piconic-ai/barefootjs/issues/2321',
    },
  ],
  // #2038: no inline comprehension-with-nested-callback form via the
  // evaluator-JSON `*_eval` mechanism (`jinja-adapter.ts`'s header,
  // divergence 3) — loud BF101 instead of lossy.
  'filter-nested-callback-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2320' },
  ],
  'filter-nested-find-predicate': [{ code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2320' }],
  // Top-level `.find`/`.findIndex`/`.findLast`/`.findLastIndex` are NOT
  // pinned — unlike mojo (which refuses them), Jinja lowers them via the
  // same evaluator-JSON mechanism as `.filter`/`.some`. Only the nested form
  // above is refused.
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2356' }],
  'rich-prop-client-read': [{ code: 'BF049', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2648' }],
  // A ternary or array literal LITERALLY WRAPPING JSX at a non-children prop
  // position (e.g. `header={cond ? <a/> : <b/>}`) is refused ahead of
  // `adapter.generate()` in the shared jsx-to-ir.ts phase, so it is pinned
  // identically on every adapter (including Hono) — same reasoning as
  // `rich-prop-client-read` above. This is the permanent, intended behavior
  // (formerly tracked as #2667, closed): the issue's own acceptance criteria
  // treated a loud refusal as fully resolving the silent-divergence bug, so
  // no open issue tracks further work here.
  'jsx-element-prop-ternary': [{ code: 'BF021', severity: 'error' }],
  'jsx-element-prop-array': [{ code: 'BF021', severity: 'error' }],
  // A reactive primitive invoked through a namespace import
  // (`import * as bf from '@barefootjs/client'`, `bf.createSignal(...)`)
  // that the analyzer's checker-less fast path cannot recognize refuses
  // loudly (BF013) instead of silently dropping the declaration — fired
  // in the shared analyzer pass ahead of any adapter's `adapter.generate()`,
  // so all nine adapters (including Hono) pin this identically. A compile
  // that supplies a shared `ts.Program` (e.g. via `@barefootjs/vite`)
  // resolves the primitive normally and never reaches this refusal (formerly
  // tracked as #2771, closed) — no open issue tracks further work.
  'namespace-import-primitive': [{ code: 'BF013', severity: 'error' }],
  // #2994 graduated the render-divergence pin: a call to a module-scope
  // helper (arrow-valued const OR `function` declaration) by bare name
  // has no Python binding in Jinja template scope — `call()`'s generic
  // fallback now refuses it loudly (BF101) instead of silently resolving
  // against Jinja's undefined-variable semantics (renders empty) and
  // dropping the call's arguments. No verified escape twin exists yet
  // (the shape has no structural lowering — see #2994's "Suggested fix
  // shape" for the deferred, harder direction); `/* @client */` works
  // informally but isn't pinned as a corpus fixture yet.
  'module-const-arrow-helper': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2994', unescapable: { issue: 'https://github.com/piconic-ai/barefootjs/issues/2994' } },
  ],
  'module-function-helper-chain': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2994', unescapable: { issue: 'https://github.com/piconic-ai/barefootjs/issues/2994' } },
  ],
  // #3012: same BF101 refusal as the two entries above, for a module-scope
  // helper called from a boolean-TEST position (a ternary `test`) rather
  // than a plain text position — the `_boolContext` structural exemption
  // that used to let this shape through (scoped by position, not by
  // callee identity) is now removed entirely; `isValidElement` (the one
  // caller that needed to keep compiling under it) is resolved ahead of
  // `call()`'s generic fallback as an identity-scoped `templatePrimitive`
  // instead (`bf.is_element`, `lib/constants.ts`).
  'module-helper-boolcontext-call': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/3012', unescapable: { issue: 'https://github.com/piconic-ai/barefootjs/issues/3012' } },
  ],
}
