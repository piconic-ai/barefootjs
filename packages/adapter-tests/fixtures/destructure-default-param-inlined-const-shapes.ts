import { createFixture } from '../src/types'

/**
 * Component-scope consts reading parameter props whose defaults are not
 * primitive literals, through every expression shape and read position: an
 * array default read by a call and a ternary, an object default read in a
 * template literal, a computed default, a renamed binding (`items: list =
 * [...]`), a const reading another such const, a memo over one, a loop over
 * one (with one read in its row) and a conditional on one, beside a rest binding read for one key. The client template binds each
 * prop with its default once, so an omitted prop renders its default.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-const-shapes',
  description: 'Inlined consts over parameter props with allocating or computed defaults apply each default in every shape and position',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultParamInlinedConstShapes({ b = ['y', 'z'], o = { k: 'v' }, n = 1 + 1, items: list = ['p', 'q'], ...rest }: { b?: string[]; o?: { k: string }; n?: number; items?: string[]; id?: string }) {
  const joined = b.join('-')
  const pick = b.length > 1 ? 'many' : 'one'
  const text = \`\${o.k}:\${n}\`
  const sizes = [list.length, n]
  const chained = [joined, sizes[0]]
  const rows = [b[0], o.k, list[1]]
  const shout = createMemo(() => joined + '!')
  return (
    <div id={rest.id}>
      <p>{joined}|{pick}|{text}|{sizes[1]}|{chained[0]}|{chained[1]}|{shout()}</p>
      <ul>{rows.map((x) => <li key={x}>{x}:{pick}</li>)}</ul>
      {sizes[0] > 1 ? <span>{chained[0]}</span> : <em>none</em>}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s15">
      <p bf="s7"><!--bf:s0-->y-z<!--/-->|<!--bf:s1-->many<!--/-->|<!--bf:s2-->v:2<!--/-->|<!--bf:s3-->2<!--/-->|<!--bf:s4-->y-z<!--/-->|<!--bf:s5-->2<!--/-->|<!--bf:s6-->y-z!<!--/--></p>
      <ul bf="s11">
        <li bf="s10" data-key="y"><!--bf:s8-->y<!--/-->:<!--bf:s9-->many<!--/--></li>
        <li bf="s10" data-key="v"><!--bf:s8-->v<!--/-->:<!--bf:s9-->many<!--/--></li>
        <li bf="s10" data-key="q"><!--bf:s8-->q<!--/-->:<!--bf:s9-->many<!--/--></li>
      </ul>
      <span bf-c="s12" bf="s14"><!--bf:s13-->y-z<!--/--></span>
    </div>
  `,
  dataPoints: [
    { name: 'all-present', props: { b: ['s'], o: { k: 'w' }, n: 5, items: ['r'], id: 'x' } },
  ],
})
