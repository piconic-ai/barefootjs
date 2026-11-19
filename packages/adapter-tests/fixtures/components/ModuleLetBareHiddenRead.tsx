'use client'

// Test fixture (#3932): a module `let` with no initializer, assigned by the
// component, read by a module function beside a module const the component's
// own const `base` hides.

import { createSignal } from '@barefootjs/client'

const base = 'm'
let last

function g() {
  return base + last
}

export function ModuleLetBareHiddenRead({ label }: { label?: string }) {
  const base = label ?? 'prop'
  const [shown, setShown] = createSignal('none')
  last = 'x'
  return (
    <div>
      <button className="read" onClick={() => setShown(g())}>{base}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
