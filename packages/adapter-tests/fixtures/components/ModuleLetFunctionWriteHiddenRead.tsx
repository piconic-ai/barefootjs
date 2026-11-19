'use client'

// Test fixture (#3932): a module function (`bump`) writes the module let; the
// component and a module function that also reads the hidden module const
// `base` read it. All of them see one variable, so the click shows `m11`.

import { createSignal } from '@barefootjs/client'

const base = 'm'
let counter = 0

function bump() {
  counter += 1
}

function g() {
  return base + counter
}

export function ModuleLetFunctionWriteHiddenRead({ base }: { base: string }) {
  const [shown, setShown] = createSignal('none')
  return (
    <div>
      <button className="read" onClick={() => { bump(); setShown(g() + counter) }}>{base}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
