'use client'
import { sharedCount, setSharedCount } from './counterState'

export function SharedCounter() {
  return <button onClick={() => setSharedCount(sharedCount() + 1)}>{sharedCount()}</button>
}
