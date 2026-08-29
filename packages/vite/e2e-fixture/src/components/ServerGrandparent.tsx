import { ServerParent } from './ServerParent'

// #2767: transitive case — a plain server component whose only path to a
// 'use client' descendant is through ANOTHER plain server component.
// `ServerGrandparent` must ALSO become its own Rollup entry: it owns the
// `initChild('ServerParent', ...)` call reaching `ServerParent`, which in
// turn owns the `initChild('Counter', ...)` call reaching `Counter`. Miss
// either link and the chain breaks silently. See
// `e2e-vite-build.test.ts`'s assertions on this fixture.
export function ServerGrandparent() {
  return (
    <section>
      <h1>Server grandparent</h1>
      <ServerParent />
    </section>
  )
}
