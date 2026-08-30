import { Counter } from './Counter'

// #2767: plain server component (no 'use client') that renders a client
// descendant. It must get its own dev-origin script registration too — see
// `e2e-vite-dev.test.ts`'s assertions on this fixture, and
// `e2e-fixture/src/components/ServerParent.tsx` for the build-side twin.
export function ServerParent() {
  return (
    <div>
      <h1>Server parent</h1>
      <Counter />
    </div>
  )
}
