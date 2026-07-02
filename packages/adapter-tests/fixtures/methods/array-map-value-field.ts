import { createFixture } from '../../src/types'

/**
 * Value-producing `.map(cb)` with a member-access projection (#2073).
 *
 * Each item projects to its `name` field and the results join with a comma —
 * the simplest value-`.map` shape. Lowered via the runtime evaluator
 * (`map_eval`), one result per element with no flatten (unlike `.flatMap`).
 */
export const fixture = createFixture({
  id: 'array-map-value-field',
  description: '.map(u => u.name).join(", ") renders the projected field list',
  source: `
function NameList({ users }: { users: { name: string }[] }) {
  return <div>{users.map((u) => u.name).join(', ')}</div>
}
export { NameList }
`,
  props: { users: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Alan' }] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->Ada, Grace, Alan<!--/--></div>
  `,
})
