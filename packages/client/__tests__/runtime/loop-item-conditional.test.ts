/**
 * D4-c + 案Y contract: loop-item conditionals anchored by `<!--bf-loop-i:KEY-->`.
 *
 * Each item's conditional shares the SAME slot id (s0) across items — exactly
 * what the compiler emits for `arr.map(t => cond && <li/>)`. The range-aware
 * insert must toggle ONLY its own item's range and never touch a sibling
 * item that happens to share the slot id.
 *
 * RED until insert() accepts a Comment anchor and scopes its DOM mutations
 * to [anchor.nextSibling, nextAnchorOrLoopEnd).
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { insert } from '../../src/runtime/insert'
import { createSignal } from '../../src/reactive'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

/** Find the anchor comment whose value is `bf-loop-i:<key>` within el. */
function anchor(el: Element, key: string): Comment {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_COMMENT)
  while (w.nextNode()) {
    if ((w.currentNode as Comment).nodeValue === `bf-loop-i:${key}`) return w.currentNode as Comment
  }
  throw new Error(`anchor ${key} not found`)
}

describe('insert() range-scoped to a loop-item anchor (D4-c + Y)', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('toggling one item does not affect a sibling item sharing the slot id', () => {
    // Two items in one loop range. Item A starts true (shows <li>A</li>),
    // item B starts false (empty). Both use slot id "s0".
    document.body.innerHTML = `
      <ul bf-s="C_1">
        <!--bf-loop:l0-->
        <!--bf-loop-i:A--><li bf-c="s0" data-key="A">A</li>
        <!--bf-loop-i:B--><!--bf-cond-start:s0--><!--bf-cond-end:s0-->
        <!--bf-/loop:l0-->
      </ul>
    `
    const ul = document.querySelector('[bf-s]')!
    const [aShown, setAShown] = createSignal(true)
    const [bShown, setBShown] = createSignal(false)

    const trueA = { template: () => '<li bf-c="s0" data-key="A">A</li>', bindEvents: () => {} }
    const falseA = { template: () => '<!--bf-cond-start:s0--><!--bf-cond-end:s0-->', bindEvents: () => {} }
    const trueB = { template: () => '<li bf-c="s0" data-key="B">B</li>', bindEvents: () => {} }
    const falseB = { template: () => '<!--bf-cond-start:s0--><!--bf-cond-end:s0-->', bindEvents: () => {} }

    insert(anchor(ul, 'A') as unknown as Element, 's0', aShown, trueA, falseA)
    insert(anchor(ul, 'B') as unknown as Element, 's0', bShown, trueB, falseB)

    // Initial state preserved.
    expect(ul.querySelectorAll('li').length).toBe(1)
    expect(ul.querySelector('li')?.textContent).toBe('A')

    // Turn B on. A must stay; B must appear.
    setBShown(true)
    const after = Array.from(ul.querySelectorAll('li')).map((l) => l.textContent)
    expect(after).toEqual(['A', 'B'])

    // Turn A off. Only A's range collapses; B stays.
    setAShown(false)
    const afterOff = Array.from(ul.querySelectorAll('li')).map((l) => l.textContent)
    expect(afterOff).toEqual(['B'])
  })
})
