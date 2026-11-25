'use client'

// Test fixture (#3968): a module const reads the module `let` the component
// reassigns and calls a module function that reads a module context. The
// prop `base` hides the module const a module function reads, so the client
// script evaluates the module consts in the module-scope replica; `initial`
// is evaluated there once (1 + 10), and the component makes `count` 2.

import { createContext, createSignal } from '@barefootjs/client'

const base = 'm'
let count = 1
const ctx = createContext(0)

function offset() {
  return ctx ? 10 : 20
}

const initial = count + offset()

function g() {
  return base + count
}

export function ModuleLetConstReaderReadsContextThroughFunction({ base }: { base: string }) {
  const [shown, setShown] = createSignal('none')
  count = count + 1
  return (
    <div>
      <button className="read" onClick={() => setShown(initial + ':' + g())}>{base}</button>
      <p className="out">{shown()}</p>
    </div>
  )
}
