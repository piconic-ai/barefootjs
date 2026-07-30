/**
 * BarefootJS Compiler — lazy row graph eligibility + emission
 * (`spec/slot-unification.md` §9, L3).
 *
 * Two layers:
 *
 *  1. `lazyRowEligibility` unit tests — the explicit decision function. One
 *     test per ineligibility reason so a future gate change surfaces as a
 *     single named failure instead of a generated-JS diff. The eligible case
 *     is pinned too, so a gate that accidentally refuses EVERYTHING (the
 *     silent way this feature dies) fails loudly.
 *  2. Emitted-shape assertions — an eligible loop must emit `mapArrayLazy`
 *     with the pinned plan shape, and an ineligible loop must keep the eager
 *     `mapArray` + renderItem emission. Sound-or-loud: exactly two outcomes.
 */

import { describe, test, expect } from 'bun:test'
import {
  classifyLazyBinding,
  lazyRowEligibility,
  type LazyRowEligibilityArgs,
  type LazyRowScopeInfo,
  type LazyRowShapeFacts,
} from '../ir-to-client-js/control-flow/plan/lazy-row-eligibility'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

// --- fixtures ---------------------------------------------------------------

function makeScope(overrides: Partial<LazyRowScopeInfo> = {}): LazyRowScopeInfo {
  return {
    // `rows` is a signal whose initializer is a literal (`[]`) — the
    // canonical §9.3(2)-passing source.
    signals: new Map([['rows', { initializerFreeIdentifiers: new Set<string>() }]]),
    memos: new Set<string>(),
    props: new Set<string>(['_p', 'items']),
    constants: new Map<string, ReadonlySet<string> | null>(),
    inert: new Set<string>(['clsx']),
    profile: false,
    ...overrides,
  }
}

function makeShape(overrides: Partial<LazyRowShapeFacts> = {}): LazyRowShapeFacts {
  return {
    callSite: 'plain',
    flatMapLeafItem: false,
    anchored: false,
    bodyIsMultiRoot: false,
    hasExplicitKey: true,
    conditionalCount: 0,
    childRefCount: 0,
    nestedComponentCount: 0,
    innerLoopCount: 0,
    hasChildComponent: false,
    hasMapPreamble: false,
    preambleRegionCount: 0,
    hasParamUnwrap: false,
    ...overrides,
  }
}

function args(overrides: Partial<LazyRowEligibilityArgs> = {}): LazyRowEligibilityArgs {
  return {
    shape: makeShape(),
    bindings: [],
    arraySourceIdentifiers: new Set(['rows']),
    scope: makeScope(),
    ...overrides,
  }
}

const itemBinding = (kind: 'attr' | 'text' = 'text') => ({
  kind,
  slotId: 's1',
  readsItem: true,
  readsOuter: false,
  reactiveOuterNames: [] as string[],
  opaqueOuterNames: [] as string[],
  referencesIndex: false,
})

// --- eligibility ------------------------------------------------------------

describe('lazyRowEligibility — eligible', () => {
  test('a keyed, single-root, conditional-free plain row over a literal-seeded signal is eligible', () => {
    expect(lazyRowEligibility(args())).toEqual({ eligible: true })
  })

  test('a mixed item+outer attr binding on a primable signal stays eligible', () => {
    const decision = lazyRowEligibility(args({
      bindings: [{
        kind: 'attr',
        slotId: 's3',
        readsItem: true,
        readsOuter: true,
        reactiveOuterNames: ['selected'],
        opaqueOuterNames: [],
        referencesIndex: false,
      }],
      scope: makeScope({
        signals: new Map([
          ['rows', { initializerFreeIdentifiers: new Set<string>() }],
          ['selected', { initializerFreeIdentifiers: new Set<string>() }],
        ]),
      }),
    }))
    expect(decision).toEqual({ eligible: true })
  })

  test('branch-scoped plain rows are in scope too', () => {
    expect(lazyRowEligibility(args({ shape: makeShape({ callSite: 'branch-plain' }) })))
      .toEqual({ eligible: true })
  })
})

