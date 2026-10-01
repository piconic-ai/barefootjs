import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'optional-computed-filter-presence',
  description: 'Optional computed filter reads distinguish absent objects from present false fields',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Meta = { active: boolean }
type Row = { id: number; meta?: Meta; inline?: { active: boolean } }
export function OptionalComputedFilterPresence(props: { rows: Row[]; meta?: Meta }) {
  const [localRows] = createSignal<Row[]>([
    { id: 4 },
    { id: 5, meta: { active: false }, inline: { active: false } },
    { id: 6, meta: { active: true }, inline: { active: true } },
  ])
  return <div>
    <ul>{props.rows.filter(_ => _.meta?.['active'] === false && _.inline?.['active'] === false)
      .map(row => <li key={row.id}>{row.id}</li>)}</ul>
    <ul>{localRows().filter(bf_lookup => bf_lookup.meta?.['active'] === false && bf_lookup.inline?.['active'] === false)
      .map(row => <li key={row.id}>{row.id}</li>)}</ul>
    <span>{props.meta?.['active'] === false ? 'false' : 'missing'}</span>
    <span>{false === props.meta?.['active'] ? 'false' : 'missing'}</span>
    <span>{props.meta?.['active'] !== false ? 'missing' : 'false'}</span>
  </div>
}
`,
  props: { rows: [
    { id: 1 },
    { id: 2, meta: { active: false }, inline: { active: false } },
    { id: 3, meta: { active: true }, inline: { active: true } },
    { id: 7, meta: { active: false } },
    { id: 8, inline: { active: false } },
  ] },
  dataPoints: [
    { name: 'empty', props: { rows: [] } },
    { name: 'present-false', props: { rows: [], meta: { active: false } } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1"><li data-key="2"><!--bf:s0-->2<!--/--></li></ul>
      <ul bf="s3"><li data-key="5"><!--bf:s2-->5<!--/--></li></ul>
      <span bf="s5"><!--bf-cond-start:s4-->missing<!--bf-cond-end:s4--></span>
      <span bf="s7"><!--bf-cond-start:s6-->missing<!--bf-cond-end:s6--></span>
      <span bf="s9"><!--bf-cond-start:s8-->missing<!--bf-cond-end:s8--></span>
    </div>
  `,
})
