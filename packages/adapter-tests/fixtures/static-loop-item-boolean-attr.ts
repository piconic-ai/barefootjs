import { createFixture } from '../src/types'

/**
 * A static array's `.map()` row sets a boolean HTML attribute (`disabled`)
 * from the item itself. Found during #2898's review: `elementAttrEmitter`'s
 * `emitExpression` routes EVERY boolean-attribute value (`isBooleanAttr(name)`,
 * `go-template-adapter.ts`) through `convertConditionToGo` — the SAME method
 * #2898 taught to consult `staticLoopItemStack` — even when the attribute's
 * own expression is a plain member read (`item.disabled`), not a `conditional`
 * IR node. `analyzeBakeableStaticElementLoop`'s `isFoldableAttrs` already
 * accepted this shape pre-#2898 (a `member`-kind attr expression is on its
 * allowlist), so it reached the per-item unrolled render path — where, before
 * #2898, `convertConditionToGo` had no unrolled-body awareness at all and
 * resolved `item` through the normal (wrong, no-`{{range}}`) dot-context
 * lowering, a PRE-EXISTING silent divergence #2898 fixes as a side effect of
 * its `staticLoopItemStack` check, not something #2898 set out to fix.
 *
 * Also refuses on Mojolicious and Xslate, for the SAME #2911 reason as
 * `static-loop-item-conditional`: the item shape's `disabled: boolean`
 * field makes the whole array unbakeable on those two Perl-backed
 * adapters. Escape twins below mirror that fixture's.
 */
export const fixture = createFixture({
  id: 'static-loop-item-boolean-attr',
  description: "static array's .map() row boolean attribute keyed off the item itself renders per item (#2898)",
  escapes: [
    { kind: 'prop-precompute', fixture: 'static-loop-item-boolean-attr-precomputed' },
    { kind: 'client-directive', fixture: 'static-loop-item-boolean-attr-client' },
  ],
  source: `
type Item = { id: number; label: string; disabled: boolean }

export function StaticLoopItemBooleanAttr() {
  const items: Item[] = [
    { id: 1, label: 'Alpha', disabled: true },
    { id: 2, label: 'Beta', disabled: false },
  ]
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          <button type="button" disabled={item.disabled}>{item.label}</button>
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="1"><button bf="s1" disabled type="button"><!--bf:s0-->Alpha<!--/--></button></li>
      <li data-key="2"><button bf="s1" type="button"><!--bf:s0-->Beta<!--/--></button></li>
    </ul>
  `,
})