describe('lazyRowEligibility — shape refusals', () => {
  const cases: Array<[string, Partial<LazyRowShapeFacts>, RegExp]> = [
    ['flatMap descriptor loop', { flatMapLeafItem: true }, /flatMap/],
    ['anchored whole-item conditional', { anchored: true }, /anchored/],
    ['multi-root row', { bodyIsMultiRoot: true }, /multi-root/],
    ['index-keyed loop', { hasExplicitKey: false }, /index-keyed/],
    ['reactive conditional in the row', { conditionalCount: 1 }, /reactive conditional/],
    ['imperative child ref', { childRefCount: 1 }, /child refs/],
    ['child-component body', { hasChildComponent: true }, /child component/],
    ['nested child components', { nestedComponentCount: 1 }, /nested child components/],
    ['inner loop', { innerLoopCount: 1 }, /inner loop/],
    ['map-callback preamble', { hasMapPreamble: true }, /preamble/],
    ['preamble-patched regions', { preambleRegionCount: 1 }, /preamble-patched regions/],
    ['destructured param without bindings', { hasParamUnwrap: true }, /destructured loop param/],
  ]
  for (const [name, shapeOverride, reason] of cases) {
    test(name, () => {
      const decision = lazyRowEligibility(args({ shape: makeShape(shapeOverride) }))
      expect(decision.eligible).toBe(false)
      expect((decision as { reason: string }).reason).toMatch(reason)
    })
  }
})

describe('lazyRowEligibility — profile mode', () => {
  test('profile mode is never lazy, even for an otherwise perfect row', () => {
    const decision = lazyRowEligibility(args({ scope: makeScope({ profile: true }) }))
    expect(decision.eligible).toBe(false)
    expect((decision as { reason: string }).reason).toMatch(/profile mode/)
  })
})

describe('lazyRowEligibility — binding refusals', () => {
  test('a binding referencing the loop index parameter is refused', () => {
    const decision = lazyRowEligibility(args({
      bindings: [{ ...itemBinding(), referencesIndex: true }],
    }))
    expect(decision.eligible).toBe(false)
    expect((decision as { reason: string }).reason).toMatch(/index parameter/)
  })

  // §9.3a, LIFTED: an outer name the emitter cannot prime no longer sinks
  // the loop. The runtime's unconditional re-subscribe seam keeps
  // the loop-level effect subscribed across reconciles, which is the
  // obligation priming used to carry. Inverted from the refusal it replaces
  // so a gate that starts refusing again fails here by name.
  test('an unprimable outer dependency (a prop accessor) is ELIGIBLE via the seam', () => {
    const decision = lazyRowEligibility(args({
      bindings: [{
        kind: 'attr',
        slotId: 's3',
        readsItem: false,
        readsOuter: true,
        reactiveOuterNames: [],
        opaqueOuterNames: ['_p'],
        referencesIndex: false,
      }],
    }))
    expect(decision).toEqual({ eligible: true })
  })

  // §9.5, LIFTED: content slots now have a DOM read-back
  // (`lazyClaimSlots(...).read(id)`), so an outer-involving text binding no
  // longer sinks the loop. This test is the inverse of the refusal it
  // replaces — if the gate ever starts refusing again, it fails here rather
  // than as a silent eager-fallback regression.
  test('an outer-involving TEXT binding is ELIGIBLE (content slots have a DOM read-back)', () => {
    const decision = lazyRowEligibility(args({
      bindings: [{
        kind: 'text',
        slotId: 's1',
        readsItem: true,
        readsOuter: true,
        reactiveOuterNames: ['selected'],
        opaqueOuterNames: [],
        referencesIndex: false,
      }],
      scope: makeScope({
        signals: new Map([
          ['rows', { initializerFreeIdentifiers: new Set<string>() }],
          ['selected', { initializerFreeIdentifiers: new Set<string>() }],
        ]),
      }),
    }))
    expect(decision).toEqual({ eligible: true })
  })

  test('an OPAQUE outer name on a TEXT binding is eligible too (seam + read door)', () => {
    // Both former limits at once: an opaque outer read (§9.3a, covered by
    // the seam) on a content slot (§9.5, covered by the read door).
    const decision = lazyRowEligibility(args({
      bindings: [{
        kind: 'text',
        slotId: 's1',
        readsItem: true,
        readsOuter: true,
        reactiveOuterNames: [],
        opaqueOuterNames: ['isSelected'],
        referencesIndex: false,
      }],
    }))
    expect(decision).toEqual({ eligible: true })
  })
})

