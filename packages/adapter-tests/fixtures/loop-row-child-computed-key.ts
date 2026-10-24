import { createFixture } from '../src/types'

/**
 * Bodyless component loop rows over array props, keyed by an expression
 * built from the row and the index rather than a plain row read:
 * `String(n)`, a template literal, string concatenation with `+` over row
 * fields, and numeric `+` over a number field and the index. Every row
 * carries the key's string value as `data-key`.
 */
export const fixture = createFixture({
  id: 'loop-row-child-computed-key',
  description: 'Component loop rows over array props keyed by a computed expression of the row and index carry its value as data-key',
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em className="badge">{props.label}</em>
}

type Row = { id: string; n: number; label: string }

export function LoopRowChildComputedKey(props: { names: string[]; rows: Row[] }) {
  return (
    <div>
      <ul className="string-call">
        {props.names.map(n => <Badge key={String(n)} label={n} />)}
      </ul>
      <ul className="template">
        {props.names.map((n, i) => <Badge key={\`\${n}-\${i}\`} label={n} />)}
      </ul>
      <ul className="concat">
        {props.rows.map(r => <Badge key={r.id + '-' + r.label} label={r.label} />)}
      </ul>
      <ul className="sum">
        {props.rows.map((r, i) => <Badge key={r.n + i} label={r.label} />)}
      </ul>
    </div>
  )
}
`,
  props: {
    names: ['a', 'b'],
    rows: [
      { id: 'x', n: 1, label: 'X' },
      { id: 'y', n: 2.5, label: 'Y' },
    ],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1" class="string-call">
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="a"><!--bf:s0-->a<!--/--></em>
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="b"><!--bf:s0-->b<!--/--></em>
      </ul>
      <ul bf="s3" class="template">
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="a-0"><!--bf:s0-->a<!--/--></em>
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="b-1"><!--bf:s0-->b<!--/--></em>
      </ul>
      <ul bf="s5" class="concat">
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="x-X"><!--bf:s0-->X<!--/--></em>
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="y-Y"><!--bf:s0-->Y<!--/--></em>
      </ul>
      <ul bf="s7" class="sum">
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="1"><!--bf:s0-->X<!--/--></em>
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="3.5"><!--bf:s0-->Y<!--/--></em>
      </ul>
    </div>
  `,
})
