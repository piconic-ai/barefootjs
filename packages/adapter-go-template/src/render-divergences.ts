/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Go. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 *
 * (#2630's `static-array-from-props-with-component-precomputed` divergence
 * graduated once the harness (`test-render.ts`'s
 * `buildDynamicChildLoopSeeding`, despite the name — see its doc comment)
 * learned to seed a prop-backed static child-component loop's Props slice
 * the same way it already seeded a signal-backed dynamic one: the adapter's
 * own `emission` was never the bug, only this harness's route-handler
 * stand-in was missing the prop-derived case.)
 *
 * (#2703's `jsx-element-prop-fragment-conditional` divergence graduated by
 * reclassification, not a lowering fix: the underlying gap — a named
 * jsx-children prop whose value can't be baked into a static Go string
 * silently got no field at all, no diagnostic — is now a loud `BF101`
 * refusal (see `conformance-pins.ts`) instead of a silent wrong render.
 * "Compiles clean but renders divergent" no longer describes this fixture on
 * Go, so it moved off this table. Dynamic delivery for named jsx-children
 * props (the actual capability gap) is tracked separately at
 * https://github.com/piconic-ai/barefootjs/issues/2703.)
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  'children-passthrough-renamed':
    'A `children` prop destructured under a different name (`const { children: kids } = props`) does not reach the SSR template on Go, tracked as https://github.com/piconic-ai/barefootjs/issues/2788. The same fixture also fails on Mojolicious, where the mechanism IS isolated: the `.html.ep` interpolates the LOCAL alias (`$kids`) while the stash defines only the caller-facing `children`, so the Perl render dies inside `Mojo::Template::process`. Go\'s own failure mode has NOT been read — `go` is not reachable from the local test process (the conformance case prints "go command not found" and skips), so this entry is declared from the CI failure on #2787 alone, not from a local reproduction. Whoever graduates this should read Go\'s actual output first rather than assume it shares Mojo\'s mechanism. Same alias family as `aliased-destructured-prop` (`{ n: count }`), whose Go half graduated in #2525 — worth checking whether the reserved `children` slot bypasses that fix or never had it. `children-passthrough-renamed` asserts the CORRECT (Hono-generated) output, so deleting this entry is the graduation.',
  'signal-object-spread-init':
    'PRE-EXISTING, unrelated to the #2696 Step 2 spread work this fixture pins: a `derived`-classified signal/memo whose value is an OBJECT literal has no live-template-expression lowering on Go — unlike the other six template-stash backends (e.g. minijinja emits `{% set merged = dict(base, done=true) %}`), Go always bakes an object-typed signal/memo field into Go SOURCE at `NewXxxProps` constructor time (`convertInitialValue`/`parsedLiteralToGo`), and that baker is STATIC-only (identifier/call/member operands defer, `parsed-literal-to-go.ts`\'s own docstring) — it cannot reference a live prop at all. Reproduced identically with the spread REMOVED (`createSignal({ id: base.id, done: true })`), confirming the gap predates and is independent of spread: the signal seeds `nil` and every field read (`.Merged.ID`/`.Merged.Done`) reads the Go zero value regardless of `initialTodos`. Graduate by teaching the baker to emit prop-referencing Go expressions (https://github.com/piconic-ai/barefootjs/issues/2700).',
  'textarea-row-breakout':
    'A signal seeded from a bare identifier referencing a MODULE-LEVEL const (`const PAYLOAD = \'...\'; createSignal(PAYLOAD)`) bakes to `nil` in the generated `New<Component>Props` constructor instead of the const\'s literal value: `convertInitialValue` (`value-lowering.ts`) only resolves a direct prop reference or a literal expression for a bare identifier, and the analyzer types this signal `{ kind: \'unknown\' }`, so every typed branch falls through to the final `nil` fallback. `resolveModuleStringConst` exists on the adapter for exactly this resolution (used by `template-interp.ts` for live template expressions) but isn\'t wired into this signal-baking path. Unrelated to what this fixture exists to cover (#2765\'s loop-row textarea-escaping fix, verified correct here) — every other adapter renders the fixture\'s controlled `<textarea>` correctly. Tracked at https://github.com/piconic-ai/barefootjs/issues/2794; graduate by wiring `resolveModuleStringConst` into `convertInitialValue`\'s bare-identifier case.',
  'nested-loop-ref-const':
    'A signal-backed object array whose elements have a NESTED array-of-objects field (`children: [{...}]`, producing this fixture\'s depth-2 `.map()`) bakes to `nil` in `New<Component>Props`, leaving the whole `{{range .Items}}` body empty on real Go — `synthesizeStructFromSignal` (`go-template-adapter.ts`) only synthesizes a struct when EVERY property value is a scalar literal (`scalarParsedGoType`), so a `children` array property aborts synthesis for the entire signal; `parsedLiteralToGo` then has no named struct to bake an object-literal element against and falls through to `nil`. Reproduced identically with #2750\'s fix reverted, confirming this predates and is independent of #2750 (which only touches client-JS reachability, never SSR baking) — every other adapter (confirmed: Hono) renders the nested loop correctly. Tracked at https://github.com/piconic-ai/barefootjs/issues/2800; graduate by teaching `synthesizeStructFromSignal` to recursively synthesize a nested struct for an array-valued property instead of bailing to `null`.',
  'aliased-loop-source':
    'A `.map()` loop whose source is a local const alias of a signal getter (`const items__alias = items`) fails template execution on real Go (`can\'t evaluate field Items__alias in type main.AliasedLoopSourceProps`) — the zero-arg-call-to-field lowering routes `items__alias()` to a `.Items__alias` struct field that was never seeded, since seeding only knows about `items`, the real signal name; the alias hop is never resolved. This is the SSR-side twin of #2778 (fixed for the CSR client-JS template in the same PR that added this fixture) — that fix only touches client-JS emission, not Go\'s field-routing/seeding. Tracked at https://github.com/piconic-ai/barefootjs/issues/2813; graduate by resolving the alias hop at field-routing time using the same `resolveAliasOrigin`/`resolveGetterAliases` mechanism #2778 introduced, rather than a third alias-hop walker.',
}
