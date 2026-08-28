import { createFixture } from '../src/types'

/**
 * A hyphenated custom element as a FRAGMENT-ROOTED child component's own
 * root, used as a keyed `.map()` row.
 *
 * `custom-element-tag` already pins custom elements as a supported
 * feature, but only as a component's top-level root — a shape whose
 * attributes the codegen places structurally, so it never reaches the
 * string splice this fixture exercises. A fragment-rooted row does: its
 * `data-key` is spliced onto the first tag by `renderChild`
 * (`spliceAttrsAfterFirstTag`, component.ts), which matched the tag name
 * with `\w+`. That stops at the hyphen, so the attribute landed in the
 * MIDDLE of the name — `<my data-key="1"-widget widget-id="w">` — and the
 * element vanished from the parsed DOM. SSR emits the same attribute as a
 * compiler-placed JSX spread and was always correct, so the two legs
 * diverged with no diagnostic.
 *
 * Verified to fail before the fix: reverting the tag-name pattern makes
 * the CSR leg produce the corrupted markup above while `expectedHtml`
 * (generated from the always-correct SSR reference) stays as below.
 */
export const fixture = createFixture({
  id: 'custom-element-child-loop-row',
  description: 'Fragment-rooted custom-element child component as a keyed .map() row',
  componentName: 'CustomElementChildLoopRow',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; label: string }
function WidgetRow(props: { item: Item }) {
  return <><my-widget widget-id={props.item.label}>{props.item.label}</my-widget></>
}
export function CustomElementChildLoopRow(props: { items: Item[] }) {
  const [items] = createSignal<Item[]>(props.items)
  return (
    <div>
      {items().map(item => (
        <WidgetRow key={item.id} item={item} />
      ))}
    </div>
  )
}
`,
  props: {
    items: [
      { id: 1, label: 'alpha' },
      { id: 2, label: 'beta' },
    ],
  },
  expectedHtml: `
    <div bf-s="test" bf="s1">
      <my-widget bf="s1" data-key="1" widget-id="alpha"><!--bf:s0-->alpha<!--/--></my-widget>
      <my-widget bf="s1" data-key="2" widget-id="beta"><!--bf:s0-->beta<!--/--></my-widget>
    </div>
  `,
})
