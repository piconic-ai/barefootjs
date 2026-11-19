'use client'

// Test fixture (#3932): the shared module `let` is initialized with `||`,
// which cannot be an unparenthesised operand of the `??` the client script
// assigns it with. The initializer reads the module const the prop `base`
// hides ('m'), so `counter` starts as 'm' and the component makes it 'm2'.

import { createSignal } from '@barefootjs/client'

const base = 'm'
let counter = base || 'fallback'

function g() {
  return base + counter
}

export function ModuleLetLogicalInitializerHiddenRead({ base }: { base: string }) {
  const [shown, setShown] = createSignal('none')
  counter = counter + '2'
  return (
    <div>
      <button className="read" onClick={() => setShown(g())}>{base}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
