import { createFixture } from '../src/types'

/**
 * A module-level array of string literals is a compile-time constant, so
 * `.map()` over it is a static loop. The row body may branch on the row
 * (`q === 'x' ? … : …`) or read a prop; neither makes the source
 * non-literal (#3798).
 */
export const fixture = createFixture({
  id: 'module-const-literal-array-loop',
  description: 'A module-const literal array loop with a row ternary and a prop read renders every row (#3798)',
  source: `
const QS = ['x', 'y']
export function ModuleConstLiteralArrayLoop(props: { on: boolean; label: string }) {
  return (
    <ul>
      {QS.map(q => (
        <li key={q} data-on={q === 'x' ? '1' : '0'} data-label={props.label}>{q}</li>
      ))}
    </ul>
  )
}
`,
  props: { on: true, label: 'L' },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" data-key="x" data-label="L" data-on="1"><!--bf:s0-->x<!--/--></li>
      <li bf="s1" data-key="y" data-label="L" data-on="0"><!--bf:s0-->y<!--/--></li>
    </ul>
  `,
})
