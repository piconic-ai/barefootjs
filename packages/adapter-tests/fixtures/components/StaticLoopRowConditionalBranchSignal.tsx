'use client'

// Test fixture (#3911): a static (non-signal) array's `.map()` row holds a
// conditional whose CONDITION reads only the row (`r.kind === 'on'`), while a
// BRANCH needs something wired. The row's branch decision never changes, so
// the static-array path used to bake the whole row and wire nothing inside
// the conditional. Each list isolates one thing a branch can hold: a text
// reading a signal (in either arm), an attribute, a memo read, a prop read, a
// nested conditional whose own condition reads the signal, and an event
// handler. `static` is the control: a row-only condition with static
// branches, which keeps the compile-time static path.

import { createMemo, createSignal } from '@barefootjs/client'

interface Row {
  id: string
  kind: string
}

export function StaticLoopRowConditionalBranchSignal(props: { label?: string }) {
  const rows: Row[] = [
    { id: 'a', kind: 'on' },
    { id: 'b', kind: 'off' },
  ]
  const [n, setN] = createSignal(0)
  const doubled = createMemo(() => n() * 2)

  return (
    <div>
      <button type="button" class="inc" onClick={() => setN(n() + 1)}>
        inc
      </button>
      <ul class="text">
        {rows.map(r => (
          <li key={r.id}>{r.kind === 'on' ? <b>{'n=' + n()}</b> : <i>off</i>}</li>
        ))}
      </ul>
      <ul class="attr">
        {rows.map(r => (
          <li key={r.id}>{r.kind === 'on' ? <b title={'n=' + n()}>attr</b> : <i>off</i>}</li>
        ))}
      </ul>
      <ul class="else">
        {rows.map(r => (
          <li key={r.id}>{r.kind === 'on' ? <b>on</b> : <i>{'off ' + n()}</i>}</li>
        ))}
      </ul>
      <ul class="memo">
        {rows.map(r => (
          <li key={r.id}>{r.kind === 'on' ? <b>{'d=' + doubled()}</b> : <i>off</i>}</li>
        ))}
      </ul>
      <ul class="prop">
        {rows.map(r => (
          <li key={r.id}>{r.kind === 'on' ? <b>{props.label ?? 'none'}</b> : <i>off</i>}</li>
        ))}
      </ul>
      <ul class="nested">
        {rows.map(r => (
          <li key={r.id}>{r.kind === 'on' ? (n() > 0 ? <b>some</b> : <em>zero</em>) : <i>off</i>}</li>
        ))}
      </ul>
      <ul class="event">
        {rows.map(r => (
          <li key={r.id}>
            {r.kind === 'on' ? (
              <button type="button" class="add" onClick={() => setN(n() + 10)}>
                add
              </button>
            ) : (
              <i>off</i>
            )}
          </li>
        ))}
      </ul>
      <ul class="static">
        {rows.map(r => (
          <li key={r.id}>{r.kind === 'on' ? <b>on</b> : <i>off</i>}</li>
        ))}
      </ul>
    </div>
  )
}
