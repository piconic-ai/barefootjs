'use client'

// Test fixture (#3932): the component binds a const named like the module
// `let`, so its `counter = ...` is not a write to the module's. The module
// function keeps both module bindings: the module const `base` the prop hides
// and the module `let` the component's const hides.

import { createSignal } from '@barefootjs/client'

const base = 'm'
let counter = 0

function g() {
  return base + counter
}

export function ModuleLetNameHiddenRead({ base }: { base: string }) {
  let counter = 5
  const [shown, setShown] = createSignal('none')
  counter = 7
  return (
    <div>
      <button className="read" onClick={() => setShown(g() + counter)}>{base}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
