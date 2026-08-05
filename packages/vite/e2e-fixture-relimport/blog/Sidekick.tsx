'use client'
import { createSignal } from '@barefootjs/client'

export function Sidekick() {
  const [n] = createSignal(0)
  return <span>{n()}</span>
}
