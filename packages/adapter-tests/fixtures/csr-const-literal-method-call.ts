import { createFixture } from '../src/types'

/**
 * Consts computed by a catalogued method on a literal value
 * (`['doc', 'api'].includes(props.kind)`), read in attributes and in text
 * (#3926). The CSR template used to read each one as `undefined`: a call with
 * a prop argument was taken for a helper that must not run at template scope,
 * although the receiver is a fresh literal and the method only reads it. The
 * consts cover an array receiver, a string receiver, a const read through
 * another const, a numeric result and literal elements built from props.
 */
export const fixture = createFixture({
  id: 'csr-const-literal-method-call',
  description: 'A const computed by a method on a literal renders on a CSR mount',
  source: `
export function Tags(props: { kind: string; word: string; slot: string }) {
  const known = ['doc', 'api'].includes(props.kind)
  const label = known ? 'known' : 'other'
  const hit = 'alpha-beta'.includes(props.word) ? 'in' : 'out'
  const pos = ['a', 'b', 'c'].indexOf(props.slot)
  const joined = [props.kind, props.word].join('/')
  return (
    <div title={label} data-hit={hit} data-pos={pos}>
      <b>{label}</b>
      <i>{hit}</i>
      <s>{pos}</s>
      <em>{joined}</em>
    </div>
  )
}
`,
  props: { kind: 'api', word: 'beta', slot: 'b' },
  expectedHtml: `
    <div bf-s="test" bf="s8" data-hit="in" data-pos="1" title="known">
      <b bf="s1"><!--bf:s0-->known<!--/--></b>
      <i bf="s3"><!--bf:s2-->in<!--/--></i>
      <s bf="s5"><!--bf:s4-->1<!--/--></s>
      <em bf="s7"><!--bf:s6-->api/beta<!--/--></em>
    </div>
  `,
})
