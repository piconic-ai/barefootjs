import { createFixture } from '../src/types'

/**
 * A catalogued Date method (`.toISOString()`) in ATTRIBUTE position, with NO
 * `/* @client *\/` directive at all (#2641's broader finding). `date-
 * catalogued` already pins this method in TEXT position; the SSR-lowering
 * half of attribute position was always correct (the static template
 * already lowers `data-iso={createdAt.toISOString()}` to the `date()` helper
 * via `jsx-to-ir.ts`'s `lowerDateCalls`), but the REACTIVE half —
 * `emitReactiveAttributeUpdates`'s `createEffect` that re-syncs the
 * attribute after hydrate — spliced the raw `.toISOString()` call verbatim,
 * same root cause as #2640/#2641's `/* @client *\/` sites, just with no
 * directive needed to trigger it. `makeCataloguedCallLowerer`
 * (`ir-to-client-js/emit-reactive.ts`) now covers this site unconditionally,
 * so both the static template AND the reactive re-sync effect route through
 * `date()`.
 *
 * Unlike the `/* @client *\/` fixtures above, this one DOES render at SSR
 * (no directive to defer it), so it carries real `dataPoints` like
 * `date-catalogued`.
 */
export const fixture = createFixture({
  id: 'date-catalogued-attr',
  description: 'A catalogued Date method (toISOString) in attribute position, no /* @client */ — reactive re-sync effect must also route through date()',
  source: `
export function DateCataloguedAttr({ createdAt }: { createdAt: Date }) {
  return <time data-iso={createdAt.toISOString()}>{createdAt.toISOString()}</time>
}
`,
  props: { createdAt: new Date('2024-01-01T00:00:00.000Z') },
  dataPoints: [{ name: 'midday', props: { createdAt: new Date('2024-06-15T13:45:30.000Z') } }],
  expectedHtml: `
    <time bf-s="test" bf="s1" data-iso="2024-01-01T00:00:00.000Z"><!--bf:s0-->2024-01-01T00:00:00.000Z<!--/--></time>
  `,
})
