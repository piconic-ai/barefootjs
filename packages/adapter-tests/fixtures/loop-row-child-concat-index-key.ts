import { createFixture } from '../src/types'

/**
 * Component loop rows over an array prop keyed by a row field concatenated
 * with the index (`key={r.id + '-' + i}`), with and without forwarded
 * children. JS `+` concatenates a string and a number, so every row carries
 * `<id>-<index>` as `data-key`.
 */
export const fixture = createFixture({
  id: 'loop-row-child-concat-index-key',
  description: 'Component loop rows keyed by a row field concatenated with the index carry the joined string as data-key',
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em className="badge">{props.label}</em>
}

function Tag({ children }: { children?: any }) {
  return <span className="tag">{children}</span>
}

type Row = { id: string; label: string }

export function LoopRowChildConcatIndexKey(props: { rows: Row[] }) {
  return (
    <div>
      <ul className="bodyless">
        {props.rows.map((r, i) => <Badge key={r.id + '-' + i} label={r.label} />)}
      </ul>
      <p className="children">
        {props.rows.map((r, i) => <Tag key={r.id + '-' + i}><i>{r.label}</i></Tag>)}
      </p>
    </div>
  )
}
`,
  props: {
    rows: [
      { id: 'x', label: 'X' },
      { id: 'y', label: 'Y' },
    ],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1" class="bodyless">
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="x-0"><!--bf:s0-->X<!--/--></em>
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="y-1"><!--bf:s0-->Y<!--/--></em>
      </ul>
      <p bf="s4" class="children">
        <span bf-s="Tag_*" class="tag" data-key="x-0"><i><!--bf:^s2-->X<!--/--></i></span>
        <span bf-s="Tag_*" class="tag" data-key="y-1"><i><!--bf:^s2-->Y<!--/--></i></span>
      </p>
    </div>
  `,
})
