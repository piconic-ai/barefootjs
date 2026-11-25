'use client'

// Test fixture (#3968): the reassigned module `let` reads a module const that
// reads another module const and calls a module function. All of them run
// before `counter` gets its value: it starts as 'pq' and becomes 'pq!'.

import { createSignal } from '@barefootjs/client'

function suffix() {
  return 'q'
}

const head = 'p'
const start = head + suffix()
let counter = start

export function ModuleLetInitializerReadsModuleChain() {
  const [shown, setShown] = createSignal('none')
  counter = counter + '!'
  return (
    <div>
      <button className="read" onClick={() => setShown(counter)}>read</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
