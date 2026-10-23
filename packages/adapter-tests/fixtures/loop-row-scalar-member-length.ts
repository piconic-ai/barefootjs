import { createFixture } from '../src/types'

/**
 * A member read on a plain (non-wrapper) scalar loop row
 * (`props.words.map(g => <li>{g.length}</li>)`): the row is a bare string,
 * so `g.length` reads the value's length, never a `Length` field of a row
 * record. Covers a string array prop and a string array signal (inferred
 * and explicitly typed), with the read in text, an attribute, a condition,
 * a preamble local, a prop of a component nested in the row, a condition in
 * an inner loop reading the outer row, a `?.length` on a nullable row, and
 * a fused `.filter()` predicate. The words include a multibyte one: JS
 * counts its UTF-16 code units (3), where a byte count (9) would pass the
 * `> 3` tests.
 */
export const fixture = createFixture({
  id: 'loop-row-scalar-member-length',
  description: 'A .length read on a plain string loop row reads the row value in text, attribute, condition and filter positions',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Size({ n }: { n: number }) {
  return <em data-n={n}>{n}</em>
}

export function LoopRowScalarMemberLength(props: { words: string[]; maybe: (string | null)[] }) {
  const [tags] = createSignal(['abc', 'de'])
  const [names] = createSignal<string[]>(['x', 'yyyy', '日本語'])
  return (
    <div>
      <ul class="text">{props.words.map(g => <li key={g}>{g.length}</li>)}</ul>
      <ul class="attr">{props.words.map(g => <li key={g} data-len={g.length}>{g}</li>)}</ul>
      <ul class="cond">{props.words.map(g => <li key={g}>{g.length > 3 ? <b>long</b> : <i>short</i>}</li>)}</ul>
      <ul class="local">
        {props.words.map(g => {
          const n = g.length
          return <li key={g}>{g}:{n}</li>
        })}
      </ul>
      <ul class="child">{props.words.map(g => <li key={g}><Size n={g.length} /></li>)}</ul>
      <ul class="outer">{props.words.map(g => <li key={g}>{['x'].map(l => <i key={l}>{g.length > 3 ? 'long' : 'short'}</i>)}</li>)}</ul>
      <ul class="nullable">{props.maybe.map((g, i) => <li key={i}>{g?.length}</li>)}</ul>
      <ul class="filter">{props.words.filter(w => w.length > 3).map(w => <li key={w}>{w}</li>)}</ul>
      <ul class="signal">{tags().map(t => <li key={t} data-len={t.length}>{t.length}</li>)}</ul>
      <ul class="signal-cond">{names().map(t => <li key={t}>{t.length > 3 && <b>{t}</b>}</li>)}</ul>
      <ul class="signal-filter">{names().filter(t => t.length > 3).map(t => <li key={t}>{t}</li>)}</ul>
    </div>
  )
}
`,
  props: {
    words: ['abcd', 'de', '日本語'],
    maybe: ['日本', null],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1" class="text">
        <li data-key="abcd"><!--bf:s0-->4<!--/--></li>
        <li data-key="de"><!--bf:s0-->2<!--/--></li>
        <li data-key="日本語"><!--bf:s0-->3<!--/--></li>
      </ul>
      <ul bf="s4" class="attr">
        <li bf="s3" data-key="abcd" data-len="4"><!--bf:s2-->abcd<!--/--></li>
        <li bf="s3" data-key="de" data-len="2"><!--bf:s2-->de<!--/--></li>
        <li bf="s3" data-key="日本語" data-len="3"><!--bf:s2-->日本語<!--/--></li>
      </ul>
      <ul bf="s6" class="cond">
        <li data-key="abcd"><b bf-c="s5">long</b></li>
        <li data-key="de"><i bf-c="s5">short</i></li>
        <li data-key="日本語"><i bf-c="s5">short</i></li>
      </ul>
      <ul bf="s9" class="local">
        <li data-key="abcd"><!--bf:s7-->abcd<!--/-->:<!--bf:s8-->4<!--/--></li>
        <li data-key="de"><!--bf:s7-->de<!--/-->:<!--bf:s8-->2<!--/--></li>
        <li data-key="日本語"><!--bf:s7-->日本語<!--/-->:<!--bf:s8-->3<!--/--></li>
      </ul>
      <ul bf="s11" class="child">
        <li data-key="abcd"><em bf-s="test_s10" bf="s1" data-n="4"><!--bf:s0-->4<!--/--></em></li>
        <li data-key="de"><em bf-s="test_s10" bf="s1" data-n="2"><!--bf:s0-->2<!--/--></em></li>
        <li data-key="日本語"><em bf-s="test_s10" bf="s1" data-n="3"><!--bf:s0-->3<!--/--></em></li>
      </ul>
      <ul bf="s14" class="outer">
        <li bf="s13" data-key="abcd"><i data-key-1="x"><!--bf-cond-start:s12-->long<!--bf-cond-end:s12--></i></li>
        <li bf="s13" data-key="de"><i data-key-1="x"><!--bf-cond-start:s12-->short<!--bf-cond-end:s12--></i></li>
        <li bf="s13" data-key="日本語"><i data-key-1="x"><!--bf-cond-start:s12-->short<!--bf-cond-end:s12--></i></li>
      </ul>
      <ul bf="s16" class="nullable">
        <li data-key="0"><!--bf:s15-->2<!--/--></li>
        <li data-key="1"><!--bf:s15--><!--/--></li>
      </ul>
      <ul bf="s18" class="filter"><li data-key="abcd"><!--bf:s17-->abcd<!--/--></li></ul>
      <ul bf="s21" class="signal">
        <li bf="s20" data-key="abc" data-len="3"><!--bf:s19-->3<!--/--></li>
        <li bf="s20" data-key="de" data-len="2"><!--bf:s19-->2<!--/--></li>
      </ul>
      <ul bf="s24" class="signal-cond">
        <li data-key="x"><!--bf-cond-start:s22--><!--bf-cond-end:s22--></li>
        <li data-key="yyyy"><b bf-c="s22"><!--bf:s23-->yyyy<!--/--></b></li>
        <li data-key="日本語"><!--bf-cond-start:s22--><!--bf-cond-end:s22--></li>
      </ul>
      <ul bf="s26" class="signal-filter"><li data-key="yyyy"><!--bf:s25-->yyyy<!--/--></li></ul>
    </div>
  `,
})
