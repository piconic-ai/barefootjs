import { createFixture } from '../src/types'

/**
 * A `.map()` nested THREE deep (`nested-loop-outer-binding` pins two
 * levels). Pins the `data-key-2` suffix specifically — a depth-suffix
 * mechanism that only handles one level of nesting (`data-key` /
 * `data-key-1`, hard-coded rather than counting) would pass the
 * two-level fixture but fail here.
 */
export const fixture = createFixture({
  id: 'nested-loop-triple-depth',
  description: 'Three levels of nested .map() pin the data-key-2 suffix',
  source: `
type Leaf = { id: string }
type Branch = { id: string; leaves: Leaf[] }
type Tree = { id: string; branches: Branch[] }
function NestedLoopTripleDepth({ trees }: { trees: Tree[] }) {
  return (
    <div>
      {trees.map(tree => (
        <section key={tree.id}>
          {tree.branches.map(branch => (
            <article key={branch.id}>
              {branch.leaves.map(leaf => (
                <span key={leaf.id}>{leaf.id}</span>
              ))}
            </article>
          ))}
        </section>
      ))}
    </div>
  )
}
export { NestedLoopTripleDepth }
`,
  props: {
    trees: [
      {
        id: 't1',
        branches: [
          { id: 'b1', leaves: [{ id: 'l1' }, { id: 'l2' }] },
        ],
      },
    ],
  },
  expectedHtml: `
    <div bf-s="test" bf="s3"><section bf="s2" data-key="t1"><article bf="s1" data-key-1="b1"><span data-key-2="l1"><!--bf:s0-->l1<!--/--></span><span data-key-2="l2"><!--bf:s0-->l2<!--/--></span></article></section></div>
  `,
})
