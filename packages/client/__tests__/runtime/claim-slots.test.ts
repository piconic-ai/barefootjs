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

  test('creates a Text node when SSR emitted an empty value', () => {
    const root = mount('<div><!--bf:s1--><!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's1', kind: 'text', path: [0] }]

    // Claiming (not just writing) creates the missing Text node immediately.
    claimSlots(row, plan)
    expect(row.childNodes[1]?.nodeType).toBe(Node.TEXT_NODE)
    expect(row.innerHTML).toBe('<!--bf:s1--><!--/-->')
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
  test('holds boundaries and patches string content', () => {
    const root = mount('<div><!--bf:s3-->old<!--/--></div>')
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's3', kind: 'markup', path: [0] }]

    const claimed = claimSlots(row, plan)
    claimed.write('s3', '<b>new</b>')
    expect(row.innerHTML).toBe('<!--bf:s3--><b>new</b><!--/-->')
  })

  test('nested bf: comment pairs inside the range do not break matching', () => {
    const root = mount(
      '<div><!--bf:s4-->outer<!--bf:s9-->inner<!--/-->tail<!--/--><p>after</p></div>',
    )
    const row = root.firstElementChild as HTMLElement
    const plan: SlotSpec[] = [{ id: 's4', kind: 'markup', path: [0] }]

    const claimed = claimSlots(row, plan)
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

    claimed.write('s5', 'hello')
    expect(row.innerHTML).toBe('<!--bf:s5-->hello<!--/-->')
    claimed.write('s5', '')
    expect(row.innerHTML).toBe('<!--bf:s5--><!--/-->')

    const comments = Array.from(row.childNodes).filter(n => n.nodeType === Node.COMMENT_NODE)
    expect(comments).toEqual([start, end])
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

describe('path-miss fallback', () => {
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
