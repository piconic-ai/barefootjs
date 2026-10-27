import { createFixture } from '../src/types'

/**
 * A module const named like a prop that the component reaches only through
 * its props object (`function C(props: { label: string })`), read through a
 * component const (#3696). The props object's type binds no `label` in the
 * component scope, so every read is the module const, whatever the caller
 * passes as `label`:
 *
 * - `const shown = label` read as text and as an attribute;
 * - a module hop (`const tagged = label + '!'`) read through a component
 *   const in a loop row that shadows the hop's name, and the const read in
 *   a row that binds `label` itself.
 */
export const fixture = createFixture({
  id: 'module-const-named-like-object-prop',
  description: 'A module const named like a prop reached only through the props object reads the module value',
  source: `
'use client'
const label = 'module' + '!'
const tagged = label + '?'

export function ModuleConstNamedLikeObjectProp(props: { label?: string; rows: string[] }) {
  const shown = label
  const hop = tagged
  return (
    <div title={shown}>
      <p>{shown}</p>
      <ul>{props.rows.map(tagged => <li key={tagged}>{hop}/{tagged}</li>)}</ul>
      <ul>{props.rows.map((label, i) => <li key={i} data-label={shown}>{shown}/{label}</li>)}</ul>
    </div>
  )
}
`,
  props: { label: 'caller', rows: ['r1', 'r2'] },
  expectedHtml: `
    <div bf-s="test" bf="s10" title="module!">
      <p bf="s1"><!--bf:s0-->module!<!--/--></p>
      <ul bf="s5">
        <li bf="s4" data-key="r1"><!--bf:s2-->module!?<!--/-->/<!--bf:s3-->r1<!--/--></li>
        <li bf="s4" data-key="r2"><!--bf:s2-->module!?<!--/-->/<!--bf:s3-->r2<!--/--></li>
      </ul>
      <ul bf="s9">
        <li bf="s8" data-key="0" data-label="module!"><!--bf:s6-->module!<!--/-->/<!--bf:s7-->r1<!--/--></li>
        <li bf="s8" data-key="1" data-label="module!"><!--bf:s6-->module!<!--/-->/<!--bf:s7-->r2<!--/--></li>
      </ul>
    </div>
  `,
})
