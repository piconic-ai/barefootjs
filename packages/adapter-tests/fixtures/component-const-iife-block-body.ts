import { createFixture } from '../src/types'

/**
 * The component-scope sibling of `module-const-iife-block-body`: a
 * component const initialized by an immediately invoked arrow with a block
 * body, reading a prop. The template adapters refuse the read (BF101,
 * `const-iife-unlowered`) where they used to render it empty or fail the
 * render; the CSR template has no value for the const either.
 */
export const fixture = createFixture({
  id: 'component-const-iife-block-body',
  description: 'a component const initialized by an immediately invoked arrow with a block body renders what the arrow returns',
  escapes: [{ kind: 'client-directive', fixture: 'component-const-iife-block-body-client' }],
  source: `
'use client'
export function ComponentConstIifeBlockBody({ label }: { label: string }) {
  const B = (() => { return { k: 'v', l: label } })()
  return <p>{B.k}|{B.l}</p>
}
`,
  props: { label: 'hi' },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->v<!--/-->|<!--bf:s1-->hi<!--/--></p>
  `,
})
