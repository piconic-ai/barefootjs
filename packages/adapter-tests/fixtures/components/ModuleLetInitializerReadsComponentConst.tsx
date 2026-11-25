'use client'

// Test fixture (#3968): a numeric module `let` the component reassigns is
// initialized from a falsy module const the component also renders. `count`
// starts as 5 (`0 || 5`) and the component makes it 6.

import { createSignal } from '@barefootjs/client'

const seed = 0
let count = seed || 5

export function ModuleLetInitializerReadsComponentConst() {
  const [shown, setShown] = createSignal(-1)
  count = count + 1
  return (
    <div>
      <span className="seed">{seed}</span>
      <button className="read" onClick={() => setShown(count)}>read</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
