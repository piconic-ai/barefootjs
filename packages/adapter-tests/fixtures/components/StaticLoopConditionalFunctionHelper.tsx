'use client'

// Test fixture (#3912): a static (non-signal) array's `.map()` row
// conditional whose condition reads a signal only THROUGH a local helper. The
// three lists spell the same helper as an expression arrow, a block-bodied
// arrow, and a `function` declaration; all three must switch branches when the
// signal changes.

import { createSignal } from '@barefootjs/client'

interface Item {
  id: string
}

export function StaticLoopConditionalFunctionHelper() {
  const items: Item[] = [{ id: 'a' }, { id: 'b' }]
  const [sel, setSel] = createSignal('a')

  const isSelArrow = (id: string) => sel() === id
  const isSelBlock = (id: string) => {
    const s = sel()
    return s === id
  }
  function isSelFn(id: string) {
    const s = sel()
    return s === id
  }

  return (
    <div>
      <button type="button" class="pick-b" onClick={() => setSel('b')}>
        pick b
      </button>
      <button type="button" class="pick-a" onClick={() => setSel('a')}>
        pick a
      </button>
      <ul class="arrow">
        {items.map(it => (
          <li key={it.id}>{isSelArrow(it.id) ? <b>on</b> : <i>off</i>}</li>
        ))}
      </ul>
      <ul class="block">
        {items.map(it => (
          <li key={it.id}>{isSelBlock(it.id) ? <b>on</b> : <i>off</i>}</li>
        ))}
      </ul>
      <ul class="fn">
        {items.map(it => (
          <li key={it.id}>{isSelFn(it.id) ? <b>on</b> : <i>off</i>}</li>
        ))}
      </ul>
    </div>
  )
}
