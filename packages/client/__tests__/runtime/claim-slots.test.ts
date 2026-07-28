/**
 * Unit tests for `claimSlots` / `lazySlots` — the claim-plan interpreter
 * and claimed-slot primitives (slot unification A2,
 * `spec/slot-unification.md` §4/§5-A2). Anchors are the existing
 * `<!--bf:sN-->…<!--/-->` marker pairs (SSR bytes unchanged in Step A), but
 * once claimed, writes go through held references and never re-scan.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

const { claimSlots, lazySlots } = await import('../../src/runtime/claim-slots.ts')
const { commentScopeRegistry } = await import('../../src/runtime/scope.ts')
type SlotSpec = import('../../src/runtime/claim-slots.ts').SlotSpec

function mount(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

function withWarnings(fn: () => void): string[] {
  const warnings: string[] = []
  const orig = console.warn
  console.warn = (msg: string) => {
    warnings.push(String(msg))
  }
  try {
    fn()
  } finally {
    console.warn = orig
  }
  return warnings
}

describe('claimSlots — text kind', () => {
  test('adopts an existing Text node after the marker', () => {
    const root = mount('<div><!--bf:s0-->hello<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's0', kind: 'text', path: [0] }]
    const before = row.childNodes[1]
    expect(before.nodeType).toBe(Node.TEXT_NODE)

    const claimed = claimSlots(row, plan)
    claimed.write('s0', 'updated')

    expect(row.childNodes[1]).toBe(before) // adopted, not replaced
    expect(row.innerHTML).toBe('<!--bf:s0-->updated<!--/-->')
  })

  test('claiming an SSR-empty slot creates NOTHING; the first write materializes the Text node', () => {
    const root = mount('<div><!--bf:s1--><!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's1', kind: 'text', path: [0] }]

    // The claim is non-mutating (§9.3(1)): a seed that only compares must
    // not leave an empty Text node behind on every row it inspects.
    const claimed = claimSlots(row, plan)
    expect(row.childNodes.length).toBe(2)
    expect(row.childNodes[1]?.nodeType).toBe(Node.COMMENT_NODE)
    expect(claimed.read('s1')).toBe('')

    // The write creates it, at the recorded position.
    claimed.write('s1', 'now')
    expect(row.childNodes[1]?.nodeType).toBe(Node.TEXT_NODE)
    expect(row.innerHTML).toBe('<!--bf:s1-->now<!--/-->')
  })

  test('writes preserve Text node identity across repeated writes', () => {
    const root = mount('<div><!--bf:s2-->x<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's2', kind: 'text', path: [0] }]

    const claimed = claimSlots(row, plan)
    const ref = row.childNodes[1]
    claimed.write('s2', 'one')
    expect(row.childNodes[1]).toBe(ref)
    claimed.write('s2', 'two')
    expect(row.childNodes[1]).toBe(ref)
    expect(row.innerHTML).toBe('<!--bf:s2-->two<!--/-->')
  })
})

describe('claimSlots — markup kind', () => {
  // Regression pin (slot unification A3 follow-up): an earlier revision
  // skipped the DOM patch on a 'markup' slot's first-ever write, "trusting"
  // that the claimed range already held matching SSR/CSR content — sound
  // only for the narrow loop-row-reuse case that discipline was lifted
  // from, not in general. A first write whose value genuinely differs from
  // what's already in the DOM (client-only state a server-rendered range
  // can't have known about, e.g. `createSignal(readFromLocalStorage())`
  // after a client-side region swap) must still land.
  test('the first write patches even when the value differs from the content already in the range', () => {
    const root = mount('<div><!--bf:s3-->stale-default<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's3', kind: 'markup', path: [0] }]

    const claimed = claimSlots(row, plan)
    claimed.write('s3', 'real-value') // first write ever — must not be swallowed
    expect(row.innerHTML).toBe('<!--bf:s3-->real-value<!--/-->')
  })

  test('the first write re-parses the range even when the value happens to match the SSR/CSR content', () => {
    const root = mount('<div><!--bf:s3z-->old<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's3z', kind: 'markup', path: [0] }]
    const originalTextNode = row.childNodes[1]

    const claimed = claimSlots(row, plan)
    claimed.write('s3z', 'old') // same string as the SSR content — still patches
    expect(row.innerHTML).toBe('<!--bf:s3z-->old<!--/-->')
    // Content reads the same, but the write actually ran: the original SSR
    // text node was cleared and a freshly template-parsed one took its
    // place, proving this wasn't skipped.
    expect(row.childNodes[1]).not.toBe(originalTextNode)
  })

  test('holds boundaries and patches string content on the second write', () => {
    const root = mount('<div><!--bf:s3-->old<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's3', kind: 'markup', path: [0] }]

    const claimed = claimSlots(row, plan)
    claimed.write('s3', 'old') // first write: patches immediately (no seed-without-patch)
    claimed.write('s3', '<b>new</b>')
    expect(row.innerHTML).toBe('<!--bf:s3--><b>new</b><!--/-->')
  })

  test('dedup: an unchanged string skips the DOM patch entirely', () => {
    const root = mount('<div><!--bf:s3b-->old<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's3b', kind: 'markup', path: [0] }]

    const claimed = claimSlots(row, plan)
    claimed.write('s3b', 'old') // first write (patches; content happens to already read 'old')
    const textNode = row.childNodes[1]
    claimed.write('s3b', 'old') // same value again — must not clear/re-insert
    expect(row.childNodes[1]).toBe(textNode) // identity preserved, no patch happened
    expect(row.innerHTML).toBe('<!--bf:s3b-->old<!--/-->')
  })

  test('nested bf: comment pairs inside the range do not break matching', () => {
    const root = mount(
      '<div><!--bf:s4-->outer<!--bf:s9-->inner<!--/-->tail<!--/--><p>after</p></div>',
    )
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's4', kind: 'markup', path: [0] }]

    const claimed = claimSlots(row, plan)
    claimed.write('s4', 'outer<!--bf:s9-->inner<!--/-->tail') // first write (matches SSR range)
    claimed.write('s4', '<span>replaced</span>')
    expect(row.innerHTML).toBe('<!--bf:s4--><span>replaced</span><!--/--><p>after</p>')
  })

  test('empty -> content -> empty roundtrip; boundaries never removed', () => {
    const root = mount('<div><!--bf:s5--><!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's5', kind: 'markup', path: [0] }]

    const claimed = claimSlots(row, plan)
    const start = row.childNodes[0]
    const end = row.childNodes[1]

    claimed.write('s5', '') // first write: SSR range was already empty
    claimed.write('s5', 'hello')
    expect(row.innerHTML).toBe('<!--bf:s5-->hello<!--/-->')
    claimed.write('s5', '')
    expect(row.innerHTML).toBe('<!--bf:s5--><!--/-->')

    const comments = Array.from(row.childNodes).filter(n => n.nodeType === Node.COMMENT_NODE)
    expect(comments).toEqual([start, end])
  })

  // Folded from the deleted `patch-slot-range.test.ts` (slot unification
  // A3 — `patchSlotRange` is superseded by claimed 'markup' slots): a
  // dangling start marker with no matching end comment must warn and do
  // nothing rather than guess a boundary.
  test('a slot with no end marker warns and drops that slot only', () => {
    const root = mount('<div><!--bf:s7-->dangling</div>')
    const row = root.firstElementChild as HTMLElement
    const before = row.innerHTML
    const plan: SlotSpec[] = [{ id: 's7', kind: 'markup', path: [0] }]

    const warnings = withWarnings(() => {
      const claimed = claimSlots(row, plan)
      claimed.write('s7', 'patched')
    })

    expect(row.innerHTML).toBe(before)
    expect(warnings.some(w => w.includes('s7') && w.includes('no end marker'))).toBe(true)
  })

  test('splices a Node value in by identity', () => {
    const root = mount('<div><!--bf:s6-->old<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's6', kind: 'markup', path: [0] }]

    const el = document.createElement('b')
    el.textContent = 'X'
    const claimed = claimSlots(row, plan)
    claimed.write('s6', el)

    expect(row.innerHTML).toBe('<!--bf:s6--><b>X</b><!--/-->')
    expect(row.childNodes[1]).toBe(el)
  })

  // Folded from `dynamic-text.test.ts` (`__bfText`'s Node-identity pins) —
  // `writeMarkup` provides the same "the `__bfText` live-Node case" contract
  // A2's docstring promises.
  test('a repeated write of the SAME Node is a no-op (identity dedup)', () => {
    const root = mount('<div><!--bf:s6b-->old<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's6b', kind: 'markup', path: [0] }]

    const el = document.createElement('b')
    el.textContent = 'X'
    const claimed = claimSlots(row, plan)
    claimed.write('s6b', el)
    claimed.write('s6b', el) // same Node again — must not clear/reinsert
    expect(row.childNodes[1]).toBe(el)
    expect(row.innerHTML).toBe('<!--bf:s6b--><b>X</b><!--/-->')
  })

  test('writing a NEW Node replaces the previously-spliced one', () => {
    const root = mount('<div><!--bf:s6c-->old<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's6c', kind: 'markup', path: [0] }]
    const claimed = claimSlots(row, plan)

    const first = document.createElement('span')
    first.textContent = 'a'
    claimed.write('s6c', first)
    const second = document.createElement('span')
    second.textContent = 'b'
    claimed.write('s6c', second)

    expect(row.contains(first)).toBe(false)
    expect(row.childNodes[1]).toBe(second)
    expect(row.innerHTML).toBe('<!--bf:s6c--><span>b</span><!--/-->')
  })

  test('switching from a Node value back to a string replaces it', () => {
    const root = mount('<div><!--bf:s6d-->old<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's6d', kind: 'markup', path: [0] }]
    const claimed = claimSlots(row, plan)

    const el = document.createElement('span')
    el.textContent = 'node'
    claimed.write('s6d', el)
    claimed.write('s6d', 'plain')

    expect(row.contains(el)).toBe(false)
    expect(row.innerHTML).toBe('<!--bf:s6d-->plain<!--/-->')
  })

  // Folded from `dynamic-text.test.ts` (`__bfText`'s `__isSlot` guard, #1663):
  // a caller-passed JSX prop containing a component is wrapped with
  // `__slot()`; writing it must leave the server-rendered DOM untouched
  // entirely — no clear, no re-parse, and no `last` update (so a later real
  // value still gets a correct dedup read).
  test('preserves server-rendered DOM for __isSlot markers, and does not disturb dedup state', () => {
    const root = mount('<div><!--bf:s6e-->ssr<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's6e', kind: 'markup', path: [0] }]
    const claimed = claimSlots(row, plan)

    const slotMarker = { __isSlot: true }
    claimed.write('s6e', slotMarker)
    expect(row.innerHTML).toBe('<!--bf:s6e-->ssr<!--/-->') // untouched

    // The __isSlot write never seeded `last` — this first REAL write still
    // patches (content happens to read the same, since it matches the SSR
    // text) and THEN seeds `last`, so the next unchanged write dedups.
    claimed.write('s6e', 'ssr')
    expect(row.innerHTML).toBe('<!--bf:s6e-->ssr<!--/-->')
    claimed.write('s6e', 'changed')
    expect(row.innerHTML).toBe('<!--bf:s6e-->changed<!--/-->')
  })
})

describe('claimSlots — markerless text kind (slot unification Step B)', () => {
  // No `<!--bf:id-->` marker at all — `path`'s last index is the slot's OWN
  // position in its parent's childNodes, not an anchor comment.
  test('adopts an existing Text node at the path position (SSR rendered non-empty)', () => {
    const root = mount('<div><span>a</span>hello<b>z</b></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's20', kind: 'text', path: [1], markerless: true }]
    const before = row.childNodes[1]
    expect(before.nodeType).toBe(Node.TEXT_NODE)

    const claimed = claimSlots(row, plan)
    claimed.write('s20', 'updated')

    expect(row.childNodes[1]).toBe(before) // adopted, not replaced
    expect(row.innerHTML).toBe('<span>a</span>updated<b>z</b>')
  })

  test('claiming an empty path position creates nothing; the write inserts there', () => {
    const root = mount('<div><span>a</span><b>z</b></div>')
    const row = root.firstElementChild as HTMLElement
    // Position 1 is empty (the client-only slot rendered nothing at SSR) —
    // <b> currently sits at index 1.
    const plan: SlotSpec[] = [{ id: 's21', kind: 'text', path: [1], markerless: true }]

    // Non-mutating claim: nothing is inserted until a write needs it.
    const probe = claimSlots(root.firstElementChild as HTMLElement, plan)
    expect(row.childNodes[1]?.nodeType).toBe(Node.ELEMENT_NODE)
    expect(row.innerHTML).toBe('<span>a</span><b>z</b>')
    expect(probe.read('s21')).toBe('')

    const claimed = claimSlots(row, plan)
    claimed.write('s21', 'hi')
    expect(row.childNodes[1]?.nodeType).toBe(Node.TEXT_NODE)
    expect(row.innerHTML).toBe('<span>a</span>hi<b>z</b>')
  })

  test('creates a Text node appended at the end when the path index is past childNodes.length', () => {
    const root = mount('<div><span>a</span></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's22', kind: 'text', path: [1], markerless: true }]

    const claimed = claimSlots(row, plan)
    claimed.write('s22', 'tail')
    expect(row.innerHTML).toBe('<span>a</span>tail')
  })

  test('writes preserve Text node identity across repeated writes', () => {
    const root = mount('<div><span>a</span><b>z</b></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's23', kind: 'text', path: [1], markerless: true }]

    const claimed = claimSlots(row, plan)
    claimed.write('s23', 'one')
    const ref = row.childNodes[1]
    claimed.write('s23', 'two')
    expect(row.childNodes[1]).toBe(ref)
    expect(row.innerHTML).toBe('<span>a</span>two<b>z</b>')
  })

  test('a nested path resolves through an intermediate element', () => {
    const root = mount('<div><p><span>a</span></p></div>')
    const row = root.firstElementChild as HTMLElement
    // path [0, 1]: row.childNodes[0] is <p>, then index 1 within <p> (after
    // <span>, which sits at index 0) — nothing there yet.
    const plan: SlotSpec[] = [{ id: 's24', kind: 'text', path: [0, 1], markerless: true }]

    const claimed = claimSlots(row, plan)
    claimed.write('s24', 'nested')
    expect(row.innerHTML).toBe('<p><span>a</span>nested</p>')
  })

  test('an empty markerless path warns and drops the slot without touching the DOM', () => {
    const root = mount('<div>hello</div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's25', kind: 'text', path: [], markerless: true }]
    const before = row.innerHTML

    const warnings = withWarnings(() => {
      const claimed = claimSlots(row, plan)
      claimed.write('s25', 'x')
    })

    expect(row.innerHTML).toBe(before)
    expect(warnings.some(w => w.includes('s25') && w.includes('empty path'))).toBe(true)
  })

  test('a markerless path that misses its parent warns and drops only that slot', () => {
    const root = mount('<div>hello</div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [
      { id: 's26', kind: 'text', path: [99, 0], markerless: true },
      { id: 's27', kind: 'text', path: [0], markerless: false },
    ]

    const warnings = withWarnings(() => {
      const claimed = claimSlots(row, plan)
      claimed.write('s26', 'never applied')
      claimed.write('s27', 'still works')
    })

    // s27's write goes through the ordinary marker-scan path (no bf:s27
    // marker exists, so it warns too, via the existing fallback) — the
    // point of this test is that s26's failure doesn't take s27 down with
    // it. Assert s26's specific warning is present.
    expect(warnings.some(w => w.includes('s26') && w.includes('did not resolve to a parent'))).toBe(true)
  })

  test('lazySlots batch-claims a markerless slot alongside a marked one', () => {
    const root = mount('<div><!--bf:s28-->x<!--/--><span>a</span></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [
      { id: 's28', kind: 'text', path: [0] },
      { id: 's29', kind: 'text', path: [4], markerless: true }, // after <span>, nothing there yet
    ]

    const write = lazySlots(row, plan)
    write('s28', 'y')
    write('s29', 'z')

    expect(row.innerHTML).toBe('<!--bf:s28-->y<!--/--><span>a</span>z')
  })
})

describe('lazySlots', () => {
  test('does nothing to the DOM before the first write', () => {
    const root = mount('<div><!--bf:s7--><!--/--><!--bf:s8-->x<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [
      { id: 's7', kind: 'text', path: [0] },
      { id: 's8', kind: 'markup', path: [2] },
    ]
    const before = Array.from(row.childNodes)

    lazySlots(row, plan) // constructing the writer must not touch the DOM

    expect(Array.from(row.childNodes)).toEqual(before)
    // s7 is an empty text slot — claiming it would have created a Text node.
    expect(row.childNodes[1]?.nodeType).toBe(Node.COMMENT_NODE)
  })

  test('first write claims the WHOLE plan at once (batch-claim)', () => {
    const root = mount('<div><!--bf:sA-->A0<!--/--><!--bf:sB-->B0<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [
      { id: 'sA', kind: 'text', path: [0] },
      { id: 'sB', kind: 'markup', path: [3] },
    ]

    const write = lazySlots(row, plan)
    write('sA', 'A1') // claims sA AND sB now, holding sB's TRUE end ref
    write('sB', 'B0') // first write for sB — patches (content matches SSR already)

    // External mutation: inject a spurious `/`-comment inside sB's range,
    // strictly before the TRUE end comment already held.
    const trueEnd = row.childNodes[5]
    expect((trueEnd as Comment).nodeValue).toBe('/')
    row.insertBefore(document.createComment('/'), trueEnd)

    write('sB', 'B1')

    // If sB's boundaries had been (re-)resolved by a fresh scan at this
    // point instead of during the batch claim, the scan would stop at the
    // injected `/` and leave the true end (plus the injected one) behind —
    // producing a trailing double `<!--/--><!--/-->`. Hitting the
    // pre-mutation ref instead clears through the injected node and leaves
    // exactly one `/`.
    expect(row.innerHTML).toBe('<!--bf:sA-->A1<!--/--><!--bf:sB-->B1<!--/-->')
  })
})

describe('comment-scope proxy claim root (#1665 whole-item loop conditionals)', () => {
  // `insert.ts`'s `makeRegion()` hands `bindEvents` — and therefore this
  // module's `root` — a DETACHED `<bf-loop-item>` proxy registered in
  // `commentScopeRegistry`, not the loop item's real container. The proxy
  // has no DOM children of its own; the item's real content lives as
  // SIBLINGS of the registered `<!--bf-loop-i:key-->` comment in the actual
  // document. A bare `document.createTreeWalker(root, …)` (root = the
  // childless proxy) finds nothing — this is the exact shape that must
  // resolve via `commentsInScope`'s comment-scope-aware walk instead.
  function mountLoopItemProxy(rangeHtml: string): { proxy: Element; root: Element } {
    const root = document.createElement('div')
    root.innerHTML = `<!--bf-loop-i:k1-->${rangeHtml}<!--bf-loop-i:k2-->`
    const anchor = root.firstChild as Comment
    const proxy = document.createElement('bf-loop-item')
    commentScopeRegistry.set(proxy, { commentNode: anchor, scopeId: '' })
    return { proxy, root }
  }

  test('text kind resolves through the sibling range, not the (empty) proxy', () => {
    const { proxy, root } = mountLoopItemProxy('<!--bf:s0-->x<!--/-->')
    const plan: SlotSpec[] = [{ id: 's0', kind: 'text', path: [] }]

    const claimed = claimSlots(proxy, plan)
    claimed.write('s0', 'updated')

    expect(root.innerHTML).toBe('<!--bf-loop-i:k1--><!--bf:s0-->updated<!--/--><!--bf-loop-i:k2-->')
  })

  test('markup kind resolves through the sibling range and respects the item boundary', () => {
    const { proxy, root } = mountLoopItemProxy('<li bf-c="s1"><!--bf:s2-->a<!--/--></li>')
    const plan: SlotSpec[] = [{ id: 's2', kind: 'markup', path: [] }]

    const claimed = claimSlots(proxy, plan)
    claimed.write('s2', 'a') // first write (patches; content matches SSR already)
    claimed.write('s2', 'b')

    expect(root.innerHTML).toBe(
      '<!--bf-loop-i:k1--><li bf-c="s1"><!--bf:s2-->b<!--/--></li><!--bf-loop-i:k2-->',
    )
  })

  test('never resolves a marker belonging to a nested child component inside the item range', () => {
    const { proxy, root } = mountLoopItemProxy(
      '<section bf-s="Badge_x1"><!--bf:s0-->child<!--/--></section><!--bf:s0-->own<!--/-->',
    )
    const plan: SlotSpec[] = [{ id: 's0', kind: 'text', path: [] }]

    const claimed = claimSlots(proxy, plan)
    claimed.write('s0', 'patched')

    expect(root.innerHTML).toBe(
      '<!--bf-loop-i:k1--><section bf-s="Badge_x1"><!--bf:s0-->child<!--/--></section><!--bf:s0-->patched<!--/--><!--bf-loop-i:k2-->',
    )
  })
})

describe('path-miss fallback', () => {
  test('an empty path (no compile-time path available) falls back silently, without warning', () => {
    const root = mount('<div><!--bf:s9b-->hello<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's9b', kind: 'text', path: [] }]

    let claimed: ReturnType<typeof claimSlots>
    const warnings = withWarnings(() => {
      claimed = claimSlots(row, plan)
    })
    claimed.write('s9b', 'updated')

    expect(row.innerHTML).toBe('<!--bf:s9b-->updated<!--/-->')
    expect(warnings).toEqual([]) // deliberate "cannot be statically pathed" case, not drift
  })

  test('falls back to a marker scan and warns when the path misses', () => {
    const root = mount('<div><!--bf:s10-->hello<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    // Deliberately wrong path (out of range) so the claim must fall back.
    const plan: SlotSpec[] = [{ id: 's10', kind: 'text', path: [99] }]

    let claimed: ReturnType<typeof claimSlots>
    const warnings = withWarnings(() => {
      claimed = claimSlots(row, plan)
    })
    claimed.write('s10', 'updated')

    expect(row.innerHTML).toBe('<!--bf:s10-->updated<!--/-->')
    expect(warnings.some(w => w.includes('s10') && w.includes('falling back'))).toBe(true)
  })

  test('fallback scan skips a same-id marker owned by a nested bf-s scope', () => {
    const root = mount(
      '<div><section bf-s="Badge_x1"><!--bf:s0-->child<!--/--></section><!--bf:s0-->own<!--/--></div>',
    )
    const row = root.firstElementChild as HTMLElement
    // Wrong path forces the fallback scan; the scan must land on the row's
    // OWN marker, never the nested child's same-numbered one.
    const plan: SlotSpec[] = [{ id: 's0', kind: 'text', path: [99] }]

    const claimed = claimSlots(row, plan)
    claimed.write('s0', 'patched')

    expect(row.innerHTML).toBe(
      '<section bf-s="Badge_x1"><!--bf:s0-->child<!--/--></section><!--bf:s0-->patched<!--/-->',
    )
  })

  test('totally missing slot warns and no-ops without breaking other slots', () => {
    const root = mount('<div><!--bf:s11-->kept<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [
      { id: 's11', kind: 'text', path: [0] },
      { id: 's12', kind: 'text', path: [99] }, // no bf:s12 marker anywhere
    ]

    const warnings = withWarnings(() => {
      const claimed = claimSlots(row, plan)
      claimed.write('s11', 'updated')
      claimed.write('s12', 'never applied')
    })

    expect(row.innerHTML).toBe('<!--bf:s11-->updated<!--/-->')
    expect(warnings.some(w => w.includes('s12'))).toBe(true)
  })
})

/**
 * The read half of the claimed-slot door (`spec/slot-unification.md`
 * §9.3(1) read-compare-write seeding). Its defining properties: it goes
 * through the SAME claim as writes (no second resolution path — §2's
 * claim-once rule), and inspecting a slot never mutates the DOM.
 */
