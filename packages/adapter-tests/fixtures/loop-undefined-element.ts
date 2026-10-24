import { createFixture } from '../src/types'

/**
 * An `undefined` element of a loop array still renders its row, as an
 * empty value, the same as a `null` element (#3610). Covers a string
 * array prop, an object array prop whose row field is `undefined` or
 * absent, a string array signal seeded with an `undefined` element, and an
 * object array signal seeded with an `undefined` row field.
 */
export const fixture = createFixture({
  id: 'loop-undefined-element',
  description: 'An undefined element of a loop array renders an empty row, like null',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Row = { id: number; label?: string }

export function LoopUndefinedElement(props: { words: (string | undefined)[]; nulls: (string | null)[]; rows: Row[] }) {
  const [tags] = createSignal<(string | undefined)[]>(['a', undefined, 'c'])
  const [items] = createSignal<Row[]>([{ id: 1, label: 'a' }, { id: 2, label: undefined }])
  return (
    <div>
      <ul class="words">{props.words.map((w, i) => <li key={i}>{w}</li>)}</ul>
      <ul class="nulls">{props.nulls.map((w, i) => <li key={i}>{w}</li>)}</ul>
      <ul class="rows">{props.rows.map(r => <li key={r.id}>{r.label}</li>)}</ul>
      <ul class="signal">{tags().map((t, i) => <li key={i}>{t}</li>)}</ul>
      <ul class="signal-rows">{items().map(r => <li key={r.id}>{r.label}</li>)}</ul>
    </div>
  )
}
`,
  props: {
    words: ['日本', undefined, 'x'],
    nulls: ['日本', null],
    rows: [{ id: 1, label: 'one' }, { id: 2, label: undefined }, { id: 3 }],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1" class="words">
        <li data-key="0"><!--bf:s0-->日本<!--/--></li>
        <li data-key="1"><!--bf:s0--><!--/--></li>
        <li data-key="2"><!--bf:s0-->x<!--/--></li>
      </ul>
      <ul bf="s3" class="nulls">
        <li data-key="0"><!--bf:s2-->日本<!--/--></li>
        <li data-key="1"><!--bf:s2--><!--/--></li>
      </ul>
      <ul bf="s5" class="rows">
        <li data-key="1"><!--bf:s4-->one<!--/--></li>
        <li data-key="2"><!--bf:s4--><!--/--></li>
        <li data-key="3"><!--bf:s4--><!--/--></li>
      </ul>
      <ul bf="s7" class="signal">
        <li data-key="0"><!--bf:s6-->a<!--/--></li>
        <li data-key="1"><!--bf:s6--><!--/--></li>
        <li data-key="2"><!--bf:s6-->c<!--/--></li>
      </ul>
      <ul bf="s9" class="signal-rows">
        <li data-key="1"><!--bf:s8-->a<!--/--></li>
        <li data-key="2"><!--bf:s8--><!--/--></li>
      </ul>
    </div>
  `,
})
