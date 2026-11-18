'use client'

// Test fixture (#3739): a module function reads a module object the component
// writes while it renders. An unused module helper reads the module `base`
// that the prop `base` hides, so the helper is evaluated in module scope and
// pulls `g` and `box` with it. The click handler must still read the object
// the component wrote (`2`), not a copy.

import { createSignal } from '@barefootjs/client'

const base = 'm'
const box = { n: 1 }

function g() {
  return box.n
}

function unused() {
  return base + g()
}

export function ModuleConstMutatedObjectRead({ base }: { base: string }) {
  const [shown, setShown] = createSignal('none')
  box.n = 2
  return (
    <div>
      <button className="read" onClick={() => setShown(String(g()))}>{base}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
