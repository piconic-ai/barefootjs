'use client'

// Root for the `module-const-default-hydrate` fixture. Every module const
// here is read ONLY through a destructure default, so the client module
// must still declare each one: the init effects read `_p.label ??
// DEFAULT_LABEL` and seed the signal from `_p.start ?? START`. A missing
// declaration throws at hydrate, before the click listener is attached.
import { createSignal } from '@barefootjs/client'

const DEFAULT_LABEL = 'm'
const START = 2

export function ModuleConstDefaultHydrate({ label = DEFAULT_LABEL, start = START }: { label?: string; start?: number }) {
  const [count, setCount] = createSignal(start)
  return (
    <div>
      <p data-slot="label" title={label}>{label}</p>
      <button onClick={() => setCount(count() + 1)}>{count()}</button>
    </div>
  )
}
