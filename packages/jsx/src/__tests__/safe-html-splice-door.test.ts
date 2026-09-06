/**
 * Direct unit tests for `spliceChildValue`'s arm order (#2795 follow-up).
 *
 * The door's arm order changed during the #2795 migration:
 * `node.joinArrayChild` is now checked BEFORE `cx.branchSlotsVar`. Before,
 * `irToHtmlTemplate` wrapped an array in `__bfSlot` first and joined after —
 * for an element-array child (`{out}`, built by an arbitrary `.map()`
 * preamble) rendered INSIDE a conditional branch, that would have handed
 * `__bfSlot` the whole array-join expression, which stringifies an array
 * argument via `String(...)`-style coercion internally rather than joining
 * compiled-leaf HTML — corrupting already-escaped leaf markup. Joining first
 * (the current order) hands `__bfSlot` a single already-assembled HTML
 * string instead.
 *
 * PR #2858 shipped this reorder without a test exercising the co-occurrence
 * (join-array-child AND branch-slot at once) — this file is that test,
 * added directly against the door function rather than a full JSX compile,
 * since the arm order is entirely `spliceChildValue`'s own concern.
 */

import { describe, test, expect } from 'bun:test'
import { spliceChildValue } from '../ir-to-client-js/safe-html'

describe('spliceChildValue arm order', () => {
  test('joinArrayChild wins over branchSlotsVar — the array is joined, not handed to __bfSlot', () => {
    const result = spliceChildValue(
      { expr: 'out', slotId: null, joinArrayChild: true },
      'out',
      { branchSlotsVar: 'slots' },
    )
    expect(result).toBe(`Array.isArray(out) ? out.join('') : (out ?? '')`)
    expect(result).not.toContain('__bfSlot')
  })

  test('branchSlotsVar alone (no joinArrayChild) still routes through __bfSlot', () => {
    const result = spliceChildValue(
      { expr: 'value', slotId: null, joinArrayChild: false },
      'value',
      { branchSlotsVar: 'slots' },
    )
    expect(result).toBe('__bfSlot(value, slots)')
  })

  test('neither joinArrayChild nor branchSlotsVar nor slotId nor children — plain escapeText default', () => {
    const result = spliceChildValue(
      { expr: 'label', slotId: null, joinArrayChild: false },
      'label',
      {},
    )
    expect(result).toBe('escapeText(label)')
  })

  test('a markup-claimed slotId still escapes-or-unwraps even with joinArrayChild absent', () => {
    const result = spliceChildValue(
      { expr: 'title', slotId: 's0', joinArrayChild: false },
      '(title)',
      { markupSlotIds: new Set(['s0']) },
    )
    expect(result).toBe('escapeTextOrMarkup((title))')
  })
})
