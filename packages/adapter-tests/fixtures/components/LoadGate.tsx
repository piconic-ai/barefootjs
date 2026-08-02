'use client'

// Test fixture (#2463): a component-level early return whose condition
// reads a signal — `if (loading()) return <button/>; return <p/>`. SSR
// renders the initial (loading) branch correctly; the bug was entirely on
// the client: no branch-switch effect was emitted at all (clicking the
// button called `setLoading(false)` but nothing subscribed to `loading`,
// so the DOM never left the button), and separately the CSR template
// lambda referenced `loading()` out of scope (a `ReferenceError` on CSR
// mount). The semantically identical root ternary
// (`return loading() ? <button/> : <p>Ready</p>`) already compiled
// correctly — see the `top-level-ternary` fixture — so this pins the
// statement-form/expression-form asymmetry the fix closes.
import { createSignal } from '@barefootjs/client'

export function LoadGate() {
  const [loading, setLoading] = createSignal(true)
  if (loading()) {
    return <button onClick={() => setLoading(false)}>Loading...</button>
  }
  return <p>Ready</p>
}
