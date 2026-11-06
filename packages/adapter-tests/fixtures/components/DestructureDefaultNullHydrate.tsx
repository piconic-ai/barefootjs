'use client'

// Root for the `destructure-default-null-hydrate` fixture. Forwards a
// signal that starts `null` (and cycles through a value back to `null`),
// a literal `undefined` and an omitted prop into `DefaultedLabel`, whose
// `label = 'D'` default must apply to the last two only, at SSR, after
// hydration and on every update.
import { createSignal } from '@barefootjs/client'
import { DefaultedLabel } from './DefaultedLabel'

export function DestructureDefaultNullHydrate() {
  const [label, setLabel] = createSignal<string | null>(null)
  return (
    <div>
      <section data-case="null"><DefaultedLabel label={label()} /></section>
      <section data-case="undefined"><DefaultedLabel label={undefined} /></section>
      <section data-case="omitted"><DefaultedLabel /></section>
      <button onClick={() => setLabel(v => (v === null ? 'X' : null))}>cycle</button>
    </div>
  )
}
