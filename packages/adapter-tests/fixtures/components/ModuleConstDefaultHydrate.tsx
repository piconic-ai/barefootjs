'use client'

// Root for the `module-const-default-hydrate` fixture. Every module const
// here is read ONLY through a destructure default, so the client module
// must still declare each one: the init effects read `_p.label ??
// DEFAULT_LABEL` and seed the signal from `_p.start ?? START`. A missing
// declaration throws at hydrate, before the click listener is attached.
//
// `tone`'s default names `note` only as a member (`TONES.note`), so the
// module `const note` is no client read and must stay out of the client
// module: it reads `process`, which the browser lacks, and declaring it
// throws at hydrate the same way.
import { createSignal } from '@barefootjs/client'

const DEFAULT_LABEL = 'm'
const START = 2
const TONES: Record<string, string> = { 'note': 'n' }
const note = process.env.SERVER_ONLY

export function ModuleConstDefaultHydrate({ label = DEFAULT_LABEL, start = START, tone = TONES.note }: { label?: string; start?: number; tone?: string }) {
  const [count, setCount] = createSignal(start)
  return (
    <div>
      <p data-slot="label" title={label}>{label}</p>
      <p data-slot="tone">{tone}</p>
      <button onClick={() => setCount(count() + 1)}>{count()}</button>
    </div>
  )
}
