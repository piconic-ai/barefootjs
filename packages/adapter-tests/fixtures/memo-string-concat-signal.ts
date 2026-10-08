import { createFixture } from '../src/types'

/**
 * A memo concatenating a string signal with literals renders its value on
 * SSR (#3367): a literal-seeded signal (an apostrophe and a backtick
 * literal included), a prop-seeded signal, and a memo concatenating
 * another string memo, in text and attribute position.
 * go-template used to seed such a memo as `nil` and render it empty.
 */
export const fixture = createFixture({
  id: 'memo-string-concat-signal',
  description: 'A memo concatenating a string signal renders its value on SSR',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function MemoStringConcatSignal(props: { name: string }) {
  const [s] = createSignal('outer')
  const [who] = createSignal(props.name)
  const [quote] = createSignal("can't")
  const [tick] = createSignal(\`tick\`)
  const label = createMemo(() => s() + '!')
  const greet = createMemo(() => 'hi ' + who() + ', ' + label())
  const quoted = createMemo(() => quote() + ' / ' + tick())
  return <p title={label()} data-q={quoted()}>{greet()}</p>
}
`,
  props: { name: 'ann' },
  expectedHtml: `
    <p bf-s="test" bf="s1" data-q="can&#39;t / tick" title="outer!"><!--bf:s0-->hi ann, outer!<!--/--></p>
  `,
})
