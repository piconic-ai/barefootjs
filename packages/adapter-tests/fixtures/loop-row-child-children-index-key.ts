import { createFixture } from '../src/types'

/**
 * Component loop rows that forward JSX children, over array props, keyed by
 * the callback's index param (`key={i}`): a string array and an object
 * array. Every row carries its index as `data-key`.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-index-key',
  description: 'Component loop rows with forwarded children keyed by the index carry the index as data-key',
  source: `
'use client'

function Tag({ children }: { children?: any }) {
  return <span className="tag">{children}</span>
}

type Row = { id: string; label: string }

export function LoopRowChildChildrenIndexKey(props: { names: string[]; rows: Row[] }) {
  return (
    <div>
      <p className="scalar">
        {props.names.map((n, i) => <Tag key={i}><i>{n}</i></Tag>)}
      </p>
      <p className="object">
        {props.rows.map((r, i) => <Tag key={i}><i>{r.label}</i></Tag>)}
      </p>
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
      <p bf="s2" class="scalar">
        <span bf-s="Tag_*" class="tag" data-key="0"><i><!--bf:^s0-->a<!--/--></i></span>
        <span bf-s="Tag_*" class="tag" data-key="1"><i><!--bf:^s0-->b<!--/--></i></span>
      </p>
      <p bf="s5" class="object">
        <span bf-s="Tag_*" class="tag" data-key="0"><i><!--bf:^s3-->X<!--/--></i></span>
        <span bf-s="Tag_*" class="tag" data-key="1"><i><!--bf:^s3-->Y<!--/--></i></span>
      </p>
    </div>
  `,
})