describe('lazyRowEligibility — §9.3(2) loop-source consistency gate', () => {
  test('absent arrayFreeIdentifiers is refused, never assumed empty', () => {
    const decision = lazyRowEligibility(args({ arraySourceIdentifiers: null }))
    expect(decision.eligible).toBe(false)
    expect((decision as { reason: string }).reason).toMatch(/free identifiers unavailable/)
  })

  test('a prop-derived source passes', () => {
    expect(lazyRowEligibility(args({ arraySourceIdentifiers: new Set(['items']) })))
      .toEqual({ eligible: true })
  })

  test('a signal with NO structured initializer is unprovable → refused', () => {
    const decision = lazyRowEligibility(args({
      scope: makeScope({ signals: new Map([['rows', { initializerFreeIdentifiers: null }]]) }),
    }))
    expect(decision.eligible).toBe(false)
    expect((decision as { reason: string }).reason).toMatch(/no structured initializer/)
  })

  test('a signal seeded from a props/literal chain passes transitively', () => {
    const decision = lazyRowEligibility(args({
      scope: makeScope({
        signals: new Map([['rows', { initializerFreeIdentifiers: new Set(['seed']) }]]),
        constants: new Map<string, ReadonlySet<string> | null>([['seed', new Set(['items'])]]),
      }),
    }))
    expect(decision).toEqual({ eligible: true })
  })

  test('a signal seeded from an ENVIRONMENT read is refused', () => {
    const decision = lazyRowEligibility(args({
      scope: makeScope({
        signals: new Map([['rows', { initializerFreeIdentifiers: new Set(['localStorage']) }]]),
      }),
    }))
    expect(decision.eligible).toBe(false)
    expect((decision as { reason: string }).reason).toMatch(/localStorage/)
  })

  test('an imported name in the source is refused', () => {
    const decision = lazyRowEligibility(args({ arraySourceIdentifiers: new Set(['clsx']) }))
    expect(decision.eligible).toBe(false)
    expect((decision as { reason: string }).reason).toMatch(/import or local function/)
  })

  test('a memo source is refused by the v1 gate', () => {
    const decision = lazyRowEligibility(args({
      arraySourceIdentifiers: new Set(['sorted']),
      scope: makeScope({ memos: new Set(['sorted']) }),
    }))
    expect(decision.eligible).toBe(false)
    expect((decision as { reason: string }).reason).toMatch(/memo 'sorted'/)
  })

  test('a constant with no analyzable value is refused', () => {
    const decision = lazyRowEligibility(args({
      arraySourceIdentifiers: new Set(['table']),
      scope: makeScope({ constants: new Map([['table', null]]) }),
    }))
    expect(decision.eligible).toBe(false)
    expect((decision as { reason: string }).reason).toMatch(/no analyzable value/)
  })
})

