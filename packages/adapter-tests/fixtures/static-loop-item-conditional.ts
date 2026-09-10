import { createFixture } from '../src/types'

/**
 * `static-loop-conditional` (#2898) covers an ITEM-INDEPENDENT condition
 * (a signal call, same value for every row). This fixture covers the other
 * half `classifyBakedCondition` (`static-element-loop-bake.ts`) has to
 * classify: a condition that reads the LOOP ITEM itself (`item.active`),
 * which must resolve to a per-item Go literal at bake time rather than fall
 * through to the normal reactive `{{if}}` lowering (there is no `{{range}}`
 * dot-context inside a #2224 per-item unrolled body for `item` to resolve
 * against). Also covers a per-item conditional's `null` branch (`item.note`)
 * — a `resolved.value` of `null` must still classify as `literal` (Go
 * `false`), matching JS truthiness rather than `resolvesToScalar`'s
 * text/attr-value notion of "printable".
 */
export const fixture = createFixture({
  id: 'static-loop-item-conditional',
  description: "static array's .map() row conditional keyed off the item itself bakes to a per-item Go literal (#2898)",
  source: `
type Item = { id: number; label: string; active: boolean; note: string | null }

export function StaticLoopItemConditional() {
  const items: Item[] = [
    { id: 1, label: 'Alpha', active: true, note: 'first' },
    { id: 2, label: 'Beta', active: false, note: null },
  ]
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          <span>{item.label}</span>
          {item.active ? <b>on</b> : <i>off</i>}
          {item.note ? <em>{item.note}</em> : null}
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s4">
      <li data-key="1">
        <span><!--bf:s0-->Alpha<!--/--></span>
        <b bf-c="s1">on</b>
        <em bf-c="s2"><!--bf:s3-->first<!--/--></em>
      </li>
      <li data-key="2">
        <span><!--bf:s0-->Beta<!--/--></span>
        <i bf-c="s1">off</i>
        <!--bf-cond-start:s2-->
        <!--bf-cond-end:s2-->
      </li>
    </ul>
  `,
})
