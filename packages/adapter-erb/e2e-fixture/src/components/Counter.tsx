'use client'
import { createSignal } from '@barefootjs/client'

export interface CounterProps {
  initial: number
}

export function Counter(props: CounterProps) {
  const [count, setCount] = createSignal(props.initial)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
