import { createFixture } from '../src/types'

/**
 * A body destructure default reads a component const that hides a module
 * const of the same name (#3739): `const DEF = 'z'` in the component, then
 * `const { b = DEF } = props`, gives `z` with `b` omitted. The parameter
 * default direction, which reads the module const, is
 * `destructure-default-param-body-const-same-name`.
 */
export const fixture = createFixture({
  id: 'module-const-destructure-default-component-const',
  description: 'A body destructure default reads the component const that hides a module const',
  source: `
'use client'
const DEF = 'm'
const other = DEF + '!'

export function ModuleConstDestructureDefaultComponentConst(props: { b?: string }) {
  const DEF = 'z'
  const { b = DEF } = props
  return <p title={other}>{b}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1" title="m!"><!--bf:s0-->z<!--/--></p>
  `,
  dataPoints: [
    { name: 'passed', props: { b: 'B' } },
    { name: 'empty', props: { b: '' } },
  ],
})
