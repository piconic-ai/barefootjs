import { Counter } from './Counter'

// #2767: a plain server component (no 'use client') that merely RENDERS a
// 'use client' descendant. The compiler already emits a real
// `initChild('Counter', ...)` call in THIS file's own compiled init — see
// `packages/jsx/src/ir-to-client-js/collect-elements.ts`'s `childInits`
// collection — so this file must become its own Rollup entry and get its
// own `{{.Scripts.Register "…"}}` too, or Counter's `initChild` call never
// runs and Counter silently never hydrates. See
// `e2e-vite-build.test.ts`'s assertions on this fixture.
export function ServerParent() {
  return (
    <div>
      <h1>Server parent</h1>
      <Counter />
    </div>
  )
}
