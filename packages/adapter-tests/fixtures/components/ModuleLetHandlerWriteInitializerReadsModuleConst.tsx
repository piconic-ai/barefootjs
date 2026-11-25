'use client'

// Test fixture (#3968): a numeric module `let` written only by the click
// handler is initialized from a falsy module const the component also
// renders. `count` starts as 5 (`0 || 5`); the click makes it 6.

import { createSignal } from '@barefootjs/client'

const seed = 0
let count = seed || 5

export function ModuleLetHandlerWriteInitializerReadsModuleConst() {
  const [shown, setShown] = createSignal(-1)
  return (
    <div>
      <span className="seed">{seed}</span>
      <button
        className="read"
        onClick={() => {
          count = count + 1
          setShown(count)
        }}
      >
        read
      </button>
      <p className="out">{shown()}</p>
    </div>
  )
}
