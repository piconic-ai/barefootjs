import { createFixture } from '../src/types'

/**
 * `static-loop-conditional` (#2898) covers an ITEM-INDEPENDENT condition
 * (a signal call, same value for every row). This fixture covers the other
 * half `classifyBakedCondition` (`static-element-loop-bake.ts`) has to
 * classify: a condition that reads the LOOP ITEM itself (`item.active`),
 * which must resolve to a per-item Go literal at bake time rather than fall
 * through to the normal reactive `{{if}}` lowering (there is no `{{range}}`
 * dot-context inside a #2224 per-item unrolled body for `item` to resolve
 * against).
 *
 * Also covers a per-item condition that resolves to `null` (`item.tag`) —
 * `evaluateStaticLiteral` returning `{ value: null }` must still classify
 * as `literal` (Go `false`), matching JS truthiness rather than
 * `resolvesToScalar`'s text/attr-value notion of "printable". Deliberately
 * keeps that branch's OWN content static (`<em>tagged</em>`, no `{item.tag}`
 * interpolation): `allExpressionsFoldFor` requires BOTH branches of a
 * conditional to resolve for EVERY item regardless of which one a given
 * item's condition selects (`renderConditional` always renders both arms
 * into `{{if}}…{{else}}…{{end}}` — Go never evaluates the unselected arm's
 * actions at request time, but the per-item bake still needs valid Go text
 * for it). A branch whose own content depends on the SAME nullable field
 * driving the condition (`item.tag ? <em>{item.tag}</em> : null`) would
 * correctly bail the whole loop for the item where that field is null,
 * since printing `null` isn't a resolvable scalar — that is a real BF101
 * refusal shape, not this fixture's.
 *
 * Refuses on Mojolicious and Xslate too, for an UNRELATED reason (#2911):
 * both Perl-backed adapters' own static-array bake deliberately refuses a
 * `boolean` value anywhere in the item shape (`active: boolean` here) —
 * Perl has no boolean literal. The diagnostic's own suggestion names a
 * prop-precompute/@client escape on every refusing adapter, verified by
 * the twins below.
 */
export const fixture = createFixture({
  id: 'static-loop-item-conditional',
  description: "static array's .map() row conditional keyed off the item itself bakes to a per-item Go literal (#2898)",
  escapes: [
    { kind: 'prop-precompute', fixture: 'static-loop-item-conditional-precomputed' },
    { kind: 'client-directive', fixture: 'static-loop-item-conditional-client' },
  ],
  source: `
type Item = { id: number; label: string; active: boolean; tag: string | null }

export function StaticLoopItemConditional() {
  const items: Item[] = [
    { id: 1, label: 'Alpha', active: true, tag: 'x' },
    { id: 2, label: 'Beta', active: false, tag: null },
  ]
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          <span>{item.label}</span>
          {item.active ? <b>on</b> : <i>off</i>}
          {item.tag ? <em>tagged</em> : null}
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li data-key="1">
        <span><!--bf:s0-->Alpha<!--/--></span>
        <b bf-c="s1">on</b>
        <em bf-c="s2">tagged</em>
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
