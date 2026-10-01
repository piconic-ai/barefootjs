import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'optional-computed-filter-predicate',
  description: 'Optional literal index and punctuation key reads inside a filter predicate',
  source: `
'use client'
type Row = { id: number; values?: number[]; meta?: { 'data-x': number; "it's": number } }
export function OptionalComputedFilterPredicate(props: { rows: Row[] }) {
  return <ul>{props.rows.filter(row =>
    (row?.['id'] ?? 0) > 0 && (row.values?.[0] ?? 0) > 0 && (row.meta?.['data-x'] ?? 0) > 0 && (row.meta?.["it's"] ?? 0) > 0
  ).map(row => <li key={row.id}>{row.id}</li>)}</ul>
}
`,
  props: { rows: [
    { id: 1, values: [2], meta: { 'data-x': 3, "it's": 4 } },
    { id: 2 },
    { id: 3, values: [0], meta: { 'data-x': 3, "it's": 4 } },
  ] },
  dataPoints: [{ name: 'empty', props: { rows: [] } }],
  expectedHtml: `
    <ul bf-s="test" bf="s1"><li data-key="1"><!--bf:s0-->1<!--/--></li></ul>
  `,
})
