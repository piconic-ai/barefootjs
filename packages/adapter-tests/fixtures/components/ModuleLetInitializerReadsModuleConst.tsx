'use client'

// Test fixture (#3968): the module `let` the component reassigns is
// initialized from a module const nothing else reads. The client script
// declares `counter` at module level, so `seed` has to be in scope there:
// `counter` starts as 'x' and the component makes it 'x!'.

import { createSignal } from '@barefootjs/client'

const seed = ''
let counter = seed || 'x'

export function ModuleLetInitializerReadsModuleConst() {
  const [shown, setShown] = createSignal('none')
  counter = counter + '!'
  return (
    <div>
      <button className="read" onClick={() => setShown(counter)}>read</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
