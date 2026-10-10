import { createFixture } from '../src/types'

/**
 * Sibling of `row-portal-ref-scope` (#3420) over what a portaled loop-row
 * element may contain: a literal `$` in text and in a string, a nested loop
 * that shadows the row variable followed by a sibling loop that reads the
 * outer one, and a child component. Every adapter renders it all at the
 * portal outlet.
 */
export const fixture = createFixture({
  id: 'row-portal-ref-contents',
  description: 'A portaled loop-row element keeps literal dollars, a shadowed row variable and a child component',
  source: `
'use client'
import { createPortal } from '@barefootjs/client'

type Kid = { id: string; name: string }
type Row = { id: string; name: string; children: Kid[] }

function Tag(props: { label: string }) {
  return <em className="tag">{props.label}</em>
}

export function RowPortalRefContents(props: { rows: Row[] }) {
  const mount = (el: HTMLElement) => {
    if (el.parentNode !== document.body) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }
  return (
    <ul>
      {props.rows.map(row => (
        <li key={row.id}>
          <div className="row" ref={mount}>
            $price:{row.name + '$'}
            {row.children.map(row => <i key={row.id}>{row.name}</i>)}
            {row.children.map(child => <b key={child.id}>{row.name}/{child.name}</b>)}
            <Tag label={row.name} />
          </div>
        </li>
      ))}
    </ul>
  )
}
`,
  props: {
    rows: [
      { id: 'r1', name: 'one', children: [{ id: 'k1', name: 'kid' }] },
      { id: 'r2', name: 'two', children: [] },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s6">
      <li data-key="r1"></li>
      <li data-key="r2"></li>
    </ul>
    <div bf-po="test" bf="s5" class="row" data-key="r1">$price:<!--bf:s0-->one$<!--/-->
      <i data-key-1="k1"><!--bf:s1-->kid<!--/--></i>
      <b data-key-1="k1"><!--bf:s2-->one<!--/-->/<!--bf:s3-->kid<!--/--></b>
      <em bf-s="test_s4" bf="s1" class="tag"><!--bf:s0-->one<!--/--></em>
    </div>
    <div bf-po="test" bf="s5" class="row" data-key="r2">$price:<!--bf:s0-->two$<!--/--><em bf-s="test_s4" bf="s1" class="tag"><!--bf:s0-->two<!--/--></em></div>
  `,
})
