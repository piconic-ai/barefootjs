import { createFixture } from '../src/types'

/**
 * A `+` whose only string operand is typed by a binding, not by a string
 * literal in the chain: a loop row field declared `string` (`r.id + i`,
 * `r.id + r.n`, a string-literal union, a nested field `r.meta.label`, an
 * element of a nested `string[]` loop, an inline element type, a
 * destructured `id`, a row of a signal), and a string prop whose name a
 * loop param elsewhere in the component reuses (`nums.map(label => …)`, a
 * `.filter(label => …)` predicate, beside `props.label`). JS `+` concatenates as soon as one
 * operand is a string, so `r.id + r.n` is `"a1"`, while a numeric field
 * (`r.n + i`) and the loop's numeric `label + 1` stay addition. Both props
 * forms (`props.x` and a destructured `{ x }`), in an attribute, text, a
 * ternary, an `&&`, a template literal and a child prop.
 *
 * A `concat` keeps the row type only when its arguments share it:
 * `none.concat(extras)` with `extras: any[]` can hold rows whose `id` is a
 * number (`r.id + 1` is `3`), while `none.concat(rows)` stays `Row`, and
 * `none.concat(others)` over a same-shaped `Other` keeps `id: string`.
 * Optional fields are `omitted-optional-row-field-plus`.
 */
