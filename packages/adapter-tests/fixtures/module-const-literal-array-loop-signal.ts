import { createFixture } from '../src/types'

/**
 * Sibling of `module-const-literal-array-loop` (#3798) in a client
 * component: the row reads a signal (and a memo over it) next to the row
 * itself, in an attribute, in text and in a conditional test. The signal
 * read lowers through the component's own scope in the unrolled row.
 */
export const fixture = createFixture({
  id: 'module-const-literal-array-loop-signal',
  description: 'A literal-array loop row reads a signal and the row together (#3798)',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

const QS = ['x', 'y']
export function ModuleConstLiteralArrayLoopSignal() {
  const [n, setN] = createSignal(2)
  const double = createMemo(() => n() * 2)
  return (
    <div>
      <button onClick={() => setN(n() + 1)}>inc</button>
      <ul>
        {QS.map(q => (
          <li key={q} data-n={q === 'x' ? n() : double()}>
            {q === 'x' ? n() : q}
            {n() > 2 && q === 'y' ? <b>big</b> : <i>small</i>}
          </li>
        ))}
      </ul>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <button bf="s0">inc</button>
      <ul bf="s6">
        <li bf="s5" data-key="x" data-n="2"><!--bf-cond-start:s1--><!--bf:s2-->2<!--/--><!--bf-cond-end:s1--><i bf-c="s4">small</i></li>
        <li bf="s5" data-key="y" data-n="4"><!--bf-cond-start:s1--><!--bf:s3-->y<!--/--><!--bf-cond-end:s1--><i bf-c="s4">small</i></li>
      </ul>
    </div>
  `,
})
