import { createFixture } from '../src/types'

/**
 * Sibling of `empty-array-condition` (the un-negated twin of
 * `negated-empty-array-condition-shapes`): a bare value as a ternary test
 * takes JS truthiness — an absent value is falsy, an empty or non-empty
 * array and an empty object are truthy, and a scalar keeps its own
 * truthiness — read through a signal, a memo, a prop, an array's
 * `.length`, and a loop row's member.
 */
export const fixture = createFixture({
  id: 'empty-array-condition-shapes',
  description: 'A bare value as a ternary test is truthy for an empty array or object and falsy when absent',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

type Row = { name: string; tags?: string[] }

export function ConditionShapes(props: {
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
  const [none] = createSignal<string[]>([])
  const tagList = createMemo(() => tags())
  return (
    <div>
      <p>{tags() ? 'empty array: truthy' : 'empty array: falsy'}</p>
      <p>{missing() ? 'absent: truthy' : 'absent: falsy'}</p>
      <p>{full() ? 'array: truthy' : 'array: falsy'}</p>
      <p>{meta() ? 'empty object: truthy' : 'empty object: falsy'}</p>
      <p>{label() ? 'empty string: truthy' : 'empty string: falsy'}</p>
      <p>{count() ? 'zero: truthy' : 'zero: falsy'}</p>
      <p>{on() ? 'false: truthy' : 'false: falsy'}</p>
      <p>{tagList() ? 'memo: truthy' : 'memo: falsy'}</p>
      <p>{props.tags ? 'prop: truthy' : 'prop: falsy'}</p>
      <p>{none().length ? 'empty length: truthy' : 'empty length: falsy'}</p>
      <p>{rows().length ? 'length: truthy' : 'length: falsy'}</p>
      <ul>
        {rows().map(r => (
          <li key={r.name}>{r.name}: {r.tags ? 'has tags' : 'no tags'}</li>
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
    rows: [{ name: 'empty', tags: [] }, { name: 'absent' }, { name: 'full', tags: ['x'] }],
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
      <p bf="s15"><!--bf-cond-start:s14-->memo: truthy<!--bf-cond-end:s14--></p>
      <p bf="s17"><!--bf-cond-start:s16-->prop: truthy<!--bf-cond-end:s16--></p>
      <p bf="s19"><!--bf-cond-start:s18-->empty length: falsy<!--bf-cond-end:s18--></p>
      <p bf="s21"><!--bf-cond-start:s20-->length: truthy<!--bf-cond-end:s20--></p>
      <ul bf="s27">
        <li bf="s26" data-key="empty"><!--bf:s22-->empty<!--/-->: <!--bf-cond-start:s23--><!--bf:s24-->has tags<!--/--><!--bf-cond-end:s23--></li>
        <li bf="s26" data-key="absent"><!--bf:s22-->absent<!--/-->: <!--bf-cond-start:s23--><!--bf:s25-->no tags<!--/--><!--bf-cond-end:s23--></li>
        <li bf="s26" data-key="full"><!--bf:s22-->full<!--/-->: <!--bf-cond-start:s23--><!--bf:s24-->has tags<!--/--><!--bf-cond-end:s23--></li>
      </ul>
    </div>
  `,
})
