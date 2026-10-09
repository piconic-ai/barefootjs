/**
 * The component the playground opens with.
 *
 * Shared by the page (routes.tsx injects it as the editor's initial buffer)
 * and the type-bundle test, which type-checks it against the Monaco bundle
 * the same way the editor does.
 */
export const DEFAULT_SOURCE = `'use client'

import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return (
    <div style={{ padding: '12px 16px', border: '1px solid #ccc', borderRadius: '8px', display: 'inline-block' }}>
      <p>Count: {count()}</p>
      <button onClick={() => setCount(count() + 1)}>+1</button>
      <button onClick={() => setCount(count() - 1)} style={{ marginLeft: '8px' }}>-1</button>
    </div>
  )
}
`
