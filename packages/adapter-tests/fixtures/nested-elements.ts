import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'nested-elements',
  description: 'Deeply nested elements with dynamic content',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NestedElements() {
  const [text, setText] = createSignal('hello')
  return (
    <div>
      <section>
        <article>
          <p>{text()}</p>
        </article>
      </section>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test"><section><article><p bf="s1"><!--bf:s0-->hello<!--/--></p></article></section></div>
  `,
})