describe('classifyLazyBinding — fail-safe', () => {
  const scope = makeScope({
    signals: new Map([
      ['rows', { initializerFreeIdentifiers: new Set<string>() }],
      ['selected', { initializerFreeIdentifiers: new Set<string>() }],
    ]),
  })
  const base = { slotId: 's1', rowLocalNames: new Set(['row']), indexParam: '__idx', scope }

  test('unavailable free identifiers force BOTH readsItem and readsOuter, and mark the binding opaque', () => {
    const c = classifyLazyBinding({ kind: 'attr', free: null, ...base })
    expect(c.readsItem).toBe(true)
    expect(c.readsOuter).toBe(true)
    expect(c.opaqueOuterNames).toEqual(['<unknown>'])
    // …and the gate STILL refuses, even though §9.3a lifted the refusal
    // for opaque NAMES. A name means the identifier set is known and only
    // its primability is not — the seam handles that. This means the set
    // itself is unknown, so `referencesIndex: false` above is an assumption
    // rather than a fact, and neither applyItem nor applyOuter has an index
    // parameter to fall back on.
    const decision = lazyRowEligibility(args({ bindings: [c], scope }))
    expect(decision.eligible).toBe(false)
    expect((decision as { reason: string }).reason).toMatch(/no analyzable identifier set/)
  })

  test('a pure item read is item-only', () => {
    const c = classifyLazyBinding({ kind: 'text', free: new Set(['row']), ...base })
    expect(c).toMatchObject({ readsItem: true, readsOuter: false, reactiveOuterNames: [], opaqueOuterNames: [] })
  })

  test('a signal read is a primable reactive-outer dependency', () => {
    const c = classifyLazyBinding({ kind: 'attr', free: new Set(['row', 'selected']), ...base })
    expect(c).toMatchObject({ readsItem: true, readsOuter: true, reactiveOuterNames: ['selected'], opaqueOuterNames: [] })
  })

  test('pure globals and literal-derived consts need no subscription and are not outer', () => {
    const litScope = makeScope({
      signals: scope.signals,
      constants: new Map<string, ReadonlySet<string> | null>([['SIZES', new Set<string>()]]),
    })
    const c = classifyLazyBinding({
      kind: 'attr', free: new Set(['row', 'Math', 'SIZES']), ...base, scope: litScope,
    })
    expect(c).toMatchObject({ readsItem: true, readsOuter: false, opaqueOuterNames: [] })
  })

  test('an import, a local function, and a non-literal const are all OPAQUE, not inert', () => {
    // A reactive accessor hides behind ordinary-looking names — the
    // `createSelector` const is the canonical case. Guessing "inert" here
    // would emit an applyOuter effect that reads them non-reactively.
    const selScope = makeScope({
      signals: scope.signals,
      constants: new Map<string, ReadonlySet<string> | null>([['isSelected', new Set(['createSelector', 'selected'])]]),
      inert: new Set(['clsx']),
    })
    const c = classifyLazyBinding({
      kind: 'attr', free: new Set(['row', 'isSelected', 'clsx']), ...base, scope: selScope,
    })
    expect(c.readsOuter).toBe(true)
    expect(c.opaqueOuterNames.sort()).toEqual(['clsx', 'isSelected'])
    // Opaque NAMES no longer refuse the loop (§9.3a lifted) — the
    // identifier set is known here, so only primability was missing and the
    // runtime seam supplies that unconditionally. They still land in
    // `opaqueOuterNames` so a refusal elsewhere can name them precisely.
    expect(lazyRowEligibility(args({ bindings: [c], scope: selScope })).eligible).toBe(true)
  })

  test('the index parameter is flagged, not silently treated as outer', () => {
    const c = classifyLazyBinding({ kind: 'text', free: new Set(['__idx']), ...base })
    expect(c.referencesIndex).toBe(true)
  })
})

// --- emitted shape ----------------------------------------------------------

function clientJs(source: string, file: string): string {
  const result = compileJSX(source, file, { adapter: new TestAdapter() })
  const js = result.files.find(f => f.path.endsWith('.client.js'))
  if (!js) throw new Error(`no client JS emitted for ${file}`)
  return js.content
}

const ELIGIBLE = `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string }
export function LazyRows() {
  const [rows, setRows] = createSignal<Row[]>([])
  const [selected, setSelected] = createSignal(0)
  return (
    <tbody>
      {rows().map(row => (
        <tr key={row.id} className={selected() === row.id ? 'danger' : ''}>
          <td>{row.id}</td>
          <td>{row.label}</td>
        </tr>
      ))}
    </tbody>
  )
}
`

