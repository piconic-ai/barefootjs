'use client'

// Component-scope `let` bindings written only by event handlers, in every
// write form: prefix and postfix updates, a compound assignment, a
// destructuring swap, and a `for (let i …)` loop whose `i++` is the loop
// variable's. The handlers keep reading and writing the init body's locals,
// and the markup's `{nextId}` still renders the declared value, which is
// what the binding holds until a handler runs.
import { createSignal } from '@barefootjs/client'

export function HandlerWrittenLocals() {
  const [log, setLog] = createSignal<string[]>([])
  let nextId = 0
  let left = 'a'
  let right = 'b'
  const addPre = () => setLog([...log(), `#${++nextId}`])
  const addPost = () => setLog([...log(), `#${nextId++}`])
  const swap = () => {
    ;[left, right] = [right, left]
    setLog([...log(), left + right])
  }
  const addSum = () => {
    let total = 0
    for (let i = 0; i < 3; i++) total += i
    nextId += total
    setLog([...log(), `+${nextId}`])
  }
  return (
    <div>
      <button className="add-pre" onClick={addPre}>pre</button>
      <button className="add-post" onClick={addPost}>post</button>
      <button className="swap" onClick={swap}>swap</button>
      <button className="add-sum" onClick={addSum}>sum</button>
      <p className="next">{nextId}</p>
      <p className="log">{log().join(' ')}</p>
    </div>
  )
}
