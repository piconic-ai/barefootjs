import { createFixture } from '../src/types'

/**
 * A computed index `obj[k]` reads only the object's own key, and `xs[n]`
 * only the element at an integral `n`. A key that contains `.` (`'a.b'`)
 * names the own `"a.b"` key even when a nested `a.b` exists beside it; a
 * `'*'` key names the own `"*"` key, not every value; and a fractional
 * index (`1.5`) names no element, so the read is `undefined`. A backend
 * whose lookup reads its key as a path walks into the nested value. The
 * read sits in an attribute, text, a ternary, `&&`, a child prop, a
 * concatenation and a template literal, in a loop row over the keys, and
 * in a child that destructures its props.
 */
export const fixture = createFixture({
  id: 'computed-index-own-key',
  description: 'A computed index reads the own key (a key with a dot, a * key) and no element at a fractional index',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Obj = Record<string, number | Record<string, number>>

function Pick({ obj, k }: { obj: Obj; k: string }) {
  return <b data-v={obj[k]}>{obj[k] === 1 ? 'own' : 'other'}</b>
}

export function ComputedIndexOwnKey(props: { obj: Obj; k: string; rows: number[][]; n: number }) {
  const [keys] = createSignal(['a.b', '*', 'c'])
  const [m] = createSignal(0.1)
  return (
    <div data-v={props.obj[props.k]}>
      <span>{props.obj[props.k]}</span>
      <span>{props.obj[props.k] === 1 ? 'own' : 'other'}</span>
      <span>{props.obj[props.k] === 1 && 'own'}</span>
      <span>{'v=' + props.obj[props.k]}</span>
      <span>{\`v=\${props.obj[props.k]}\`}</span>
      <Pick obj={props.obj} k={props.k} />
      <ul>{keys().map(key => <li key={key} data-v={props.obj[key]}>{props.obj[key] === 1 || props.obj[key] === 3 ? 'own' : 'other'}</li>)}</ul>
      <span data-hit={props.rows[props.n] ? 'hit' : 'miss'}>{props.rows[props.n] ? 'hit' : 'miss'}</span>
      <span>{props.rows[m()] ? 'hit' : 'miss'}</span>
      <span>{props.rows[1] ? 'hit' : 'miss'}</span>
    </div>
  )
}
`,
  props: {
    obj: { 'a.b': 1, a: { b: 2 }, '*': 3, c: 4 },
    k: 'a.b',
    rows: [[10, 20], [30, 40]],
    n: 1.1,
  },
  expectedHtml: `
    <div bf-s="test" bf="s20" data-v="1">
      <span bf="s1"><!--bf:s0-->1<!--/--></span>
      <span bf="s3"><!--bf-cond-start:s2-->own<!--bf-cond-end:s2--></span>
      <span bf="s5"><!--bf-cond-start:s4-->own<!--bf-cond-end:s4--></span>
      <span bf="s7"><!--bf:s6-->v=1<!--/--></span>
      <span bf="s9"><!--bf:s8-->v=1<!--/--></span>
      <b bf-s="test_s10" bf="s1" data-v="1"><!--bf-cond-start:s0-->own<!--bf-cond-end:s0--></b>
      <ul bf="s13">
        <li bf="s12" data-key="a.b" data-v="1"><!--bf-cond-start:s11-->own<!--bf-cond-end:s11--></li>
        <li bf="s12" data-key="*" data-v="3"><!--bf-cond-start:s11-->own<!--bf-cond-end:s11--></li>
        <li bf="s12" data-key="c" data-v="4"><!--bf-cond-start:s11-->other<!--bf-cond-end:s11--></li>
      </ul>
      <span bf="s15" data-hit="miss"><!--bf-cond-start:s14-->miss<!--bf-cond-end:s14--></span>
      <span bf="s17"><!--bf-cond-start:s16-->miss<!--bf-cond-end:s16--></span>
      <span bf="s19"><!--bf-cond-start:s18-->hit<!--bf-cond-end:s18--></span>
    </div>
  `,
})
