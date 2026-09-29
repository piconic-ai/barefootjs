import { createFixture } from '../src/types'

// #3245: `const [, save] = createMutation(...)` elides the value binding,
// so the analyzer synthesizes an internal getter name (`__bfGet_save`,
// analyzer.ts's `collectFactorySignal`) purely so getter-keyed consumers
// (substitution env, SSR seeding) stay total — nothing in the source ever
// reads it. This fixture pins that the SSR-rendered HTML is unaffected (the
// action's `isPending()`/`error()` accessors still seed correctly); the
// `__bfGet_` name itself must never reach any adapter's generated output
// (SSR module, SSR-defaults manifest, or a generated props struct/
// constructor) — see the compiler-unit pins in
// `packages/jsx/src/__tests__/create-mutation.test.ts` and
// `create-query.test.ts` for that half.
export const fixture = createFixture({
  id: 'create-mutation-elided-value',
  description: 'A createMutation with an elided value binding renders correctly and synthesizes no visible `__bfGet_` name',
  source: `
'use client'
import { createMutation, http } from '@barefootjs/client'
export function CreateMutationElidedValue() {
  const [, save] = createMutation(() => http.post('/api/items', {}))
  return <button disabled={save.isPending()} onClick={() => save()}>Save</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s0">Save</button>
  `,
})
