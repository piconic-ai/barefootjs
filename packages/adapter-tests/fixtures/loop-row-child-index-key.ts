import { createFixture } from '../src/types'

/**
 * Bodyless component loop rows over array props, keyed by the callback's
 * index param (`key={i}`): a string array and an object array. The rows are
 * built from the array prop itself, and every row carries its index as
 * `data-key`.
 */
export const fixture = createFixture({
  id: 'loop-row-child-index-key',
  description: 'Component loop rows over array props keyed by the index carry the index as data-key',
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em className="badge">{props.label}</em>
}

type Row = { id: string; label: string }

export function LoopRowChildIndexKey(props: { names: string[]; rows: Row[] }) {
  return (
    <div>
      <ul className="scalar">
        {props.names.map((n, i) => <Badge key={i} label={n} />)}
      </ul>
      <ul className="object">
        {props.rows.map((r, i) => <Badge key={i} label={r.label} />)}
      </ul>
    </div>
  )
}
`,
  props: {
    names: ['a', 'b'],
    rows: [
      { id: 'x', label: 'X' },
      { id: 'y', label: 'Y' },
    ],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1" class="scalar">
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="0"><!--bf:s0-->a<!--/--></em>
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="1"><!--bf:s0-->b<!--/--></em>
      </ul>
      <ul bf="s3" class="object">
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="0"><!--bf:s0-->X<!--/--></em>
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="1"><!--bf:s0-->Y<!--/--></em>
      </ul>
    </div>
  `,
})
