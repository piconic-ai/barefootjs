import { createFixture } from '../src/types'

/**
 * A nested loop whose INNER body reads the OUTER loop binding
 * (`group.name` inside the `items` map). `map-nested` pins plain
 * nesting; this pins cross-scope variable capture — template
 * languages with per-loop context stacks (Go's `.`-rebinding, Twig's
 * loop scope) must alias the outer binding to survive the inner loop.
 */
export const fixture = createFixture({
  id: 'nested-loop-outer-binding',
  description: 'Inner loop body reads the outer loop variable',
  source: `
type Group = { name: string; items: string[] }
function NestedLoopOuterBinding({ groups }: { groups: Group[] }) {
  return (
    <ul>
      {groups.map(group => (
        <li key={group.name}>
          {group.items.map(item => (
            <span key={item}>{group.name}/{item} </span>
          ))}
        </li>
      ))}
    </ul>
  )
}
export { NestedLoopOuterBinding }
`,
  props: {
    groups: [
      { name: 'fruits', items: ['apple', 'plum'] },
      { name: 'nuts', items: ['pecan'] },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li bf="s2" data-key="fruits">
        <span data-key-1="apple"><!--bf:s0-->fruits<!--/-->/<!--bf:s1-->apple<!--/--></span>
        <span data-key-1="plum"><!--bf:s0-->fruits<!--/-->/<!--bf:s1-->plum<!--/--></span>
      </li>
      <li bf="s2" data-key="nuts"><span data-key-1="pecan"><!--bf:s0-->nuts<!--/-->/<!--bf:s1-->pecan<!--/--></span></li>
    </ul>
  `,
})