describe('lazy row emission — eligible loop', () => {
  const js = clientJs(ELIGIBLE, 'LazyRows.tsx')

  test('emits mapArrayLazy, not mapArray', () => {
    expect(js).toContain('mapArrayLazy(')
    expect(js).not.toMatch(/\bmapArray\(/)
  })

  test('imports mapArrayLazy from the runtime', () => {
    expect(js).toMatch(/import \{[^}]*\bmapArrayLazy\b[^}]*\} from '@barefootjs\/client\/runtime'/)
  })

  test('emits all three plan members with the pinned signatures', () => {
    expect(js).toContain('createRow: (__e, __idx) => {')
    expect(js).toContain('applyItem: (__e) => {')
    expect(js).toContain('applyOuter: (__es, __seed) => {')
  })

  test('rows carry no per-row reactive resources', () => {
    const planBody = js.slice(js.indexOf('mapArrayLazy('), js.indexOf("}, 'l0')"))
    expect(planBody).not.toContain('createEffect')
    expect(planBody).not.toContain('createRoot')
    expect(planBody).not.toContain('createSignal')
  })

  test('createRow writes every binding — item-driven AND outer-involving — and seeds refs/last', () => {
    const createRow = js.slice(js.indexOf('createRow:'), js.indexOf('applyItem:'))
    expect(createRow).toContain('__e.refs = [')
    expect(createRow).toContain('__e.last = []')
    expect(createRow).toContain("setAttribute('class'")   // outer-involving
    expect(createRow).toContain("('s0', textOrNode(__x))")     // item text
    expect(createRow).toContain("('s1', textOrNode(__x))")     // item text
  })

  test('applyItem claims refs lazily and dedups against entry.last', () => {
    const applyItem = js.slice(js.indexOf('applyItem:'), js.indexOf('applyOuter:'))
    expect(applyItem).toContain('__e.refs ?? (__e.refs = __lzc_l0(__e))')
    expect(applyItem).toContain('!Object.is(__l[1], __x)')
  })

  test('applyOuter primes its outer signal read before the row loop (§9 empty-list subscription)', () => {
    const applyOuter = js.slice(js.indexOf('applyOuter:'))
    const primeIdx = applyOuter.indexOf('\n      selected()\n')
    const loopIdx = applyOuter.indexOf('for (const __e of __es)')
    expect(primeIdx).toBeGreaterThan(-1)
    expect(loopIdx).toBeGreaterThan(primeIdx)
  })

  test('applyOuter seeds by read-compare-write (§9.3(1)), never a blind first write', () => {
    const applyOuter = js.slice(js.indexOf('applyOuter:'))
    expect(applyOuter).toContain("__seed ? (__t.getAttribute('class') !== (__x != null ? String(__x) : null))")
  })

  test('the lazy claim helper scans inside ONE row and is shared by both apply paths', () => {
    expect(js).toContain('const __lzc_l0 = (__e) => {')
    expect(js).toContain('const __el = __e.primaryEl')
  })

  /**
   * No-regression pin for the cheap door. This loop's texts are all
   * item-driven, so it must keep the single-closure `lazySlots` writer and
   * the BARE call form — the read-capable door costs an extra closure on
   * every row and may only be taken by loops that actually seed content.
   */
  test('an attr-only-outer loop keeps the write-only lazySlots door and the bare call form', () => {
    expect(js).toContain('lazySlots(')
    expect(js).not.toContain('lazyClaimSlots(')
    expect(js).toContain("__r[1]('s0', textOrNode(__x))")
    expect(js).not.toContain('.write(')
    expect(js).not.toContain('.read(')
  })

  /**
   * The adopted-row claim resolves ELEMENT refs only; the content door's slot
   * is left empty for the first content write to fill. `applyOuter` here
   * drives one CLASS and no text, so it claims all 1,000 rows of a 1,000-row
   * list at seed WITHOUT ever building a door — the allocation this pins away
   * (measured on the SSR bench: post-hydration heap 1630.6KB -> 1573.2KB).
   *
   * `createRow` is deliberately excluded: it writes every text on the tick it
   * builds the row, so its door is used immediately and stays eager.
   */
  test('the adopted-row claim leaves the content door slot empty', () => {
    const claim = js.slice(js.indexOf('const __lzc_l0 ='), js.indexOf('mapArrayLazy('))
    expect(claim).toContain('return [qsa(__el, \'[bf="s2"]\'), null]')
    expect(claim).not.toContain('lazySlots(')
  })

  test('an attr-only applyOuter never materializes the door; applyItem does', () => {
    const applyItem = js.slice(js.indexOf('applyItem:'), js.indexOf('applyOuter:'))
    const applyOuter = js.slice(js.indexOf('applyOuter:'))
    expect(applyItem).toContain('const __d = __r[1] ?? (__r[1] = lazySlots(__e.primaryEl, __lzs_l0))')
    expect(applyOuter).not.toContain('lazySlots(')
    expect(applyOuter).not.toContain('__r[1]')
  })

  test('createRow still builds its door eagerly — it writes on the same tick', () => {
    const createRow = js.slice(js.indexOf('createRow:'), js.indexOf('applyItem:'))
    expect(createRow).toContain('lazySlots(__el, ')
    expect(createRow).not.toContain('?? (__r[1] =')
  })
})

