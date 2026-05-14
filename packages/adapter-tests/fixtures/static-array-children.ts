import { createFixture } from '../src/types'

/**
 * Static array of child components imported from a sibling .tsx file.
 *
 * Hono renders the JSX directly — the child component reference
 * resolves to the imported function symbol at request time, so the
 * output is the fully materialised HTML. SSR text-template adapters
 * emit a cross-template call (e.g. `{{template "ListItem" .}}`) that
 * resolves only if the user has compiled the sibling file and
 * registered the resulting template on the same template instance —
 * otherwise the request fails with `template: "ListItem" is undefined`
 * or the adapter's equivalent. Adapters that can't transparently
 * handle that assert the corresponding refusal via
 * `expectedDiagnostics` on their own test file (#1266).
 */
export const fixture = createFixture({
  id: 'static-array-children',
  description: 'Static array with child components preserves className (#483)',
  source: `
import { ListItem } from './list-item'
export function StaticList() {
  const items = [{ label: 'Alpha' }, { label: 'Beta' }]
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
      <li class="text-sm" bf-s="ListItem_*" data-key="Alpha" bf="s1"><!--bf:s0-->Alpha<!--/--></li>
      <li class="text-sm" bf-s="ListItem_*" data-key="Beta" bf="s1"><!--bf:s0-->Beta<!--/--></li>
    </ul>
  `,
})
