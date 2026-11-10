import { createFixture } from '../src/types'

/**
 * Sibling of `module-const-array-child-prop`: a module array of objects
 * (`ITEMS`) passed whole as a child prop, which the child `.map()`s,
 * through a destructured child and a `function C(props)` child.
 */
export const fixture = createFixture({
  id: 'module-const-object-array-child-prop',
  description: 'a module array-of-objects const passed whole as a child prop reaches the child',
  source: `
import { ItemsKid, PropsItemsKid } from './items-kids'
const ITEMS = [{ id: 'x', label: 'Ex' }, { id: 'y', label: 'Why' }]
export function ModuleConstObjectArrayChildProp() {
  return (
    <div>
      <ItemsKid items={ITEMS} />
      <PropsItemsKid items={ITEMS} />
    </div>
  )
}
`,
  components: {
    './items-kids.tsx': `
export function ItemsKid({ items }: { items: { id: string; label: string }[] }) {
  return <ul>{items.map(it => <li key={it.id} data-id={it.id}>{it.label}</li>)}</ul>
}
export function PropsItemsKid(props: { items: { id: string; label: string }[] }) {
  return <ol data-n={props.items.length}>{props.items.map(it => <li key={it.id}>{it.label}</li>)}</ol>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf-s="test_s0" bf="s2">
        <li bf="s1" data-id="x" data-key="x"><!--bf:s0-->Ex<!--/--></li>
        <li bf="s1" data-id="y" data-key="y"><!--bf:s0-->Why<!--/--></li>
      </ul>
      <ol bf-s="test_s1" bf="s1" data-n="2">
        <li data-key="x"><!--bf:s0-->Ex<!--/--></li>
        <li data-key="y"><!--bf:s0-->Why<!--/--></li>
      </ol>
    </div>
  `,
})
