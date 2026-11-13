import { createFixture } from '../src/types'

/**
 * A body destructure default that reads a component-local const (#3725):
 * through a method call (`DEF.toUpperCase()`), bare (`DEF`), in arithmetic
 * (`STEP + 1`), in a template literal, through a const of a const
 * (`SUFFIX = DEF + '!'`) and through a function returning one expression
 * (`label()`). A template has no binding for the component's consts, so the
 * default is applied as the expression it stands for. A passed `''` / `0`
 * stays the caller's value.
 */
export const fixture = createFixture({
  id: 'destructure-default-local-const',
  description: 'A body destructure default reading a component-local const renders its value when the prop is omitted',
  source: `
export function DestructureDefaultLocalConst(props: { b?: string; c?: string; n?: number; t?: string; d?: string; e?: string }) {
  const DEF = 'z'
  const STEP = 2
  const SUFFIX = DEF + '!'
  const label = () => DEF + '?'
  const { b = DEF.toUpperCase(), c = DEF, n = STEP + 1, t = \`\${DEF}-t\`, d = SUFFIX, e = label() } = props
  return <p title={c} data-n={n}>{b}|{c}|{n}|{t}|{d}|{e}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s6" data-n="3" title="z"><!--bf:s0-->Z<!--/-->|<!--bf:s1-->z<!--/-->|<!--bf:s2-->3<!--/-->|<!--bf:s3-->z-t<!--/-->|<!--bf:s4-->z!<!--/-->|<!--bf:s5-->z?<!--/--></p>
  `,
  dataPoints: [
    { name: 'all-passed', props: { b: 'B', c: 'C', n: 7, t: 'T', d: 'D', e: 'E' } },
    { name: 'falsy-passed', props: { b: '', c: '', n: 0, t: '', d: '', e: '' } },
  ],
})
