'use client'

// Test fixture (#3932): the module `let`'s initializer reads the module const
// the prop `base` hides, once directly and once through a module alias, so
// the initializer must be evaluated against the module's `base` ('m').

import { createSignal } from '@barefootjs/client'

const base = 'm'
const alias = base
let counter = base + alias.length

function g() {
  return counter
}

export function ModuleLetInitializerHiddenRead({ base }: { base: string }) {
  const [shown, setShown] = createSignal('none')
  counter = counter + 'm'
  return (
    <div>
      <button className="read" onClick={() => setShown(g())}>{base}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
