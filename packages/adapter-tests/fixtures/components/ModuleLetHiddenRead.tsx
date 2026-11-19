'use client'

// Test fixture (#3932): one module function reads both a module `let` the
// component reassigns (`counter`) and a module const the prop `base` hides.
// The function keeps the module `base` ('m') and sees the component's write,
// so the click shows `m2`.

import { createSignal } from '@barefootjs/client'

const base = 'm'
let counter = 0

function g() {
  return base + counter
}

export function ModuleLetHiddenRead({ base }: { base: string }) {
  const [shown, setShown] = createSignal('none')
  counter = 2
  return (
    <div>
      <button className="read" onClick={() => setShown(g())}>{base}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
