'use client'

// Test fixture: a keyed `.map()` row whose `<button>` carries a `ref`
// callback that moves the element to `document.body` with `createPortal`
// (the `ref`-callback portal pattern the overlay primitives use, applied to
// a row element). The callback is declared in the component body, so the
// SSR-portal recognition (`ssrPortalOwnerScope`) does not flag it and every
// adapter renders the button inline in its `<li>`. The button's click
// handler bumps a counter outside the loop.

import { createSignal, createPortal } from '@barefootjs/client'

export function RowPortalRef(props: { rows: string[] }) {
  const [count, setCount] = createSignal(0)
  const mountContent = (el: HTMLElement) => {
    if (el.parentNode !== document.body) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }
  return (
    <div>
      <p className="count">{count()}</p>
      <ul>
        {props.rows.map(r => (
          <li key={r}>
            <button type="button" className="row" ref={mountContent} onClick={() => setCount(c => c + 1)}>
              {r}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
