'use client'

// Test fixture (#3932): a module const copies a module let before the
// component writes it. `seed` stays 1 while the function reads the live
// `counter` (2) and the hidden module const `base`.

import { createSignal } from '@barefootjs/client'

const base = 'm'
let counter = 1
const seed = counter

function g() {
  return base + counter + ':' + seed
}

export function ModuleLetConstReadsSharedHiddenRead({ base }: { base: string }) {
  const [shown, setShown] = createSignal('none')
  counter = 2
  return (
    <div>
      <button className="read" onClick={() => setShown(g())}>{base}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
