'use client'

// Test fixture (#3912): a static (non-signal) array's `.map()` row
// conditional whose condition calls a local helper and names nothing else:
// no row binding, no signal. The helper reads a signal, so every row has to
// switch when it changes. The two lists spell the helper as a `function`
// declaration and as a zero-argument arrow.

import { createSignal } from '@barefootjs/client'

interface Item {
  id: string
}

export function StaticLoopConditionalRowIndependentHelper() {
  const items: Item[] = [{ id: 'a' }, { id: 'b' }]
  const [n, setN] = createSignal(0)

  function isOnFn() {
    return n() > 0
  }
  const isOnArrow = () => n() > 0

  return (
    <div>
      <button type="button" class="inc" onClick={() => setN(n() + 1)}>
        inc
      </button>
      <button type="button" class="reset" onClick={() => setN(0)}>
        reset
      </button>
      <ul class="fn">
        {items.map(it => (
          <li key={it.id}>{isOnFn() ? <b>on</b> : <i>off</i>}</li>
        ))}
      </ul>
      <ul class="arrow">
        {items.map(it => (
          <li key={it.id}>{isOnArrow() ? <b>on</b> : <i>off</i>}</li>
        ))}
      </ul>
    </div>
  )
}
