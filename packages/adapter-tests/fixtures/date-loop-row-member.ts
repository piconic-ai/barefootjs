import { createFixture } from '../src/types'

/**
 * A catalogued `Date` accessor called on a loop row's member
 * (`r.at.getUTCFullYear()` inside `rows.map(r => …)`). The Date lowering
 * resolves its receiver through props only (its matcher runs in the
 * adapters, which carry no loop-row types), so the read is refused with
 * BF021 on every adapter, Hono included: the refusal fires in the compiler
 * ahead of `adapter.generate()`. The diagnostic names the loop row binding
 * rather than claiming the method has no catalogued lowering (#3972). The
 * element type's spelling (alias, inline object, inline intersection) and a
 * destructured row (`({ at }) => …`) all take the same refusal; those
 * siblings are pinned in `packages/jsx/src/__tests__/date-lowering.test.ts`.
 */
export const fixture = createFixture({
  id: 'date-loop-row-member',
  description: 'A catalogued Date accessor on a loop row member refuses with BF021 naming the loop row',
  escapes: [
    { kind: 'prop-precompute', fixture: 'date-loop-row-member-precomputed' },
    { kind: 'client-directive', fixture: 'date-loop-row-member-client' },
  ],
  source: `
type Row = { id: string; at: Date }
export function DateLoopRowMember(props: { rows: Row[] }) {
  return <ul>{props.rows.map(r => <li key={r.id}>{r.at.getUTCFullYear()}</li>)}</ul>
}
`,
  props: { rows: [{ id: 'a', at: '2024-01-01T00:00:00.000Z' }, { id: 'b', at: '2025-06-15T12:00:00.000Z' }] },
})