describe('claimed-slot read door', () => {
  test('reads what SSR rendered', () => {
    const row = mount('<div><!--bf:s0-->hello<!--/--></div>').firstElementChild as HTMLElement
    const claimed = claimSlots(row, [{ id: 's0', kind: 'text', path: [] }])
    expect(claimed.read('s0')).toBe('hello')
  })

  test('an SSR-empty slot reads as the empty string without touching the DOM', () => {
    const row = mount('<div><!--bf:s0--><!--/--></div>').firstElementChild as HTMLElement
    const before = row.innerHTML
    const claimed = claimSlots(row, [{ id: 's0', kind: 'text', path: [] }])
    expect(claimed.read('s0')).toBe('')
    expect(row.innerHTML).toBe(before)
    expect(row.childNodes.length).toBe(2)
  })

  test('reads the written value back through the held reference', () => {
    const row = mount('<div><!--bf:s0-->old<!--/--></div>').firstElementChild as HTMLElement
    const claimed = claimSlots(row, [{ id: 's0', kind: 'text', path: [] }])
    claimed.write('s0', 'new')
    expect(claimed.read('s0')).toBe('new')
  })

  test("a 'markup' slot reads null — the door answers only for text", () => {
    const row = mount('<div><!--bf:s0--><b>x</b><!--/--></div>').firstElementChild as HTMLElement
    const claimed = claimSlots(row, [{ id: 's0', kind: 'markup', path: [] }])
    expect(claimed.read('s0')).toBeNull()
  })

  test('an unclaimable slot reads null (unknown) and stays silent', () => {
    const row = mount('<div>no markers</div>').firstElementChild as HTMLElement
    let claimed!: ReturnType<typeof claimSlots>
    withWarnings(() => {
      claimed = claimSlots(row, [{ id: 's0', kind: 'text', path: [] }])
    })
    const readWarnings = withWarnings(() => {
      expect(claimed.read('s0')).toBeNull()
    })
    expect(readWarnings).toEqual([])
  })

  test('lazySlots: a read claims the plan, and a later write needs no re-resolution', () => {
    const row = mount('<div><!--bf:s0-->a<!--/--><!--bf:s1-->b<!--/--></div>')
      .firstElementChild as HTMLElement
    const door = lazySlots(row, [
      { id: 's0', kind: 'text', path: [] },
      { id: 's1', kind: 'text', path: [] },
    ])
    // First access is a READ — it batch-claims the whole plan (row-pristine),
    // so the sibling is resolved too even though nothing was written yet.
    expect(door.read('s0')).toBe('a')
    expect(door.read('s1')).toBe('b')

    // Detach the markers: if a write re-resolved, it would now fail. It must
    // instead write through the reference the read already claimed.
    const held = row.childNodes[1] as Text
    row.innerHTML = ''
    door('s0', 'patched')
    expect(held.nodeValue).toBe('patched')
  })

  test('lazySlots: reading alone leaves an SSR-empty row untouched', () => {
    const row = mount('<div><!--bf:s0--><!--/--></div>').firstElementChild as HTMLElement
    const before = row.innerHTML
    const door = lazySlots(row, [{ id: 's0', kind: 'text', path: [] }])
    expect(door.read('s0')).toBe('')
    expect(row.innerHTML).toBe(before)
  })
})
