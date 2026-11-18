'use client'

// Test fixture (#3739): one module function reads both a module object the
// component writes (`box`) and a module const the prop `base` hides. The
// function keeps the module `base` ('m') and shares `box` with the component's
// write, so the click shows `m2`.

import { createSignal } from '@barefootjs/client'

const base = 'm'
const box = { n: 1 }

function g() {
  return base + box.n
}

export function ModuleConstMutatedObjectHiddenRead({ base }: { base: string }) {
  const [shown, setShown] = createSignal('none')
  box.n = 2
  return (
    <div>
      <button className="read" onClick={() => setShown(g())}>{base}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
