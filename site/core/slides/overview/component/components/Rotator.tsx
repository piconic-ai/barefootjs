'use client'
import { createSignal, createEffect, onMount, onCleanup } from '@barefootjs/client'

// "TSX in. Your stack out." — shown as written first, then the phrase resolves into the
// real adapter list one stack at a time, and returns to "Your stack" after each lap.
const WORDS = ['Your stack', 'Hono', 'Go', 'Ruby', 'Python', 'PHP', 'Perl', 'Rust']
const HOLD_FIRST = 3400   // how long "Your stack" stays, on load and after each lap
const HOLD = 2200

export function Rotator() {
  const [i, setI] = createSignal(0)
  const word = () => WORDS[i()]

  onMount(() => {
    let timer: number | null = null
    const tick = () => {
      const next = (i() + 1) % WORDS.length
      setI(next)
      timer = window.setTimeout(tick, next === 0 ? HOLD_FIRST : HOLD)
    }
    timer = window.setTimeout(tick, HOLD_FIRST)
    onCleanup(() => { if (timer) clearTimeout(timer) })
  })

  const mountWord = (el: HTMLElement) => {
    let first = true
    createEffect(() => {
      i()
      if (first) { first = false; return }
      el.animate(
        [{ opacity: 0, transform: 'translateY(0.12em)' }, { opacity: 1, transform: 'none' }],
        { duration: 900, easing: 'cubic-bezier(.2,.6,.2,1)' }
      )
    })
  }
  return (
    <p className="tagline">
      TSX in. <span className="tagline-stack" ref={mountWord}>{word()}</span> out.
    </p>
  )
}
