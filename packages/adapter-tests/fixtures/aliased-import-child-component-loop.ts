import { createFixture } from '../src/types'

/**
 * #2822 follow-up: the original `aliased-import-child-component` fixture
 * only covers a component referenced DIRECTLY (a single static child
 * instance). A `.map()` loop whose body is a single aliased child
 * component (`import { Label as AliasedLabel } from './label'`,
 * `items.map(item => <AliasedLabel .../>)`) is a structurally different
 * codegen path on adapters that generate a cross-file compile-time TYPE
 * for the child (only the Go template adapter, among the DSL adapters —
 * the others resolve a child purely by the cross-template CALL NAME,
 * whether static or loop-nested, through the same site already fixed for
 * #2822) — modeled on `static-array-children` (plain static array,
 * single child-component body, no destructuring/props complications)
 * with the import aliased.
 */
export const fixture = createFixture({
  id: 'aliased-import-child-component-loop',
  description:
    'A `.map()` loop whose body is a single child component referenced under an import alias must resolve ' +
    "every cross-file reference (constructor/type names, the cross-template call) to the child's own DECLARED " +
    'name, not the caller-local alias — the loop-body counterpart of `aliased-import-child-component` (#2822).',
  source: `
import { Label as AliasedLabel } from './label'
export function StaticList() {
  const items = [{ id: 'a', value: 'Alpha' }, { id: 'b', value: 'Beta' }]
  return (
    <ul>
      {items.map(item => (
        <AliasedLabel key={item.id} value={item.value} />
      ))}
    </ul>
  )
}
`,
  components: {
    './label.tsx': `
export function Label({ value }: { value: string }) {
  return <span>{value}</span>
}
`,
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <span bf-s="Label_*" bf="s1" data-key="a"><!--bf:s0-->Alpha<!--/--></span>
      <span bf-s="Label_*" bf="s1" data-key="b"><!--bf:s0-->Beta<!--/--></span>
    </ul>
  `,
})