/**
 * §9.5 lifted: an outer-involving TEXT binding. The row renders an
 * item-driven text alongside a text that depends on a component signal, so
 * the loop needs the READ-capable claim door to seed the second one by
 * read-compare-write instead of writing blindly at hydration.
 */
const ELIGIBLE_OUTER_TEXT = `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string }
export function LazyOuterTextRows() {
  const [rows, setRows] = createSignal<Row[]>([])
  const [selected, setSelected] = createSignal(0)
  return (
    <tbody>
      {rows().map(row => (
        <tr key={row.id}>
          <td>{row.label}</td>
          <td>{String(selected() === row.id ? 'YES' : 'NO')}</td>
        </tr>
      ))}
    </tbody>
  )
}
`

describe('lazy row emission — outer-involving TEXT binding (§9.5 lifted)', () => {
  const js = clientJs(ELIGIBLE_OUTER_TEXT, 'LazyOuterTextRows.tsx')

  test('the loop is eligible — it is no longer refused for having an outer text', () => {
    expect(js).toContain('mapArrayLazy(')
    expect(js).not.toMatch(/\bmapArray\(/)
  })

  test('claims through the READ-capable door and imports it', () => {
    expect(js).toContain('lazyClaimSlots(')
    expect(js).not.toMatch(/\blazySlots\(/)
    expect(js).toMatch(/import \{[^}]*\blazyClaimSlots\b[^}]*\} from '@barefootjs\/client\/runtime'/)
  })

  test('every text write goes through the door\'s .write() method', () => {
    expect(js).toContain(".write('s0', textOrNode(__x))")
    expect(js).toContain(".write('s1', textOrNode(__x))")
    // The bare call form belongs to the write-only door and must not survive
    // alongside the RW one.
    expect(js).not.toContain("__r[0]('s0'")
    expect(js).not.toContain("__r[0]('s1'")
  })

  test('applyOuter seeds the content slot by read-compare-write (§9.3(1))', () => {
    const applyOuter = js.slice(js.indexOf('applyOuter:'))
    // A real branch, not one ternary guard: the seed path binds the string
    // ONCE and reuses it for the compare and the write, so a value with a
    // side-effecting `toString` is not stringified twice.
    expect(applyOuter).toContain('if (__seed) {')
    expect(applyOuter).toContain('const __s = textOrNode(__x)')
    // Through `__d`, the door materialized once for this body — a loop with an
    // outer TEXT cannot avoid claiming at seed (you cannot read-compare-write
    // what you have not resolved), so here the deferral is a no-op by design.
    expect(applyOuter).toContain("const __d = __r[0] ?? (__r[0] = lazyClaimSlots(__e.primaryEl, __lzs_l0))")
    expect(applyOuter).toContain("if (__d.read('s1') !== __s) __d.write('s1', __s)")
    expect(applyOuter).not.toContain("read('s1') !== textOrNode(__x)")
    // …and falls back to the ordinary entry.last dedup on every later run,
    // where the string is built only when the write actually happens.
    expect(applyOuter).toContain('} else if (!(1 in __l) || !Object.is(__l[1], __x))')
    expect(applyOuter).toContain('__l[1] = __x')
  })

  test('the outer text ALSO applies on item change, because it reads the item too', () => {
    const applyItem = js.slice(js.indexOf('applyItem:'), js.indexOf('applyOuter:'))
    expect(applyItem).toContain("__d.write('s1', textOrNode(__x))")
  })

  test('the item-only text is NOT emitted into applyOuter', () => {
    const applyOuter = js.slice(js.indexOf('applyOuter:'))
    expect(applyOuter).not.toContain("'s0'")
  })

  /**
   * This row has no reactive ATTRIBUTE, so with the door deferred the element
   * refs are gone and the adopted claim is a bare `[null]` — at which point
   * binding the row root is dead code. Pinned because the binding is emitted
   * unconditionally the moment anyone forgets that `refParts` decides whether
   * anything reads it.
   */
  test('a text-only adopted claim binds no row root', () => {
    const claim = js.slice(js.indexOf('const __lzc_l0 ='), js.indexOf('mapArrayLazy('))
    expect(claim).toContain('return [null]')
    expect(claim).not.toContain('__el')
  })
})

