import { createFixture } from '../src/types'

/**
 * Sibling of `module-const-literal-array-loop` (#3798): the row of a
 * compile-time literal array read in every position that mixes the row with
 * the component's own scope. A ternary whose branches are props, a
 * template-literal attribute, a text-position conditional on the row, a
 * `&&` child, a row-and-prop test, and a number array with `0` and a
 * fraction. A literal that spells the loop param (`'q'`) stays text.
 */
export const fixture = createFixture({
  id: 'module-const-literal-array-loop-shapes',
  description: 'A literal-array loop row reads the row and a prop together in attribute, text and conditional positions (#3798)',
  source: `
const QS = ['x', 'q']
const NS = [0, 1.5, 2]
export function ModuleConstLiteralArrayLoopShapes(props: { label: string; count: number; on: boolean }) {
  return (
    <div>
      <ul>
        {QS.map(q => (
          <li key={q} data-pick={q === 'x' ? props.label : 'none'} data-lit={q === 'q' ? 'q' : props.label} class={\`row-\${q}-\${props.label}\`} data-t={\`\${q}x\`} data-cat={props.label + q} data-or={props.label || q}>
            {q === 'x' ? props.label : q}
            {q === 'x' && <b>{props.count}</b>}
            {props.on && q === 'q' ? <i>both</i> : <s>one</s>}
          </li>
        ))}
      </ul>
      <ol>
        {NS.map(n => (
          <li key={n} data-big={n > 1 ? 'big' : 'small'} data-zero={n === 0 ? props.label : 'nz'}>
            {n}
          </li>
        ))}
      </ol>
    </div>
  )
}
`,
  props: { label: 'L', count: 0, on: true },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s8">
        <li bf="s7" class="row-x-L" data-cat="Lx" data-key="x" data-lit="L" data-or="L" data-pick="L" data-t="xx">
          <!--bf-cond-start:s0-->
          <!--bf:s1-->L<!--/-->
          <!--bf-cond-end:s0-->
          <b bf-c="s3" bf="s5"><!--bf:s4-->0<!--/--></b>
          <s bf-c="s6">one</s>
        </li>
        <li bf="s7" class="row-q-L" data-cat="Lq" data-key="q" data-lit="q" data-or="L" data-pick="none" data-t="qx"><!--bf-cond-start:s0--><!--bf:s2-->q<!--/--><!--bf-cond-end:s0--><!--bf-cond-start:s3--><!--bf-cond-end:s3--><i bf-c="s6">both</i></li>
      </ul>
      <ol bf="s11">
        <li bf="s10" data-big="small" data-key="0" data-zero="L"><!--bf:s9-->0<!--/--></li>
        <li bf="s10" data-big="big" data-key="1.5" data-zero="nz"><!--bf:s9-->1.5<!--/--></li>
        <li bf="s10" data-big="big" data-key="2" data-zero="nz"><!--bf:s9-->2<!--/--></li>
      </ol>
    </div>
  `,
})
