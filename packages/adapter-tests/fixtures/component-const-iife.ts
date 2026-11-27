import { createFixture } from '../src/types'

/**
 * The component-scope sibling of `module-const-iife-values` (#4022): a
 * component const initialized by an immediately invoked zero-param arrow,
 * whose body reads a prop or nothing, holds what the arrow returns.
 */
export const fixture = createFixture({
  id: 'component-const-iife',
  description: 'a component const initialized by an immediately invoked arrow renders what the arrow returns',
  source: `
'use client'
export function ComponentConstIife({ label }: { label: string }) {
  const B = (() => ({ k: 'v', l: label }))()
  const S = (() => label + '!')()
  return <p title={B.k}>{B.k}|{B.l}|{S}</p>
}
`,
  props: { label: 'hi' },
  expectedHtml: `
    <p bf-s="test" bf="s3" title="v"><!--bf:s0-->v<!--/-->|<!--bf:s1-->hi<!--/-->|<!--bf:s2-->hi!<!--/--></p>
  `,
})
