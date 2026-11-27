import { createFixture } from '../src/types'

/**
 * Spread bags whose keys are not one attribute name to the HTML parser (a
 * space, `=`, `>`, a quote, `/`, `<`), next to valid keys, through each
 * open-bag path: a destructured `Record<string, unknown>` prop, an
 * index-signature rest, and a signal getter. The caller's keys are data, so
 * the reference drops every such key, in the string and the `true` branch,
 * and renders the valid ones; a key like `x onmouseover=alert(1)` must not
 * become an attribute of its own.
 */
export const fixture = createFixture({
  id: 'spread-bag-unsafe-attr-names',
  description: 'Spread bag keys that are not one attribute name are dropped, valid keys render',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type P = { rec: Record<string, unknown>; [key: string]: unknown }
export function SpreadBagUnsafeAttrNames({ rec, ...rest }: P) {
  const [bag] = createSignal<Record<string, unknown>>({ 'a b': 'x', id: 'g' })
  return (
    <div>
      <p {...rec}>a</p>
      <p {...rest}>b</p>
      <p {...bag()}>c</p>
    </div>
  )
}
`,
  props: {
    rec: { id: 'ok', 'a b': 'x', 'x=y': 'x', 'x>y': true, 'q"': 'x', "o'k": true, 'a/b': 'x', 'a<b': 'x', 'x onmouseover=alert(1)': 'x' },
    title: 't',
    'c d': 'x',
    'e=f': true,
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" id="ok">a</p>
      <p bf="s1" title="t">b</p>
      <p bf="s2" id="g">c</p>
    </div>
  `,
})
