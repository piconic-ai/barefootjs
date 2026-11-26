'use client'

// Test fixture (#3968): a module const reads the module `let` the component
// reassigns and calls a module function. The const runs where the module
// runs it, after `count` got its value and with `offset` declared:
// `initial` is 1 + 11 and the component makes `count` 2.

import { createSignal } from '@barefootjs/client'

const seed = 1
let count = seed

function offset() {
  return seed + 10
}

const initial = count + offset()

export function ModuleLetConstReaderCallsModuleFunction() {
  const [shown, setShown] = createSignal('none')
  count = count + 1
  return (
    <div>
      <button className="read" onClick={() => setShown(initial + ':' + count)}>read</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
