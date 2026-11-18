import { createFixture } from '../src/types'

/**
 * A member read off what an index read yields: `rows[1].n`, `rows[k].n`,
 * `obj['a.b'].v`, and a longer chain through it (`rows[0].meta.z`,
 * `rows[0].cells[1].c`, `obj['a.b'].w.x`). The element is a typed row in one
 * read and decoded data under a `Record` in another, so a backend that
 * spells the member as a field path of one of them misses the other, and
 * one that appends it to the index read's key (`rows "1".n`) reads the
 * wrong receiver.
 *
 * Covered: an attribute (omitted for a row past the end), text, `.length`,
 * an optional field present and absent, a template literal, `+`, a ternary
 * test, `&&`, a child prop, a memo body, a `.filter()` predicate, a loop
 * row reading through its own index (`rows[i].id`), and the rows of an
 * untyped signal seed whose field is a nested object (`sig()[0].meta.n`).
 */
export const fixture = createFixture({
  id: 'index-read-member-chain',
  description: 'A member read off an index read gives the element field for typed rows, record values and signal rows',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

function Show(props: { v?: number | string }) {
  return <i>{props.v ?? '-'}</i>
}

type Row = { id: string; n: number; opt?: string; meta: { z: string }; cells: { c: number }[] }

export function IndexReadMemberChain(props: { rows: Row[]; k: number; obj: Record<string, { v: string; w: { x: number } }> }) {
  const [sig] = createSignal([{ id: 's', meta: { n: 1.5 } }, { id: 't', meta: { n: 0 } }])
  const picked = createMemo(() => props.rows[props.k].n)
  return (
    <div data-a={props.rows[1].id} data-miss={props.rows[5]?.id} data-v={props.obj['a.b'].v}>
      <p>{props.rows[1].n}|{props.rows[props.k].n}|{props.rows[0].meta.z}|{props.obj['a.b'].v}|{props.obj['a.b'].w.x}|{props.rows[1]?.id}|{props.rows[1].id.length}|{props.rows[0].cells[1].c}</p>
      <p>{sig()[0].meta.n}|{sig()[1].id}|{picked()}|{\`t=\${props.rows[1].id}\`}|{props.rows[1].n + 1}|{props.rows[5]?.id ?? '-'}|{props.rows[0].opt ?? '-'}|{props.rows[1].opt ?? '-'}</p>
      {props.rows[1].n === 5 ? <b>five</b> : <i>not-five</i>}
      {props.obj['a.b'].v === 'vv' ? <b>record</b> : <i>no-record</i>}
      {props.rows[props.k].meta.z === 'z1' ? <b>nested</b> : <i>no-nested</i>}
      <span>{props.rows[0].n > 1 && 'gt'}</span>
      <span>{props.obj['a.b'].w.x > 1 && 'deep'}</span>
      <Show v={props.rows[1].n} />
      <ul>{props.rows.filter(r => r.cells[0].c > 1).map(r => <li key={r.id}>{r.id}:{r.cells[0].c}</li>)}</ul>
      <ol>{props.rows.map((r, i) => <li key={r.id}>{props.rows[i].id}|{r.cells[0].c}|{props.rows[i].meta.z === 'z0' ? 'first' : 'rest'}</li>)}</ol>
    </div>
  )
}
`,
  props: {
    rows: [
      { id: 'a', n: 2, opt: 'o', meta: { z: 'z0' }, cells: [{ c: 1 }, { c: 9 }] },
      { id: 'b', n: 5, meta: { z: 'z1' }, cells: [{ c: 3 }] },
    ],
    k: 1,
    obj: { 'a.b': { v: 'vv', w: { x: 2 } } },
  },
  expectedHtml: `
    <div bf-s="test" bf="s34" data-a="b" data-v="vv">
      <p bf="s8"><!--bf:s0-->5<!--/-->|<!--bf:s1-->5<!--/-->|<!--bf:s2-->z0<!--/-->|<!--bf:s3-->vv<!--/-->|<!--bf:s4-->2<!--/-->|<!--bf:s5-->b<!--/-->|<!--bf:s6-->1<!--/-->|<!--bf:s7-->9<!--/--></p>
      <p bf="s17"><!--bf:s9-->1.5<!--/-->|<!--bf:s10-->t<!--/-->|<!--bf:s11-->5<!--/-->|<!--bf:s12-->t=b<!--/-->|<!--bf:s13-->6<!--/-->|<!--bf:s14-->-<!--/-->|<!--bf:s15-->o<!--/-->|<!--bf:s16-->-<!--/--></p>
      <b bf-c="s18">five</b>
      <b bf-c="s19">record</b>
      <b bf-c="s20">nested</b>
      <span bf="s22"><!--bf-cond-start:s21-->gt<!--bf-cond-end:s21--></span>
      <span bf="s24"><!--bf-cond-start:s23-->deep<!--bf-cond-end:s23--></span>
      <i bf-s="test_s25" bf="s1"><!--bf:s0-->5<!--/--></i>
      <ul bf="s28"><li data-key="b"><!--bf:s26-->b<!--/-->:<!--bf:s27-->3<!--/--></li></ul>
      <ol bf="s33">
        <li bf="s32" data-key="a"><!--bf:s29-->a<!--/-->|<!--bf:s30-->1<!--/-->|<!--bf-cond-start:s31-->first<!--bf-cond-end:s31--></li>
        <li bf="s32" data-key="b"><!--bf:s29-->b<!--/-->|<!--bf:s30-->3<!--/-->|<!--bf-cond-start:s31-->rest<!--bf-cond-end:s31--></li>
      </ol>
    </div>
  `,
})
