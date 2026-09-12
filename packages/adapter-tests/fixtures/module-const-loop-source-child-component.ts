import { createFixture } from '../src/types'

/**
 * #2946 sibling: same module-scope static array shape as
 * `module-const-loop-source`, but the `.map()` body is a sibling CHILD
 * COMPONENT rather than a plain element. This exercises the Go adapter's
 * per-item-props BAKING path specifically (`analyzeBakeableStaticChildLoop`
 * / `getBakedStaticChildLoop`), which is reached through the same
 * `resolveStaticLoopSource` fix but was otherwise untested for a
 * module-scope array — see the `#2835` unit test in
 * `packages/adapter-go-template/src/__tests__/go-template-adapter.test.ts`,
 * which pinned the pre-fix (unbaked) lowering for this exact shape and had
 * to be updated alongside the fix.
 */
export const fixture = createFixture({
  id: 'module-const-loop-source-child-component',
  description: 'A module-scope const array `.map()`\'d over a child component renders on every adapter (#2946)',
  source: `
import { ListItem } from './list-item'

const items = [{ label: 'Alpha' }, { label: 'Beta' }]

export function ModuleConstLoopSourceChildComponent() {
  return (
    <ul>
      {items.map(item => (
        <ListItem key={item.label} label={item.label} className="text-sm" />
      ))}
    </ul>
  )
}
`,
  components: {
    './list-item.tsx': `
export function ListItem({ label, className }: { label: string; className?: string }) {
  return <li className={className}>{label}</li>
}
`,
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li bf-s="ListItem_*" bf="s1" class="text-sm" data-key="Alpha"><!--bf:s0-->Alpha<!--/--></li>
      <li bf-s="ListItem_*" bf="s1" class="text-sm" data-key="Beta"><!--bf:s0-->Beta<!--/--></li>
    </ul>
  `,
})
