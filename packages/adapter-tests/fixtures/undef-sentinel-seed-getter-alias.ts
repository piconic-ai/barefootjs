import { createFixture } from '../src/types'

/**
 * A getter alias of a signal whose seed holds a real `undefined` member and
 * data shaped like the manifest's undefined sentinel. The alias shares its
 * origin's seed entry, and the seed is encoded once: `JSON.stringify`
 * through the alias drops the `undefined` member and writes the
 * sentinel-shaped object and the `$$`-prefixed key as they are
 * (`spec/js-undefined-value.md`, "Shared: the seed and the default").
 */
export const fixture = createFixture({
  id: 'undef-sentinel-seed-getter-alias',
  description: 'A getter alias reads a seed with an undefined member and sentinel-shaped data unchanged',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type O = Record<string, unknown>
export function UndefSentinelSeedGetterAlias() {
  const [value] = createSignal<O>({ $$x: 1, gone: undefined, payload: { $undef: true } })
  const alias = value
  return (
    <p>
      {JSON.stringify(alias())}|{alias().gone === undefined ? 'u' : 'd'}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->{&quot;$$x&quot;:1,&quot;payload&quot;:{&quot;$undef&quot;:true}}<!--/-->|<!--bf-cond-start:s1-->u<!--bf-cond-end:s1--></p>
  `,
})
