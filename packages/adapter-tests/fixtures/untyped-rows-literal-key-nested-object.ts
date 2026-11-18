import { createFixture } from '../src/types'

/**
 * Untyped object-literal rows whose keys are not all identifiers (`'a.b'`,
 * `'*'`, `'data-on'`, `'x-y'`) and whose fields hold nested objects
 * (`meta: { n, 'x-y', deep: { z } }`), as a signal seed and as a module
 * const. `literal-index-own-key` reads one such row; here two rows differ
 * in every field, with a fraction, `0`, `''` and both booleans, so a row
 * that is dropped, or a key read through a derived name, shows.
 *
 * Read by a literal key and by a member chain in an attribute, text, a
 * ternary, `&&` and a template literal; through a destructured row param
 * that renames non-identifier keys at two depths; in a `.filter()`
 * predicate; as a prop of a child in the row; and by a memo over the rows.
 */
export const fixture = createFixture({
  id: 'untyped-rows-literal-key-nested-object',
  description: 'Untyped object-literal rows with non-identifier keys and nested objects render every row',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

function Show(props: { v?: number | string }) {
  return <i>{props.v ?? '-'}</i>
}

const OPTS = [
  { id: 'm', 'x-y': 'one', meta: { n: 1 } },
  { id: 'n', 'x-y': 'two', meta: { n: 2 } },
]

export function UntypedRowsLiteralKeyNestedObject() {
  const [rows] = createSignal([
    { id: 'a', 'a.b': 1.5, '*': 'star', 'data-on': true, meta: { n: 0, 'x-y': 'in', deep: { z: 'd1' } }, tags: ['t1', 't2'] },
    { id: 'b', 'a.b': 0, '*': '', 'data-on': false, meta: { n: 7, 'x-y': '', deep: { z: 'd2' } }, tags: [] },
  ])
  const count = createMemo(() => rows().length)
  return (
    <div>
      <p>{count()}</p>
      <ul>{rows().map(row => (
        <li key={row.id} data-ab={row['a.b']} data-star={row['*']} data-n={row.meta.n}>
          {row['a.b']}|{row['*']}|{row.meta.n}|{row.meta['x-y']}|{row.meta.deep.z}|{row['data-on'] ? 'on' : 'off'}|{row['a.b'] === 0 && 'zero'}|{\`t=\${row['*']}\`}|{row.tags.length}
        </li>
      ))}</ul>
      <ol>{rows().map(({ id, 'a.b': ab, '*': star, meta: { n, 'x-y': xy, deep: { z } } }) => (
        <li key={id} data-ab={ab}>{ab}|{star}|{n}|{xy}|{z}</li>
      ))}</ol>
      <ul>{rows().filter(r => r['a.b'] > 1).map(r => <li key={r.id}>{r.id}:{r.meta.n}</li>)}</ul>
      <ul>{rows().map(row => <li key={row.id}><Show v={row['a.b']} /><Show v={row.meta['x-y']} /></li>)}</ul>
      <ul>{OPTS.map(o => <li key={o.id} data-xy={o['x-y']}>{o['x-y']}|{o.meta.n}</li>)}</ul>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1"><!--bf:s0-->2<!--/--></p>
      <ul bf="s12">
        <li bf="s11" data-ab="1.5" data-key="a" data-n="0" data-star="star"><!--bf:s2-->1.5<!--/-->|<!--bf:s3-->star<!--/-->|<!--bf:s4-->0<!--/-->|<!--bf:s5-->in<!--/-->|<!--bf:s6-->d1<!--/-->|<!--bf-cond-start:s7-->on<!--bf-cond-end:s7-->|<!--bf-cond-start:s8--><!--bf-cond-end:s8-->|<!--bf:s9-->t=star<!--/-->|<!--bf:s10-->2<!--/--></li>
        <li bf="s11" data-ab="0" data-key="b" data-n="7" data-star=""><!--bf:s2-->0<!--/-->|<!--bf:s3--><!--/-->|<!--bf:s4-->7<!--/-->|<!--bf:s5--><!--/-->|<!--bf:s6-->d2<!--/-->|<!--bf-cond-start:s7-->off<!--bf-cond-end:s7-->|<!--bf-cond-start:s8-->zero<!--bf-cond-end:s8-->|<!--bf:s9-->t=<!--/-->|<!--bf:s10-->0<!--/--></li>
      </ul>
      <ol bf="s19">
        <li bf="s18" data-ab="1.5" data-key="a"><!--bf:s13-->1.5<!--/-->|<!--bf:s14-->star<!--/-->|<!--bf:s15-->0<!--/-->|<!--bf:s16-->in<!--/-->|<!--bf:s17-->d1<!--/--></li>
        <li bf="s18" data-ab="0" data-key="b"><!--bf:s13-->0<!--/-->|<!--bf:s14--><!--/-->|<!--bf:s15-->7<!--/-->|<!--bf:s16--><!--/-->|<!--bf:s17-->d2<!--/--></li>
      </ol>
      <ul bf="s22"><li data-key="a"><!--bf:s20-->a<!--/-->:<!--bf:s21-->0<!--/--></li></ul>
      <ul bf="s25">
        <li data-key="a">
          <i bf-s="test_s23" bf="s1"><!--bf:s0-->1.5<!--/--></i>
          <i bf-s="test_s24" bf="s1"><!--bf:s0-->in<!--/--></i>
        </li>
        <li data-key="b">
          <i bf-s="test_s23" bf="s1"><!--bf:s0-->0<!--/--></i>
          <i bf-s="test_s24" bf="s1"><!--bf:s0--><!--/--></i>
        </li>
      </ul>
      <ul bf="s29">
        <li bf="s28" data-key="m" data-xy="one"><!--bf:s26-->one<!--/-->|<!--bf:s27-->1<!--/--></li>
        <li bf="s28" data-key="n" data-xy="two"><!--bf:s26-->two<!--/-->|<!--bf:s27-->2<!--/--></li>
      </ul>
    </div>
  `,
})
