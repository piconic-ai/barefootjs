import { createFixture } from '../src/types'

/**
 * A `.map()` callback whose body is an **if / else-if chain** returning a
 * different element per branch. Before Stage 2 of `spec/callback-fidelity.md`
 * this fell through the block-body arm's single-return path: the trailing
 * `return <C/>` claimed the loop body and the leading `if (...) return <A/>`
 * leaked verbatim into the map callback (uncompiled JSX / ReferenceError at
 * hydration). It now folds to a nested `IRConditional` — neutral IR that
 * renders on **every** backend (no `/* @client *\/` needed), so this is a
 * positive cross-adapter fixture with no `conformancePins`.
 */
export const fixture = createFixture({
  id: 'map-if-chain-body',
  description: 'if/else-if chain as a .map() callback body folds to nested IRConditional',
  source: `
function MapIfChain({ items }: { items: { id: string; kind: string }[] }) {
  return (
    <ul>
      {items.map((it) => {
        if (it.kind === 'a') return <li key={it.id}>A:{it.id}</li>
        else if (it.kind === 'b') return <li key={it.id}>B:{it.id}</li>
        return <li key={it.id}>C:{it.id}</li>
      })}
    </ul>
  )
}
export { MapIfChain }
`,
  props: { items: [{ id: '1', kind: 'a' }, { id: '2', kind: 'b' }, { id: '3', kind: 'z' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s5"><!--bf-loop:l0--><li bf-c="s3" data-key="1">A:<!--bf:s4-->1<!--/--></li><!--bf-cond-start:s3--><li bf-c="s1" data-key="2">B:<!--bf:s2-->2<!--/--></li><!--bf-cond-end:s3--><!--bf-cond-start:s3--><li bf-c="s1" data-key="3">C:<!--bf:s0-->3<!--/--></li><!--bf-cond-end:s3--><!--bf-/loop:l0--></ul>
  `,
})
