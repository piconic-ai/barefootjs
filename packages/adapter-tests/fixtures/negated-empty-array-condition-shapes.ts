import { createFixture } from '../src/types'

/**
 * Sibling of `negated-empty-array-condition`: JS `!x` is `!Boolean(x)` across
 * value kinds. An empty array and an empty object are truthy (so `!x` is
 * false), while an absent prop, `""`, `0` and `false` are falsy. Covers `!x`
 * in a ternary test, in attribute value position (`data-x={!x}`), doubled
 * (`!!x`), as the left side of `&&`, inside a loop row, in a `.filter()`
 * predicate, and as a memo body.
 */
export const fixture = createFixture({
  id: 'negated-empty-array-condition-shapes',
  description: 'Negating an empty array or object is false and negating an absent prop, empty string, 0 or false is true, in every position',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

type Row = { name: string; tags?: string[] }

export function NegationShapes(props: {
  tags?: string[]
  missing?: string[]
  full?: string[]
  meta?: Record<string, string>
  label?: string
  count?: number
  on?: boolean
  rows?: Row[]
}) {
  const [tags] = createSignal(props.tags)
  const [missing] = createSignal(props.missing)
  const [full] = createSignal(props.full)
  const [meta] = createSignal(props.meta)
  const [label] = createSignal(props.label)
  const [count] = createSignal(props.count)
  const [on] = createSignal(props.on)
  const [rows] = createSignal(props.rows ?? [])
  const noTags = createMemo(() => !tags())
  const noMissing = createMemo(() => !missing())
  return (
    <div>
      <p>{!tags() ? 'empty array: falsy' : 'empty array: truthy'}</p>
      <p>{!missing() ? 'absent: falsy' : 'absent: truthy'}</p>
      <p>{!full() ? 'array: falsy' : 'array: truthy'}</p>
      <p>{!meta() ? 'empty object: falsy' : 'empty object: truthy'}</p>
      <p>{!label() ? 'empty string: falsy' : 'empty string: truthy'}</p>
      <p>{!count() ? 'zero: falsy' : 'zero: truthy'}</p>
      <p>{!on() ? 'false: falsy' : 'false: truthy'}</p>
      <p data-not-tags={!tags()} data-not-missing={!missing()} data-not-not-tags={!!tags()}>attributes</p>
      <p>{!!tags() ? 'double: truthy' : 'double: falsy'}</p>
      <p>{!tags() && <span>and: empty array</span>}</p>
      <p>{!missing() && <span>and: absent</span>}</p>
      <p>{noTags() ? 'memo: empty array falsy' : 'memo: empty array truthy'}</p>
      <p>{noMissing() ? 'memo: absent falsy' : 'memo: absent truthy'}</p>
      <p>{rows().filter(r => !r.tags).length} rows without tags</p>
      <ul>
        {rows().map(r => (
          <li key={r.name}>{r.name}: {!r.tags ? 'no tags' : 'has tags'}</li>
        ))}
      </ul>
    </div>
  )
}
`,
  props: {
    tags: [],
    full: ['a'],
    meta: {},
    label: '',
    count: 0,
    on: false,
    rows: [{ name: 'empty', tags: [] }, { name: 'absent' }, { name: 'one', tags: ['x'] }],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1"><!--bf-cond-start:s0-->empty array: truthy<!--bf-cond-end:s0--></p>
      <p bf="s3"><!--bf-cond-start:s2-->absent: falsy<!--bf-cond-end:s2--></p>
      <p bf="s5"><!--bf-cond-start:s4-->array: truthy<!--bf-cond-end:s4--></p>
      <p bf="s7"><!--bf-cond-start:s6-->empty object: truthy<!--bf-cond-end:s6--></p>
      <p bf="s9"><!--bf-cond-start:s8-->empty string: falsy<!--bf-cond-end:s8--></p>
      <p bf="s11"><!--bf-cond-start:s10-->zero: falsy<!--bf-cond-end:s10--></p>
      <p bf="s13"><!--bf-cond-start:s12-->false: falsy<!--bf-cond-end:s12--></p>
      <p bf="s14" data-not-missing="true" data-not-not-tags="true" data-not-tags="false">attributes</p>
      <p bf="s16"><!--bf-cond-start:s15-->double: truthy<!--bf-cond-end:s15--></p>
      <p bf="s18"><!--bf-cond-start:s17--><!--bf-cond-end:s17--></p>
      <p bf="s20"><span bf-c="s19">and: absent</span></p>
      <p bf="s22"><!--bf-cond-start:s21-->memo: empty array truthy<!--bf-cond-end:s21--></p>
      <p bf="s24"><!--bf-cond-start:s23-->memo: absent falsy<!--bf-cond-end:s23--></p>
      <p bf="s26"><!--bf:s25-->1<!--/--> rows without tags</p>
      <ul bf="s32">
        <li bf="s31" data-key="empty"><!--bf:s27-->empty<!--/-->: <!--bf-cond-start:s28--><!--bf:s30-->has tags<!--/--><!--bf-cond-end:s28--></li>
        <li bf="s31" data-key="absent"><!--bf:s27-->absent<!--/-->: <!--bf-cond-start:s28--><!--bf:s29-->no tags<!--/--><!--bf-cond-end:s28--></li>
        <li bf="s31" data-key="one"><!--bf:s27-->one<!--/-->: <!--bf-cond-start:s28--><!--bf:s30-->has tags<!--/--><!--bf-cond-end:s28--></li>
      </ul>
    </div>
  `,
})
