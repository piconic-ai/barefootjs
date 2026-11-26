import { createFixture } from '../src/types'

/**
 * #3975: a child prop reads a const built by an expression-bodied zero-param
 * component helper over a signal (`const label = read()`, `read = () =>
 * name()`). The CSR template splices the call as its body, seeded with the
 * signal's initial value, so a client mount renders the child in place, as
 * it does for `const label = name()`; the child prop stays bound to `read()`
 * in init. `deferred-child-phrasing-parent` keeps the deferred-placeholder
 * path with a block-bodied helper.
 */
export const fixture = createFixture({
  id: 'component-helper-signal-child-prop',
  description: 'a child prop reading a const built by a zero-param component helper over a signal renders the child on a client mount (#3975)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
function Label(props: { label: string }) {
  return <b>{props.label}</b>
}
export function ComponentHelperSignalChildProp() {
  const [name] = createSignal('a')
  const read = () => name()
  const label = read()
  return <div><Label label={label} /></div>
}
`,
  expectedHtml: `
    <div bf-s="test"><b bf-s="test_s0" bf="s1"><!--bf:s0-->a<!--/--></b></div>
  `,
})
