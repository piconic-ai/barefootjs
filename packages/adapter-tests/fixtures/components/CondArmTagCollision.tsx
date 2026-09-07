'use client'

// Test fixture (#2868): a reactive conditional branch (`{on() ? <A/> : <B/>}`)
// inside a keyed `.map()` row whose loop declares an item param named `b` —
// colliding with the FALSE branch's own root tag, `<b>`.
//
// The branch arm's own re-render `template()` builder used to be built by
// re-wrapping the branch's ALREADY-ASSEMBLED HTML string with a word-boundary
// regex meant to turn a bare loop-param reference into an accessor call
// (`b` -> `b()`). That regex can't tell a real identifier reference apart
// from a tag name that happens to share the same letters — `<b>even</b>`
// became `<b()>even</b>`, broken markup that no CSS selector can match.
//
// The eager row (forced via `ref`) exercises `build-reactive-effects.ts`'s
// conditional-arm path; the lazy row (no ref/child component/inner loop)
// exercises `build-lazy-row.ts`'s. Both used to corrupt the same way.

import { createSignal } from '@barefootjs/client'

interface Item {
  id: string
}

export function CondArmTagCollision() {
  const [items] = createSignal<Item[]>([{ id: 'x' }, { id: 'y' }])
  const [on, setOn] = createSignal(true)

  const toggle = () => setOn(v => !v)

  return (
    <div>
      <button type="button" class="toggle" onClick={toggle}>
        Toggle
      </button>
      <ul class="eager">
        {items().map((b, i) => (
          <li key={b.id} ref={(el: HTMLElement | null) => {}}>
            {on() ? <b class="on">even {i}</b> : <i class="off">odd {i}</i>}
          </li>
        ))}
      </ul>
      <ul class="lazy">
        {items().map((item) => (
          <li key={item.id}>
            {on() ? <span class="t">{item.id}</span> : <span class="t">none</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
