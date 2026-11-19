'use client'

// Test fixture (#3932): the module `let` is reassigned only by an event
// handler, and the module function reading it also reads a module const the
// signal getter `base` hides. Both stay the module's own: the first click
// writes the let, the second reads `m2`.

import { createSignal } from '@barefootjs/client'

const base = 'm'
let counter = 0

function g() {
  return base + counter
}

export function ModuleLetHandlerWriteHiddenRead() {
  const [base] = createSignal('prop')
  const [shown, setShown] = createSignal('none')
  return (
    <div>
      <button className="read" onClick={() => { counter = 2; setShown(g()) }}>{base()}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
