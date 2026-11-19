'use client'

// Test fixture (#3932): the shared module `let` holds an arrow that reads the
// hidden module const `base`; the component replaces it, so `g` (which calls
// whatever the variable holds, beside the hidden `base`) returns 'mh'.

import { createSignal } from '@barefootjs/client'

const base = 'm'
let pick = () => base + '?'

function g() {
  return base + pick()
}

export function ModuleLetArrowInitializerHiddenRead({ base }: { base: string }) {
  const [shown, setShown] = createSignal('none')
  pick = () => 'h'
  return (
    <div>
      <button className="read" onClick={() => setShown(g())}>{base}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
