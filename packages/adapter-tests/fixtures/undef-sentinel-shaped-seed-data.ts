import { createFixture } from '../src/types'

/**
 * Seed data shaped like the manifest's undefined sentinel stays data: an
 * object `{ $undef: true }` nested in a member or held by an array element,
 * and a key that itself begins with `$$`, next to a real `undefined`
 * member. `JSON.stringify` writes the data objects as they are and drops
 * the `undefined` member (`spec/js-undefined-value.md`, "Shared: the seed
 * and the default"; the manifest escapes a seed's own `$`-prefixed keys).
 */
export const fixture = createFixture({
  id: 'undef-sentinel-shaped-seed-data',
  description: 'A seed object shaped like the undefined sentinel, and a $$-prefixed key, stay data',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type O = Record<string, unknown>
export function UndefSentinelShapedSeedData() {
  const [o] = createSignal<O>({ $$x: 1, gone: undefined, list: [{ $undef: true }, null], payload: { $undef: true } })
  return (
    <p>
      {JSON.stringify(o())}|{o().gone === undefined ? 'u' : 'd'}|{o().payload === undefined ? 'u' : 'd'}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf:s0-->{&quot;$$x&quot;:1,&quot;list&quot;:[{&quot;$undef&quot;:true},null],&quot;payload&quot;:{&quot;$undef&quot;:true}}<!--/-->|<!--bf-cond-start:s1-->u<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->d<!--bf-cond-end:s2--></p>
  `,
})
