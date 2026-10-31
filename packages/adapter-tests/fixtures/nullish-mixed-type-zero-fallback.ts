import { createFixture } from '../src/types'

/**
 * `??` whose right operand is the zero value of a different type than the
 * left operand's (#3824 step 7): an omitted `s?: string` read as
 * `s ?? 0` renders `0`, an omitted `n?: number` read as `n ?? ''` renders
 * `''`, and an omitted `b?: boolean` read as `b ?? 0` renders `0`, as does an
 * omitted optional string field of a loop row. `n ?? 0` and `s ?? ''` are
 * the same-type controls.
 *
 * `s`, `n` and `b` are read only with a zero fallback of another type, so a
 * present `''` / `0` / `false` must stay distinguishable from an omitted one.
 *
 * An omitted alias-typed prop inside a chain still reaches the fallback
 * (`c ?? tone ?? 'fb'`), while a present `''` in the first operand stops the
 * chain (`e ?? tone ?? 'fb'` with `e = ''`). The same holds when the left
 * operand is a ternary or a `||` that can yield the alias prop, and when the
 * chain is a comparison operand, in a template and in a `.filter()`
 * predicate over an omitted row field. A `.filter()` predicate's `t.s ?? 'fb'`
 * over an omitted row field takes the fallback too.
 */
export const fixture = createFixture({
  id: 'nullish-mixed-type-zero-fallback',
  description: 'An omitted prop takes a zero fallback of another type, and an omitted alias prop inside a ?? chain reaches the fallback',
  source: `
type Tone = 'warm' | 'cool'

export function NullishMixedTypeZeroFallback(props: {
  s?: string
  n?: number
  b?: boolean
  c?: string
  e?: string
  tone?: Tone
  rows: { k: string; s?: string }[]
}) {
  return (
    <div
      data-s={props.s ?? 0}
      data-n={props.n ?? ''}
      data-b={props.b ?? 0}
      data-n-same={props.n ?? 0}
      data-s-same={props.s ?? ''}
      data-chain-omitted={props.c ?? props.tone ?? 'fb'}
      data-chain-empty={props.e ?? props.tone ?? 'fb'}
      data-cond-omitted={(props.e === '' ? props.tone : props.e) ?? 'fb'}
      data-cond-empty={(props.e === '' ? props.e : props.tone) ?? 'fb'}
      data-or-omitted={(props.c || props.tone) ?? 'fb'}
    >
      <span>[{props.s ?? 0}][{props.n ?? ''}][{props.b ?? 0}][{props.c ?? props.tone ?? 'fb'}][{props.e ?? props.tone ?? 'fb'}]</span>
      <span>{(props.c ?? props.tone ?? 'fb') === 'fb' ? 'y' : 'n'}|{(props.e ?? props.tone ?? 'fb') === '' ? 'y' : 'n'}</span>
      <ul>{props.rows.map(t => <li key={t.k} data-s={t.s ?? 0}>{t.s ?? 0}</li>)}</ul>
      <ol>{props.rows.filter(t => (t.s ?? props.tone ?? 'fb') === 'fb').map(t => <li key={t.k}>{t.k}</li>)}</ol>
      <ol>{props.rows.filter(t => (t.s ?? 'fb') === 'fb').map(t => <li key={t.k}>{t.k}</li>)}</ol>
    </div>
  )
}
`,
  props: {
    e: '',
    rows: [{ k: 'omitted' }, { k: 'set', s: 's' }],
  },
  expectedHtml: `
    <div bf-s="test" bf="s18" data-b="0" data-chain-empty="" data-chain-omitted="fb" data-cond-empty="" data-cond-omitted="fb" data-n-same="0" data-n="" data-or-omitted="fb" data-s-same="" data-s="0">
      <span bf="s5">[<!--bf:s0-->0<!--/-->][<!--bf:s1--><!--/-->][<!--bf:s2-->0<!--/-->][<!--bf:s3-->fb<!--/-->][<!--bf:s4--><!--/-->]</span>
      <span bf="s10"><!--bf-cond-start:s6-->y<!--bf-cond-end:s6-->|<!--bf-cond-start:s8-->y<!--bf-cond-end:s8--></span>
      <ul bf="s13">
        <li bf="s12" data-key="omitted" data-s="0"><!--bf:s11-->0<!--/--></li>
        <li bf="s12" data-key="set" data-s="s"><!--bf:s11-->s<!--/--></li>
      </ul>
      <ol bf="s15"><li data-key="omitted"><!--bf:s14-->omitted<!--/--></li></ol>
      <ol bf="s17"><li data-key="omitted"><!--bf:s16-->omitted<!--/--></li></ol>
    </div>
  `,
})
