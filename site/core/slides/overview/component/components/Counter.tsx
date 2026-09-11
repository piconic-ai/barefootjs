'use client'
import { createSignal, createEffect } from '@barefootjs/client'

export function Counter(props: { initial?: number }) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  // Animate only the number: the text node is the one thing the runtime touches.
  const mountValue = (el: HTMLElement) => {
    let first = true
    createEffect(() => {
      count()
      if (first) { first = false; return }
      el.animate(
        [{ transform: 'translateY(0.18em)', opacity: 0.2 }, { transform: 'none', opacity: 1 }],
        { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' }
      )
    })
  }
  return (
    <div className="counter">
      <p className="counter-value" ref={mountValue}>{count()}</p>
      <button className="counter-btn" onClick={() => setCount(count() + 1)}>+1</button>
    </div>
  )
}
