'use client'

/**
 * Counter Component (Shared)
 *
 * This component is shared across all adapter integrations.
 * Used to verify consistent behavior across different backends.
 */

import { createSignal, createMemo } from '@barefootjs/client'

interface CounterProps {
  initial?: number
}

export function Counter(props: CounterProps) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="counter-container">
      <p className="counter-value">{count()}</p>
      <p className="counter-doubled">doubled: {doubled()}</p>
      <div className="counter-buttons">
        <button className="btn btn-increment" onClick={() => setCount(n => n + 1)}>+1</button>
        <button className="btn btn-decrement" onClick={() => setCount(n => n - 1)}>-1</button>
        <button className="btn btn-reset" onClick={() => setCount(0)}>Reset</button>
      </div>
    </div>
  )
}

export default Counter
