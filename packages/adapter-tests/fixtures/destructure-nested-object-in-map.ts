import { createFixture } from '../src/types'

/**
 * Nested object-path destructure in a `.map()` callback, no rest
 * (`{ id, user: { name } } => …`).
 *
 * Companion to `destructure-array-index-in-map`: that fixture pins the
 * array-index `segments` shape (`{ kind: 'index', index }`); this one pins
 * the nested `.field` shape (`{ kind: 'field', key: 'user', isIdent: true }`
 * followed by `{ kind: 'field', key: 'name', isIdent: true }`) — two levels
 * deep, still no rest. #2087 Phase A threads this structured path through
 * `LoopParamBinding.segments` so adapters can build a native nested
 * accessor without string-parsing `path`.
 *
 * Hono / CSR already lowered nested fixed-path destructure pre-#2087 (the
 * client-JS emit path is unchanged). All seven template adapters lower it
 * via their `segments`-based accessor emitters; none pin a diagnostic.
 */
export const fixture = createFixture({
  id: 'destructure-nested-object-in-map',
  description: 'Nested object-path destructure in .map() callback, no rest (#2087)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Row = { id: string; user: { name: string } }
export function NestedNames() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 'r1', user: { name: 'Ada' } },
    { id: 'r2', user: { name: 'Grace' } },
  ])
  return (
    <ul onClick={() => setRows(r => r)}>
      {rows().map(({ id, user: { name } }) => (
        <li key={id}>{name}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="r1"><!--bf:s0-->Ada<!--/--></li>
      <li data-key="r2"><!--bf:s0-->Grace<!--/--></li>
    </ul>
  `,
})
