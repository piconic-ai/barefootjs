import { createFixture } from '../src/types'

/**
 * A literal key that is not an identifier (`obj['a.b']`, `obj['*']`) reads
 * the object's own key, as `computed-index-own-key` does for a computed
 * key: `'a.b'` names the own `"a.b"` key even when a nested `a.b` exists
 * beside it, and `'*'` names the own `"*"` key, not every value. A backend
 * whose lookup reads its key as a path walks into the nested value. The
 * read sits in an attribute, text, a ternary, `&&`, a child prop and a
 * template literal, in a loop row (a member read and a destructured
 * `{ 'a.b': ab }` row param), and in a child that destructures its props.
 */
export const fixture = createFixture({
  id: 'literal-index-own-key',
  description: "A literal non-identifier key reads the own key (obj['a.b'], obj['*'])",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Obj = Record<string, number | Record<string, number>>

function Pick({ obj }: { obj: Obj }) {
  return <b data-v={obj['a.b']}>{obj['*']}</b>
}

function Show(props: { v?: number | Record<string, number> }) {
  return <i>{props.v === 1 ? 'own' : 'other'}</i>
}

export function LiteralIndexOwnKey(props: { obj: Obj }) {
  const [rows] = createSignal([{ 'a.b': 1, a: { b: 2 }, '*': 3 }])
  return (
    <div data-v={props.obj['a.b']}>
      <span>{props.obj['a.b']}</span>
      <span>{props.obj['*']}</span>
      <span>{props.obj['a.b'] === 1 ? 'own' : 'other'}</span>
      <span>{props.obj['*'] === 3 && 'own'}</span>
      <span>{\`v=\${props.obj['a.b']}\`}</span>
      <Pick obj={props.obj} />
      <Show v={props.obj['a.b']} />
      <ul>{rows().map(row => <li key={row['*']} data-v={row['a.b']}>{row['*']}</li>)}</ul>
      <ol>{rows().map(({ 'a.b': ab, '*': star }) => <li key={star} data-v={ab}>{star}</li>)}</ol>
    </div>
  )
}
`,
  props: {
    obj: { 'a.b': 1, a: { b: 2 }, '*': 3 },
  },
  expectedHtml: `
    <div bf-s="test" bf="s18" data-v="1">
      <span bf="s1"><!--bf:s0-->1<!--/--></span>
      <span bf="s3"><!--bf:s2-->3<!--/--></span>
      <span bf="s5"><!--bf-cond-start:s4-->own<!--bf-cond-end:s4--></span>
      <span bf="s7"><!--bf-cond-start:s6-->own<!--bf-cond-end:s6--></span>
      <span bf="s9"><!--bf:s8-->v=1<!--/--></span>
      <b bf-s="test_s10" bf="s1" data-v="1"><!--bf:s0-->3<!--/--></b>
      <i bf-s="test_s11" bf="s1"><!--bf-cond-start:s0-->own<!--bf-cond-end:s0--></i>
      <ul bf="s14"><li bf="s13" data-key="3" data-v="1"><!--bf:s12-->3<!--/--></li></ul>
      <ol bf="s17"><li bf="s16" data-key="3" data-v="1"><!--bf:s15-->3<!--/--></li></ol>
    </div>
  `,
})
