import { createFixture } from '../src/types'

/**
 * A `.map()` callback body with a leading `const` preamble before an if/else
 * branch — `{ const label = fmt(it); if (it.on) return <b/>; return <span/> }`.
 * Stage 2 of `spec/callback-fidelity.md`: every adapter folds this into a
 * nested `IRConditional` and emits the preamble once per iteration, so the
 * local is in scope in both branches.
 *
 * **Every adapter renders it now (#2447).** It used to be adapter-gated —
 * Hono/CSR folded and ran it, and every DSL adapter refused with BF021 on the
 * premise that a loop-local cannot be carried into a conditional branch
 * template. That premise stopped holding once a value preamble lowers to
 * per-row locals: the fold puts the conditional INSIDE the loop body, so a
 * local declared ahead of it is in scope in both arms
 * (`{{$label := bf_upper .Kind}}{{if .On}}…{{$label}}…`). The BF021 pins are
 * gone from all eight DSL adapters, and this fixture is now the cross-adapter
 * proof of that: if the per-row declaration stops being emitted, the labels
 * render empty here on whichever backend regressed.
 *
 * What is still refused is a preamble that is not a sequence of value
 * declarations (an assignment, an imperative loop, a destructure) — nothing
 * lowers, so both branches would read an unassigned name. That shape keeps
 * BF021 + the `/* @client *\/` escape, exercised in
 * `packages/jsx/src/__tests__/preamble-declarations.test.ts`.
 */
export const fixture = createFixture({
  id: 'map-preamble-branch-body',
  description: 'const preamble + if/else as a .map() body — folded, with the preamble as a per-row local',
  source: `
function MapPreambleBranch({ items }: { items: { id: string; on: boolean; kind: string }[] }) {
  return (
    <ul>
      {items.map((it) => {
        const label = it.kind.toUpperCase()
        if (it.on) return <b key={it.id}>{label}</b>
        return <span key={it.id}>{label}</span>
      })}
    </ul>
  )
}
export { MapPreambleBranch }
`,
  props: { items: [{ id: '1', on: true, kind: 'a' }, { id: '2', on: false, kind: 'b' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <b bf-c="s0" data-key="1"><!--bf:s1-->A<!--/--></b>
      <span bf-c="s0" data-key="2"><!--bf:s2-->B<!--/--></span>
    </ul>
  `,
})
