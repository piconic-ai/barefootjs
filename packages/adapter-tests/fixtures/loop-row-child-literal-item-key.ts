import { createFixture } from '../src/types'

/**
 * Component loop rows over an array prop whose key and props read no row:
 * a template-literal key with the literal prefix `item-` on a child that
 * takes no props, and an index key on a child passed the string literal
 * `"item"`. Neither reads the row, so the row loop must not bind it; every
 * row carries its key as `data-key`.
 */
export const fixture = createFixture({
  id: 'loop-row-child-literal-item-key',
  description: 'Component loop rows keyed by a literal naming no row (item-<index>) carry the key as data-key',
  source: `
'use client'

function Badge() {
  return <em className="badge">badge</em>
}

function Label(props: { text: string }) {
  return <b className="label">{props.text}</b>
}

export function LoopRowChildLiteralItemKey(props: { names: string[] }) {
  return (
    <div>
      <ul className="prefix">
        {props.names.map((n, i) => <Badge key={\`item-\${i}\`} />)}
      </ul>
      <ul className="literal-prop">
        {props.names.map((n, i) => <Label key={i} text="item" />)}
      </ul>
    </div>
  )
}
`,
  props: {
    names: ['a', 'b'],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1" class="prefix">
        <em bf-s="Badge_*" class="badge" data-key="item-0">badge</em>
        <em bf-s="Badge_*" class="badge" data-key="item-1">badge</em>
      </ul>
      <ul bf="s3" class="literal-prop">
        <b bf-s="Label_*" bf="s1" class="label" data-key="0"><!--bf:s0-->item<!--/--></b>
        <b bf-s="Label_*" bf="s1" class="label" data-key="1"><!--bf:s0-->item<!--/--></b>
      </ul>
    </div>
  `,
})
