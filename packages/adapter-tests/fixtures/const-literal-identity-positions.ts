import { createFixture } from '../src/types'

/**
 * An object literal const read at several positions of one render: an
 * attribute, text, every row of a loop, and two props of one child. The
 * server evaluates the declaration once, so every read is the same object.
 * The CSR template binds such a const once per template evaluation, so it
 * renders the same. The template adapters refuse the comparison (BF101).
 */
export const fixture = createFixture({
  id: 'const-literal-identity-positions',
  description: 'an object literal const is the same object at an attribute, text, loop rows and child props',
  escapes: [
    { kind: 'rewrite', fixture: 'strict-equality-reference-rewrite' },
    { kind: 'client-directive', fixture: 'strict-equality-reference-client' },
  ],
  source: `
'use client'
const B = { k: 'v' }
function Same(props: { a: { k: string }; b: { k: string } }) {
  return <i>{String(props.a === props.b)}</i>
}
export function ConstLiteralIdentityPositions() {
  return (
    <div data-same={String(B === B)}>
      <p>{String(B === B)}</p>
      <ul>{[1, 2].map(i => <li key={i}>{String(B === B)}{B.k}</li>)}</ul>
      <Same a={B} b={B} />
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s4" data-same="true">
      <p><!--bf:s0-->true<!--/--></p>
      <ul bf="s2">
        <li data-key="1"><!--bf:s1-->true<!--/-->v</li>
        <li data-key="2"><!--bf:s1-->true<!--/-->v</li>
      </ul>
      <i bf-s="test_s3" bf="s1"><!--bf:s0-->true<!--/--></i>
    </div>
  `,
})
