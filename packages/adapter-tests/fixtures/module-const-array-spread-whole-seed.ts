import { createFixture } from '../src/types'

/**
 * #3979: a signal seeded with a whole module-level array of rows that spreads
 * another literal array const (`createSignal<Row[]>(ALL)`), rendered by a loop.
 */
export const fixture = createFixture({
  id: 'module-const-array-spread-whole-seed',
  description: 'A signal seeded with a module-level array of rows built with a spread renders every row (#3979)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
interface Row {
  id: number
  label: string
}
const BASE: Row[] = [{ id: 1, label: 'Alpha' }]
const ALL: Row[] = [...BASE, { id: 2, label: 'Bravo' }]
export function ModuleConstArraySpreadWholeSeed() {
  const [rows] = createSignal<Row[]>(ALL)
  return <ul>{rows().map(row => <li key={row.id}>{row.label}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="1"><!--bf:s0-->Alpha<!--/--></li>
      <li data-key="2"><!--bf:s0-->Bravo<!--/--></li>
    </ul>
  `,
})
