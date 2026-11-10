import { createFixture } from '../src/types'

/**
 * A module or component-local const read with a key it does not have is
 * `undefined`: an array index past the end (`QS[9]`), a non-canonical index
 * (`QS['01']`), a negative index (`QS[-1]`), a record key the literal does
 * not list (`REC['nope']`, `REC.nope`, `LOC.nope`) and a nested miss
 * (`NEST.a.c`). Hono omits the attribute and renders nothing in text; `??`
 * takes its right side and a ternary its falsy branch, in a loop row and in
 * a prop handed to a child too. The template receives the props, not the
 * consts, so a backend that reads the const as a template variable renders
 * it empty by accident or fails the render.
 *
 * Reads the literal does answer stay as they are: `NEST.a.b` is `1`,
 * `QS[-0]` is `QS[0]` and `QS.length` is `2`.
 */
export const fixture = createFixture({
  id: 'module-const-missing-key',
  description: 'a module const read with a key it does not have is undefined in every position',
  source: `
import { Kid } from './kid'
const QS = ['a', 'b']
const REC = { k: 'v' }
const NEST = { a: { b: 1 } }
export function ModuleConstMissingKey() {
  const LOC = { k: 'l' }
  return (
    <div data-a={QS[9]} data-b={QS['01']} data-c={REC['nope']} data-d={QS[-1]} data-e={REC.nope} data-f={NEST.a.c} data-g={LOC.nope} data-len={QS.length}>
      <p>{QS[9]}|{REC['nope']}|{NEST.a.c}|{LOC['nope']}|{NEST.a.b}|{QS[-0]}</p>
      <p>{QS[9] ?? 'd'}|{REC.nope ?? 'r'}|{NEST.a.c ?? 'n'}</p>
      <p>{QS[9] ? 'y' : 'n'}|{REC['nope'] ? 'y' : 'n'}|{QS[-1] ? 'y' : 'n'}|{LOC.nope ? 'y' : 'n'}</p>
      {QS[2] && <b>no</b>}
      <ul>
        {['x', 'y'].map(r => (
          <li key={r} data-m={QS[5]}>{r}{QS[5] ?? '-'}{REC.nope ? '+' : '.'}</li>
        ))}
      </ul>
      <Kid v={QS[9]} w={REC.nope} />
    </div>
  )
}
`,
  components: {
    './kid.tsx': `
export function Kid({ v, w }: { v?: string; w?: string }) {
  return <i title={v} data-w={w}>{v ?? 'kv'}|{w ? 'kw' : 'nw'}</i>
}
`,
  },
  expectedHtml: `
    <div bf-s="test" data-len="2">
      <p>||||1|a</p>
      <p>d|r|n</p>
      <p>n|n|n|n</p>
      <ul bf="s1">
        <li data-key="x"><!--bf:s0-->x<!--/-->-.</li>
        <li data-key="y"><!--bf:s0-->y<!--/-->-.</li>
      </ul>
      <i bf-s="test_s2" bf="s2"><!--bf:s0-->kv<!--/-->|<!--bf-cond-start:s1-->nw<!--bf-cond-end:s1--></i>
    </div>
  `,
})