/**
 * The gate's `index-keyed loop (no explicit key)` refusal is a FAIL-SAFE that
 * no compiling program can reach: an unkeyed `.map()` row is BF023 upstream.
 * Pinned here so the refusal is never mistaken for a widening opportunity —
 * if unkeyed loops ever become legal, this test fails and says where to look.
 */
describe('unkeyed loops never reach the gate', () => {
  const UNKEYED = `
'use client'
import { createSignal } from '@barefootjs/client'
export function UnkeyedRows() {
  const [rows, setRows] = createSignal<string[]>([])
  return <ul>{rows().map(row => <li>{row}</li>)}</ul>
}
`

  test('an unkeyed .map() row is a BF023 compile error', () => {
    const result = compileJSX(UNKEYED, 'UnkeyedRows.tsx', { adapter: new TestAdapter() })
    const errors = result.errors.filter(e => e.severity === 'error')
    expect(errors.map(e => e.code)).toContain('BF023')
  })

  test('a key whose VALUE is the index is an ordinary keyed loop and stays eligible', () => {
    // `key={i}` is what the BF023 suggestion tells users to write for static
    // lists. It is a real key expression, so `loop.key != null` and the gate's
    // keying branch is not involved at all.
    const js = clientJs(`
'use client'
import { createSignal } from '@barefootjs/client'
export function IndexValueKeyed() {
  const [rows, setRows] = createSignal<string[]>([])
  return <ul>{rows().map((row, i) => <li key={i}>{row}</li>)}</ul>
}
`, 'IndexValueKeyed.tsx')
    expect(js).toContain('mapArrayLazy(')
  })
})

describe('lazy row emission — ineligible loops fall back', () => {

  test('a row with a reactive conditional keeps the eager mapArray emission', () => {
    const js = clientJs(`
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function CondRows() {
  const [rows, setRows] = createSignal<Row[]>([])
  return (
    <ul>
      {rows().map(row => (
        <li key={row.id}>{row.done ? <b>{row.label}</b> : <i>{row.label}</i>}</li>
      ))}
    </ul>
  )
}
`, 'CondRows.tsx')
    expect(js).toMatch(/\bmapArray\(/)
    expect(js).not.toContain('mapArrayLazy(')
  })

  test('profile mode keeps the eager, per-binding-attributed emission', () => {
    const result = compileJSX(ELIGIBLE, 'LazyRowsProfiled.tsx', { adapter: new TestAdapter(), profile: true })
    const js = result.files.find(f => f.path.endsWith('.client.js'))!.content
    expect(js).not.toContain('mapArrayLazy(')
    expect(js).toMatch(/\bmapArray\(/)
  })
})

/**
 * Presence-or-undefined attributes are the one kind where SSR and the
 * client writer legitimately disagree on the VALUE while agreeing on
 * presence: SSR renders a bare attribute name (`templateAttrExpr`), which
 * parses to `""`, while `emitAttrUpdate` writes `'true'` for `aria-*`. A
 * presence-only seed comparison therefore skips a write it must perform.
 */
const ELIGIBLE_ARIA = `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string }
export function LazyAriaRows() {
  const [rows, setRows] = createSignal<Row[]>([])
  const [selected, setSelected] = createSignal(0)
  return (
    <tbody>
      {rows().map(row => (
        <tr key={row.id} aria-selected={(selected() === row.id) || undefined}>
          <td>{row.label}</td>
        </tr>
      ))}
    </tbody>
  )
}
`

describe('lazy row emission — presence-or-undefined seed comparison', () => {
  const js = clientJs(ELIGIBLE_ARIA, 'LazyAriaRows.tsx')

  test('the loop is eligible (guards the rest of this describe)', () => {
    expect(js).toContain('mapArrayLazy(')
  })

  test('seeds an aria-* presence attr by VALUE, not by presence', () => {
    // SSR renders `aria-selected` bare (value ""), the writer writes
    // "true" — comparing `hasAttribute` would call those equal and leave
    // the row at `aria-selected=""` forever.
    expect(js).toContain(`getAttribute('aria-selected') !== (__x ? 'true' : null)`)
    expect(js).not.toContain(`hasAttribute('aria-selected')`)
  })
})
