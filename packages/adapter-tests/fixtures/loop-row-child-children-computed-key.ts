import { createFixture } from '../src/types'

/**
 * Component loop rows that forward JSX children, over array props, keyed by
 * an expression built from the row and the index: `String(n)`, a template
 * literal and string concatenation with `+` over row fields. Every row
 * carries the key's string value as `data-key`.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-computed-key',
  description: 'Component loop rows with forwarded children keyed by a computed expression of the row and index carry its value as data-key',
  source: `
'use client'

function Tag({ children }: { children?: any }) {
  return <span className="tag">{children}</span>
}

type Row = { id: string; label: string }

export function LoopRowChildChildrenComputedKey(props: { names: string[]; rows: Row[] }) {
  return (
    <div>
      <p className="string-call">
        {props.names.map(n => <Tag key={String(n)}><i>{n}</i></Tag>)}
      </p>
      <p className="template">
        {props.names.map((n, i) => <Tag key={\`k\${n}\${i}\`}><i>{n}</i></Tag>)}
      </p>
      <p className="concat">
        {props.rows.map(r => <Tag key={r.id + '-' + r.label}><i>{r.label}</i></Tag>)}
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
      <p bf="s2" class="string-call">
        <span bf-s="Tag_*" class="tag" data-key="a"><i><!--bf:^s0-->a<!--/--></i></span>
        <span bf-s="Tag_*" class="tag" data-key="b"><i><!--bf:^s0-->b<!--/--></i></span>
      </p>
      <p bf="s5" class="template">
        <span bf-s="Tag_*" class="tag" data-key="ka0"><i><!--bf:^s3-->a<!--/--></i></span>
        <span bf-s="Tag_*" class="tag" data-key="kb1"><i><!--bf:^s3-->b<!--/--></i></span>
      </p>
      <p bf="s8" class="concat">
        <span bf-s="Tag_*" class="tag" data-key="x-X"><i><!--bf:^s6-->X<!--/--></i></span>
        <span bf-s="Tag_*" class="tag" data-key="y-Y"><i><!--bf:^s6-->Y<!--/--></i></span>
      </p>
    </div>
  `,
})
