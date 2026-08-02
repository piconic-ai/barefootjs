import { createFixture } from '../src/types'

/**
 * A destructured `.map()` callback param whose binding drives a ternary
 * CONDITION inside the row (`({ label, active }) => active ? … : …`).
 *
 * Text positions resolve the destructured bindings correctly on every
 * adapter, but the Go adapter's `renderConditionExpr` consults a
 * narrower set of its loop-scope stacks than `identifierToGoRef`
 * (it omits `loopBindingStack`, which is exactly the stack destructured
 * bindings live on) — so the condition emits the parent-scope
 * `{{if $.Active}}` instead of the row's binding, and every row renders
 * the same branch (or errors at execute time when the root has no such
 * field). See the audit trail in #2482.
 */
export const fixture = createFixture({
  id: 'loop-destructured-param-condition',
  description: 'Destructured .map() param binding used as a row ternary condition stays row-scoped',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function DestructuredCondRows({ rows }: { rows: { id: number; label: string; active: boolean }[] }) {
  const [n, setN] = createSignal(0)
  return (
    <ul data-n={n()} onClick={() => setN(n() + 1)}>
      {rows.map(({ id, label, active }) => (
        <li key={id}>{active ? <b>{label}</b> : <i>{label}</i>}</li>
      ))}
    </ul>
  )
}
`,
  props: { rows: [{ id: 1, label: 'one', active: true }, { id: 2, label: 'two', active: false }] },
  expectedHtml: `
    <ul bf-s="test" bf="s3" data-n="0">
      <li data-key="1"><b bf-c="s0"><!--bf:s1-->one<!--/--></b></li>
      <li data-key="2"><i bf-c="s0"><!--bf:s2-->two<!--/--></i></li>
    </ul>
  `,
})
