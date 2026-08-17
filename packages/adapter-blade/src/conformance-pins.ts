/**
 * Per-fixture build-time contracts for shapes the Blade adapter
 * intentionally refuses to lower. Mirrors Jinja's set — the lowering
 * gates are shared code paths in the ported adapter (BF103/BF104 are
 * structural: cross-template child registration / destructure-loop-param
 * limits that apply identically regardless of target template language).
 * Consumed by this package's own conformance test (as `expectedDiagnostics`)
 * and by `bf compat` (issue-URL attribution).
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {
  // Off-subset filter predicate (`typeof`) the compiler can't lower; a
  // JS-runtime target runs it, a DSL adapter surfaces BF021 + `/* @client */`.
  // See spec/callback-fidelity.md.
  'filter-typeof-predicate': [{ code: 'BF021', severity: 'error' }],
  // Array-builder `.map()` body (imperative `push`-into-array preamble):
  // BF021, with a verified `/* @client */` escape — `map-array-builder-
  // body-client` (#2613). See that fixture's docstring.
  'map-array-builder-body': [{ code: 'BF021', severity: 'error' }],
  'map-array-builder-escaping': [{ code: 'BF021', severity: 'error' }],
  // `.fill(value)` mutates the receiver in place — no template lowering
  // on any DSL adapter; a JS-runtime target runs it, a DSL adapter
  // surfaces BF101 + `/* @client */`. See spec/callback-fidelity.md.
  'fill-unsupported': [{ code: 'BF101', severity: 'error' }],
  // Off-subset `.find()` / `.some()` / `.every()` predicate (`typeof`) the
  // compiler can't lower; a JS-runtime target runs it, a DSL adapter
  // surfaces BF101 + `/* @client */`. See spec/callback-fidelity.md.
  'find-typeof-predicate': [{ code: 'BF101', severity: 'error' }],
  'some-typeof-predicate': [{ code: 'BF101', severity: 'error' }],
  'every-typeof-predicate': [{ code: 'BF101', severity: 'error' }],
  // Off-subset `.reduce()` / `.reduceRight()` body / `.flatMap()`
  // projection (`typeof`) the compiler can't lower; a JS-runtime target
  // runs it, a DSL adapter surfaces BF101 + `/* @client */`.
  // See spec/callback-fidelity.md.
  'reduce-typeof-body': [{ code: 'BF101', severity: 'error' }],
  'reduce-right-typeof-body': [{ code: 'BF101', severity: 'error' }],
  'flatmap-typeof-projection': [{ code: 'BF101', severity: 'error' }],
  // JSX-returning `.flatMap()` body carried as structured segments — i.e.
  // one with STATEMENTS (early returns, consts): a JS runtime executes it
  // verbatim; a DSL template runtime can't, so it refuses with BF021 +
  // `/* @client */` (pre-gate this emitted an empty loop body — silent
  // divergence). A pure PROJECTION body (`flatMap(it => it.tags.map(...))`,
  // e.g. the `flatmap-expression-body` fixture) is NOT pinned: it lowers to
  // neutral nested-loop IR this adapter templatizes natively.
  // See spec/callback-fidelity.md.
  'tag-cloud': [{ code: 'BF021', severity: 'error' }],
  // A keyed `.map()` row body whose preamble builds a JSX leaf from item
  // state (`cells.push(<td>{stateLabel}</td>)`) embedded as `{cells}` — the
  // Stage 3 array-builder carrier, jsRuntime-only: a JS runtime runs it
  // verbatim (and patches the region on same-key updates, #2389), a DSL
  // adapter refuses with BF021 + `/* @client */`. See spec/callback-fidelity.md.
  'preamble-cells': [{ code: 'BF021', severity: 'error' }],
  // The `([emoji, users]) => …` array-destructure param itself now lowers
  // (#2087 Phase B), but the loop ARRAY is a function-scope computed const
  // (`const entries = Object.entries(props.reactions ?? {}).filter(...)`)
  // that the adapter can't bind as a template variable — refused loudly
  // with BF101 (same check and policy as Jinja / ERB) instead of silently
  // iterating zero times over an unbound name.
  'static-array-from-props': [
    {
      code: 'BF101',
      severity: 'error',
      issue: 'https://github.com/piconic-ai/barefootjs/issues/2321',
    },
  ],
  // BF101 (computed local-const loop array, as above) fires; BF103
  // (imported child in the loop body) no longer does now that the
  // conformance harness passes `siblingTemplatesRegistered: true` (#2205).
  'static-array-from-props-with-component': [
    {
      code: 'BF101',
      severity: 'error',
      issue: 'https://github.com/piconic-ai/barefootjs/issues/2321',
    },
  ],
  // #2038: a filter predicate whose body contains a NESTED callback call
  // (`t => !picked().some(p => …)` / `t => picked().find(p => …)`). Blade
  // has no inline comprehension-with-nested-callback form usable from the
  // evaluator-JSON `*_eval` payload mechanism (this adapter's ONLY
  // higher-order-callback lowering path — see `blade-adapter.ts`'s file
  // header, divergence 3), so the compiler is loud (BF101) instead of
  // lossy, same as Jinja. The `/* @client */` twin
  // (`filter-nested-callback-predicate-client`) has no pin here: it must
  // render clean on every adapter, which asserts the suppression contract.
  // Faithful lowering tracked: https://github.com/piconic-ai/barefootjs/issues/2320 (successor to #2038)
  'filter-nested-callback-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2320' },
  ],
  'filter-nested-find-predicate': [{ code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2320' }],
  // NB: TOP-LEVEL `.find` / `.findIndex` / `.findLast` / `.findLastIndex`
  // (text position) are NOT pinned here — like Jinja (unlike mojo, which
  // refuses them), Blade lowers them to `$bf->find_eval` / `find_index_eval`
  // / etc. via the same evaluator-JSON mechanism as `.filter` / `.every` /
  // `.some`, so they render. Only the NESTED-in-a-predicate form above is
  // refused (#2038).
  // #2273: a method call on a prop typed as a built-in host rich type
  // (Date, Map, …) has no catalogued lowering in any adapter — this is a
  // compiler-level refusal (`checkRichTypeMethodCalls`, wired ahead of
  // `adapter.generate()`), not an adapter-specific gap, so it is pinned
  // identically across every adapter package including Hono.
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2356' }],
  // #2648: a Map-typed prop used by this component's own client code (a
  // handler, an effect) cannot survive the bf-p JSON boundary intact --
  // BF021 only walks template-lowered expression positions, so a handler
  // body's `data.get(...)` is just as invisible to it as a bare read; this
  // is a distinct compiler-level refusal (checkRichTypePropSerialization),
  // pinned identically on every adapter for the same reason
  // date-method-uncatalogued is: a hydration-transport gap, not a
  // template-lowering gap, so it recurs on Hono's JS-runtime hydrate leg
  // exactly as much as on a DSL adapter's.
  'rich-prop-client-read': [{ code: 'BF049', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2648' }],
}
