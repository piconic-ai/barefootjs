'use client'
import { createSignal } from '@barefootjs/client'
import { LoopChild } from './LoopChild'

// A `'use client'` parent that renders a SIBLING-IMPORTED component inside
// a `.map()` over signal-derived data — the compiler emits a
// `@bf-child:LoopChild` marker for this (see
// `packages/jsx/src/ir-to-client-js/child-components.ts`), which is not a
// real module specifier. See `child-marker.ts` for why resolving it to a
// no-op is only sometimes safe, and `e2e-vite-build.test.ts`'s assertions
// on this fixture for what a real Rollup build must do instead.
export function LoopParent() {
  const [items] = createSignal([
    { id: 1, label: 'first' },
    { id: 2, label: 'second' },
  ])
  return (
    <ul>
      {items().map(item => <LoopChild key={item.id} label={item.label} />)}
    </ul>
  )
}
