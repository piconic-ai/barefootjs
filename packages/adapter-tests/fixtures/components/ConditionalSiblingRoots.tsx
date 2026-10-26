'use client'

import { createSignal } from '@barefootjs/client'

export function ConditionalSiblingRoots() {
  const [shown, setShown] = createSignal(true)
  return <div>
    <button onClick={() => setShown(!shown())}>Toggle</button>
    <section>{shown() ? <><span>A</span><span>B</span></> : <span>C</span>}</section>
  </div>
}
