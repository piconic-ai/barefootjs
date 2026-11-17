import { createFixture } from '../src/types'

/**
 * Sibling of `module-const-literal-array-loop` (#3798): the literal-array
 * loop sits inside a loop over a prop. Its row reads its own value next to
 * the outer row (`r.label`), which the outer `{{range}}` binds.
 */
export const fixture = createFixture({
  id: 'module-const-literal-array-loop-in-row',
  description: 'A literal-array loop inside a prop loop reads its own row and the outer row together (#3798)',
  source: `
const QS = ['x', 'y']
export function ModuleConstLiteralArrayLoopInRow(props: { rows: { id: string; label: string }[] }) {
  return (
    <div>
      {props.rows.map(r => (
        <ul key={r.id}>
          {QS.map(q => (
            <li key={q} data-pick={q === 'x' ? r.label : 'none'}>{q === 'y' ? r.id : q}</li>
          ))}
        </ul>
      ))}
    </div>
  )
}
`,
  props: { rows: [{ id: 'r1', label: 'A' }, { id: 'r2', label: 'B' }] },
  expectedHtml: `
    <div bf-s="test" bf="s5">
      <ul bf="s4" data-key="r1">
        <li bf="s3" data-key-1="x" data-pick="A"><!--bf-cond-start:s0--><!--bf:s2-->x<!--/--><!--bf-cond-end:s0--></li>
        <li bf="s3" data-key-1="y" data-pick="none"><!--bf-cond-start:s0--><!--bf:s1-->r1<!--/--><!--bf-cond-end:s0--></li>
      </ul>
      <ul bf="s4" data-key="r2">
        <li bf="s3" data-key-1="x" data-pick="B"><!--bf-cond-start:s0--><!--bf:s2-->x<!--/--><!--bf-cond-end:s0--></li>
        <li bf="s3" data-key-1="y" data-pick="none"><!--bf-cond-start:s0--><!--bf:s1-->r2<!--/--><!--bf-cond-end:s0--></li>
      </ul>
    </div>
  `,
})
