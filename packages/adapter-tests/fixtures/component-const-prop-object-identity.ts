import { createFixture } from '../src/types'

/**
 * A component const that builds an object from a prop, compared with
 * itself (`B === B`). The server evaluates the declaration once, so the
 * comparison is true and the text reads the prop. The CSR template binds
 * the const once per template evaluation, so it renders the same. The
 * template adapters refuse the comparison (BF101).
 */
export const fixture = createFixture({
  id: 'component-const-prop-object-identity',
  description: 'a component const object built from a prop is the same object at two reads',
  escapes: [
    { kind: 'rewrite', fixture: 'strict-equality-reference-rewrite' },
    { kind: 'client-directive', fixture: 'strict-equality-reference-client' },
  ],
  props: { label: 'x' },
  source: `
'use client'
export function ComponentConstPropObjectIdentity(props: { label: string }) {
  const B = { k: props.label }
  return <p data-same={String(B === B)}>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1" data-same="true"><!--bf:s0-->x<!--/--></p>
  `,
})
