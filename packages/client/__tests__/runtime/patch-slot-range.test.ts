/**
 * Unit tests for `patchSlotRange` — the in-place update primitive for a
 * `.map()` preamble-patched loop region (`<!--bf:sN-->...<!--/-->`, #2389).
 * The contract:
 *
 *   - nodes strictly between the start and end marker are replaced with the
 *     freshly parsed HTML,
 *   - both markers themselves are never removed (they stay as the region's
 *     permanent boundary for the NEXT patch),
 *   - an empty region (start immediately followed by end) accepts content,
 *   - content can shrink back down to an empty region,
 *   - a nested `bf:`-prefixed comment pair inside the region doesn't
 *     prematurely close the outer range (depth tracking),
 *   - sibling regions patch independently.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

const { patchSlotRange } = await import('../../src/runtime/patch-slot-range.ts')

function mount(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

/** Find a `<!--bf:ID-->` start comment among `root`'s children (non-recursive). */
function findStart(root: Element, id: string): Comment {
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE && node.nodeValue === `bf:${id}`) {
      return node as Comment
    }
  }
  throw new Error(`start marker bf:${id} not found`)
}

describe('patchSlotRange', () => {
  test('replaces nodes between markers', () => {
    const root = mount('<div><!--bf:s0-->old<!--/--></div>')
    const container = root.firstElementChild as HTMLElement
    const start = findStart(container, 's0')
    patchSlotRange(start, '<b>new</b>')
    expect(container.innerHTML).toBe('<!--bf:s0--><b>new</b><!--/-->')
  })

  test('empty region (start immediately followed by end) accepts content', () => {
    const root = mount('<div><!--bf:s1--><!--/--></div>')
    const container = root.firstElementChild as HTMLElement
    const start = findStart(container, 's1')
    patchSlotRange(start, 'hello')
    expect(container.innerHTML).toBe('<!--bf:s1-->hello<!--/-->')
  })

  test('region content shrinking to zero leaves an empty range', () => {
    const root = mount('<div><!--bf:s2--><p>a</p><p>b</p><!--/--></div>')
    const container = root.firstElementChild as HTMLElement
    const start = findStart(container, 's2')
    patchSlotRange(start, '')
    expect(container.innerHTML).toBe('<!--bf:s2--><!--/-->')
  })

  test('nested bf: comment pairs inside the region do not break matching', () => {
    // The nested pair mimics a leaf that itself carries an ordinary
    // text-slot marker — the outer region's own `/` must be the SECOND one,
    // not the first (which belongs to the nested pair).
    const root = mount('<div><!--bf:s3-->outer<!--bf:s9-->inner<!--/-->tail<!--/--><p>after</p></div>')
    const container = root.firstElementChild as HTMLElement
    const start = findStart(container, 's3')
    patchSlotRange(start, '<span>replaced</span>')
    expect(container.innerHTML).toBe('<!--bf:s3--><span>replaced</span><!--/--><p>after</p>')
  })

  test('multiple sibling regions patch independently', () => {
    const root = mount('<div><!--bf:s4-->a<!--/--><!--bf:s5-->b<!--/--></div>')
    const container = root.firstElementChild as HTMLElement
    const start4 = findStart(container, 's4')
    const start5 = findStart(container, 's5')
    patchSlotRange(start4, '<i>A</i>')
    expect(container.innerHTML).toBe('<!--bf:s4--><i>A</i><!--/--><!--bf:s5-->b<!--/-->')
    patchSlotRange(start5, '<i>B</i>')
    expect(container.innerHTML).toBe('<!--bf:s4--><i>A</i><!--/--><!--bf:s5--><i>B</i><!--/-->')
  })

  test('the start and end markers themselves are never removed', () => {
    const root = mount('<div><!--bf:s6-->x<!--/--></div>')
    const container = root.firstElementChild as HTMLElement
    const start = findStart(container, 's6')
    patchSlotRange(start, 'y')
    const comments = Array.from(container.childNodes).filter(n => n.nodeType === Node.COMMENT_NODE)
    expect(comments.map(c => c.nodeValue)).toEqual(['bf:s6', '/'])
  })
})

describe('$pre ownership', () => {
  test('skips a same-id marker owned by a nested bf-s scope', async () => {
    // Slot ids are per-component: a child component mounted inside the row
    // carries its own `bf:s0`. `$pre(row, 's0')` must never return it —
    // patching it would corrupt the child's DOM. The row's own marker
    // (AFTER the nested scope in document order here) is the right one.
    const { $pre } = await import('../../src/runtime/query.ts')
    const root = mount(
      '<div><section bf-s="Badge_x1"><!--bf:s0-->child<!--/--></section><!--bf:s0-->own<!--/--></div>',
    )
    const row = root.firstElementChild as HTMLElement
    const found = $pre(row, 's0')
    expect(found).not.toBeNull()
    expect(found!.parentElement).toBe(row)
    // The found marker's next sibling is the row-owned text, not the child's.
    expect(found!.nextSibling?.textContent).toBe('own')
  })

  test('returns null when the only same-id marker is inside a nested scope', async () => {
    const { $pre } = await import('../../src/runtime/query.ts')
    const root = mount('<div><section bf-s="Badge_x1"><!--bf:s0-->child<!--/--></section></div>')
    const row = root.firstElementChild as HTMLElement
    expect($pre(row, 's0')).toBeNull()
  })
})
