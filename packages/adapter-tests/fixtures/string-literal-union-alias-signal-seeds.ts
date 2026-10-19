import { createFixture } from '../src/types'

/**
 * Signals typed by string-literal union aliases and seeded with literals:
 * a union with parenthesized members (`'a' | ('b')`, `(('x') | 'y')`), and
 * a union mixing in `number` seeded with a string and with a number. Go
 * types the first two as `string` aliases and the mixed one as
 * `interface{}`; every seed must survive into the constructor rather than
 * baking `nil` (#3542 review).
 */
export const fixture = createFixture({
  id: 'string-literal-union-alias-signal-seeds',
  description: 'Signals typed by string-literal union aliases keep their literal seeds on every adapter (#3542)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Mode = 'a' | ('b')
type Tone = (('x') | 'y')
type Size = 'auto' | number

export function UnionAliasSignalSeeds() {
  const [mode] = createSignal<Mode>('a')
  const [tone] = createSignal<Tone>('y')
  const [size] = createSignal<Size>('auto')
  const [count] = createSignal<Size>(3)
  return <p data-mode={mode()} data-tone={tone()} data-size={size()}>{count()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1" data-mode="a" data-size="auto" data-tone="y"><!--bf:s0-->3<!--/--></p>
  `,
})