export const fixture = createFixture({
  id: 'string-typed-binding-plus-concat',
  description: 'A + is string concatenation when a row field or a shadowed prop name is string-typed by its binding',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Row = { id: string; n: number; kind: 'x' | 'y'; meta: { label: string }; tags: string[] }

function Tag(props: { text: string }) {
  return <em>{props.text}</em>
}

function Rows({ rows, label, nums }: { rows: Row[]; label: string; nums: number[] }) {
  return (
    <section data-l={label + 1}>
      <p>{label + 2}</p>
      {rows.map(({ id, n }, i) => <i key={id} data-k={id + i}>{id + n}</i>)}
      {nums.map(label => <b key={label}>{label + 1}</b>)}
      {nums.filter(label => label + 1 > 1).map(v => <u key={v}>{v}</u>)}
    </section>
  )
}

interface Other { id: string }

export function StringTypedBindingPlusConcat(props: { rows: Row[]; pairs: { k: string; v: number }[]; none: Row[]; extras: any[]; others: Other[]; label: string; nums: number[]; on: boolean }) {
  const [items] = createSignal<Row[]>(props.rows)
  return (
    <div data-l={props.label + 1}>
      <span>{props.label + 1}</span>
      <ul>
        {props.rows.map((r, i) => (
          <li key={r.id} data-k={r.id + i} title={\`\${r.id + r.n}\`}>
            {r.id + r.n}
            {r.n + i}
            {r.kind + i}
            {r.meta.label + r.n}
            {r.tags.map(t => <b key={t}>{t + i}</b>)}
            {props.on ? r.id + i : 'no'}
            {props.on && r.n + r.id}
            <Tag text={r.id + r.n} />
          </li>
        ))}
      </ul>
      <ol>
        {props.nums.map(label => (
          <li key={label} data-x={label + props.label}>{label + props.label}|{label + 1}</li>
        ))}
      </ol>
      <p>{items().map(r => <s key={r.id}>{r.id + r.n}</s>)}</p>
      <p>{props.pairs.map((p, i) => <q key={p.k} data-k={p.k + i}>{p.k + p.v}</q>)}</p>
      <ol>{props.nums.filter(label => label + 1 !== 1).map(v => <li key={v}>{v}</li>)}</ol>
      <p>{props.none.concat(props.extras).map(r => <s key={r.id}>{r.id + 1}</s>)}</p>
      <p>{props.none.concat(props.rows).map(r => <s key={r.id}>{r.id + 1}</s>)}</p>
      <p>{props.none.concat(props.others).map((r, i) => <s key={i}>{r.id + 1}</s>)}</p>
      <Rows rows={props.rows} label={props.label} nums={props.nums} />
    </div>
  )
}
`,
  props: {
    rows: [
      { id: 'a', n: 1, kind: 'x', meta: { label: 'm' }, tags: ['p'] },
      { id: 'b', n: 2.5, kind: 'y', meta: { label: 'q' }, tags: [] },
    ],
    pairs: [
      { k: 'k', v: 7 },
    ],
    none: [],
    extras: [{ id: 2 }],
    others: [{ id: 'c' }],
    label: 'L',
    nums: [0, 2],
    on: true,
  },
  expectedHtml: `
    <div bf-s="test" bf="s32" data-l="L1">
      <span bf="s1"><!--bf:s0-->L1<!--/--></span>
      <ul bf="s13">
        <li bf="s12" data-k="a0" data-key="a" title="a1">
          <!--bf:s2-->a1<!--/-->
          <!--bf:s3-->1<!--/-->
          <!--bf:s4-->x0<!--/-->
          <!--bf:s5-->m1<!--/-->
          <b data-key-1="p"><!--bf:s6-->p0<!--/--></b>
          <!--bf-cond-start:s7-->
          <!--bf:s8-->a0<!--/-->
          <!--bf-cond-end:s7-->
          <!--bf-cond-start:s9-->
          <!--bf:s10-->1a<!--/-->
          <!--bf-cond-end:s9-->
          <em bf-s="test_s11" bf="s1"><!--bf:s0-->a1<!--/--></em>
        </li>
        <li bf="s12" data-k="b1" data-key="b" title="b2.5"><!--bf:s2-->b2.5<!--/--><!--bf:s3-->3.5<!--/--><!--bf:s4-->y1<!--/--><!--bf:s5-->q2.5<!--/--><!--bf-cond-start:s7--><!--bf:s8-->b1<!--/--><!--bf-cond-end:s7--><!--bf-cond-start:s9--><!--bf:s10-->2.5b<!--/--><!--bf-cond-end:s9--><em bf-s="test_s11" bf="s1"><!--bf:s0-->b2.5<!--/--></em></li>
      </ul>
      <ol bf="s17">
        <li bf="s16" data-key="0" data-x="0L"><!--bf:s14-->0L<!--/-->|<!--bf:s15-->1<!--/--></li>
        <li bf="s16" data-key="2" data-x="2L"><!--bf:s14-->2L<!--/-->|<!--bf:s15-->3<!--/--></li>
      </ol>
      <p bf="s19">
        <s data-key="a"><!--bf:s18-->a1<!--/--></s>
        <s data-key="b"><!--bf:s18-->b2.5<!--/--></s>
      </p>
      <p bf="s22"><q bf="s21" data-k="k0" data-key="k"><!--bf:s20-->k7<!--/--></q></p>
      <ol bf="s24"><li data-key="2"><!--bf:s23-->2<!--/--></li></ol>
      <p bf="s26"><s data-key="2"><!--bf:s25-->3<!--/--></s></p>
      <p bf="s28">
        <s data-key="a"><!--bf:s27-->a1<!--/--></s>
        <s data-key="b"><!--bf:s27-->b1<!--/--></s>
      </p>
      <p bf="s30"><s data-key="0"><!--bf:s29-->c1<!--/--></s></p>
      <section bf-s="test_s31" bf="s7" data-l="L1">
        <p bf="s1"><!--bf:s0-->L2<!--/--></p>
        <i bf="s3" data-k="a0" data-key="a"><!--bf:s2-->a1<!--/--></i>
        <i bf="s3" data-k="b1" data-key="b"><!--bf:s2-->b2.5<!--/--></i>
        <b bf="s5" data-key="0"><!--bf:s4-->1<!--/--></b>
        <b bf="s5" data-key="2"><!--bf:s4-->3<!--/--></b>
        <u data-key="2"><!--bf:s6-->2<!--/--></u>
      </section>
    </div>
  `,
})
