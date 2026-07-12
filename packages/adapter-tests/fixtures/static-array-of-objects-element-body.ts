import { createFixture } from '../src/types'

/**
 * Static array-of-objects local const, mapped over a PLAIN ELEMENT body (no
 * child component) — #2224 shape 1, the narrower gap #2208 left refused on
 * the Go template adapter. Hono / the 7 other template adapters already
 * handle this (their loop header just splices a serialized literal, #2208);
 * Go has no `{{range}}` source form for a compile-time-only array, so it
 * unrolls the body once per item instead — see
 * `packages/adapter-go-template/src/adapter/analysis/static-element-loop-bake.ts`.
 */
export const fixture = createFixture({
  id: 'static-array-of-objects-element-body',
  description: 'Static array-of-objects local const mapped over a plain element body (#2224)',
  source: `
export function StaticList() {
  const items = [{ label: 'Alpha' }, { label: 'Beta' }]
  return (
    <ul>
      {items.map(item => (
        <li key={item.label}>{item.label}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="Alpha"><!--bf:s0-->Alpha<!--/--></li>
      <li data-key="Beta"><!--bf:s0-->Beta<!--/--></li>
    </ul>
  `,
})
