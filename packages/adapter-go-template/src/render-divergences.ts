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
 *
 * (#2700's `signal-object-spread-init` divergence graduated the same way —
 * by reclassification, not a lowering fix: a `derived` signal/memo's
 * object-literal initializer referencing a live prop/signal has no
 * live-template-expression lowering on Go, only a static constructor-time
 * baker — now a loud `BF101` refusal (`conformance-pins.ts`) with a
 * verified `/* @client *\/` escape twin (`signal-object-spread-init-client`),
 * instead of a silent wrong render. Teaching the baker to emit
 * prop-referencing Go expressions — the actual capability gap — stays
 * tracked at https://github.com/piconic-ai/barefootjs/issues/2700.)
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  'children-passthrough-renamed':
    'A `children` prop destructured under a different name (`const { children: kids } = props`) does not reach the SSR template on Go, tracked as https://github.com/piconic-ai/barefootjs/issues/2788. The same fixture also fails on Mojolicious, where the mechanism IS isolated: the `.html.ep` interpolates the LOCAL alias (`$kids`) while the stash defines only the caller-facing `children`, so the Perl render dies inside `Mojo::Template::process`. Go\'s own failure mode has NOT been read — `go` is not reachable from the local test process (the conformance case prints "go command not found" and skips), so this entry is declared from the CI failure on #2787 alone, not from a local reproduction. Whoever graduates this should read Go\'s actual output first rather than assume it shares Mojo\'s mechanism. Same alias family as `aliased-destructured-prop` (`{ n: count }`), whose Go half graduated in #2525 — worth checking whether the reserved `children` slot bypasses that fix or never had it. `children-passthrough-renamed` asserts the CORRECT (Hono-generated) output, so deleting this entry is the graduation.',
  'aliased-loop-source':
    'A `.map()` loop whose source is a local const alias of a signal getter (`const items__alias = items`) fails template execution on real Go (`can\'t evaluate field Items__alias in type main.AliasedLoopSourceProps`) — the zero-arg-call-to-field lowering routes `items__alias()` to a `.Items__alias` struct field that was never seeded, since seeding only knows about `items`, the real signal name; the alias hop is never resolved. This is the SSR-side twin of #2778 (fixed for the CSR client-JS template in the same PR that added this fixture) — that fix only touches client-JS emission, not Go\'s field-routing/seeding. Tracked at https://github.com/piconic-ai/barefootjs/issues/2813; graduate by resolving the alias hop at field-routing time using the same `resolveAliasOrigin`/`resolveGetterAliases` mechanism #2778 introduced, rather than a third alias-hop walker.',
}
