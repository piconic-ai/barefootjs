'use client'

// Test fixture (#3932): `counter` is initialized from another module let
// (`first`) that the component also writes. Module initialization runs in
// source order, so `counter` starts at 2 and the component's `first = 3` does
// not change it; the increment makes it 3, which `g` reads beside the module
// const the prop `base` hides.

import { createSignal } from '@barefootjs/client'

const base = 'm'
let first = 1
let counter = first + 1

function g() {
  return base + counter
}

export function ModuleLetSharedChainHiddenRead({ base }: { base: string }) {
  const [shown, setShown] = createSignal('none')
  first = 3
  counter++
  return (
    <div>
      <button className="read" onClick={() => setShown(g())}>{base}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
