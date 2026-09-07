/**
 * #2861: a `.map()` row's index-derived output stays live even when the
 * expression reads NOTHING else reactive — no item, no signal, no memo, no
 * function call. `String(i + 1)`-shaped expressions were already fixed by
 * #2859/#2860 (they trip the AST-flag function-call fallback); this file
 * covers the residual gap `classifyReactivity` had no case for at all: a
 * bare `{i}` text, an `i % 2 === 0 ? … : …` class/conditional, and the
 * same shapes one level deeper when the index in question belongs to an
 * OUTER loop, not the row's own.
 *
 * Root cause (see `reactivity.ts`'s `ReactivitySource`/`classifyReactivity`
 * doc comments): Phase 1 (`jsx-to-ir.ts`'s `referencesLoopParam`, via
 * `BindingScope.valueBoundNames()`) already grants such an expression a
 * patchable slot — item/index/destructure are graneted a slot together —
 * but Phase 2's `classifyReactivity` had no `loop-index` case mirroring its
 * existing `loop-param` one, so the slot was written once at row-creation
 * time and never revisited.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('plain loop: pure index-only expressions (#2861)', () => {
  test('bare {i} text wires reactively through the lazy row graph', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Repro() {
        const [items] = createSignal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
        return (
          <ul>
            {items().map((item, i) => (
              <li key={item.id}>{i}</li>
            ))}
          </ul>
        )
      }
    `)

    // No refs/child components/inner loops — this row is lazy-eligible, and
    // the widened `classifyLazyBinding` (#2859/#2860 stacked work) already
    // routes an index-only binding into applyItem/indexDriven once it's
    // collected at all — which is exactly the part #2861 fixes.
    expect(content).toContain('mapArrayLazy(')
    expect(content).toContain('indexDriven: true')
    expect(content).toMatch(/applyItem: \(__e\) => \{[\s\S]*?const i = __e\.index/)
  })

  test('class={i % 2 === 0 ? … : …} wires a createEffect on the eager path', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Repro() {
        const [items] = createSignal([{ id: 'a' }, { id: 'b' }])
        return (
          <ul>
            {items().map((item, i) => (
              <li key={item.id} class={i % 2 === 0 ? 'even' : 'odd'} ref={(el: HTMLElement | null) => {}}>{item.id}</li>
            ))}
          </ul>
        )
      }
    `)

    // A ref forces the eager `mapArray` path (no lazy row graph for rows
    // that own an imperative ref) — the class binding must still be wired
    // through a per-item `createEffect` reading the index ACCESSOR (#2859).
    expect(content).toContain('mapArray(')
    expect(content).toMatch(
      /createEffect\(\(\) => \{[\s\S]*?const __v = `\$\{i\(\) % 2 === 0 \? 'even' : 'odd'\}`/
    )
  })

  test('an index-only conditional ({i % 2 === 0 ? <b/> : <em/>}) reconciles reactively on the lazy path', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Repro() {
        const [items] = createSignal([{ id: 'a' }, { id: 'b' }])
        return (
          <ul>
            {items().map((item, i) => (
              <li key={item.id}>{i % 2 === 0 ? <b>even</b> : <em>odd</em>}</li>
            ))}
          </ul>
        )
      }
    `)

    // Before #2861 this pre-gate (`collectLoopChildConditionals`'s
    // `refsAnyBindingViaFreeIds`) never even reached `classifyReactivity` —
    // an index-only condition died at the AST-`reactive`-flag short-circuit
    // and baked into `createRow` only, once, forever.
    expect(content).toContain('mapArrayLazy(')
    expect(content).toMatch(/applyItem: \(__e\) => \{[\s\S]*?const i = __e\.index/)
    expect(content).toContain('!!(i % 2 === 0)')
  })
})

describe('nested loop: referencing an OUTER loop\'s own index (#2861)', () => {
  test('composite path: inner row text reads the outer index through its accessor', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: string; label: string }
      interface Group { id: string; items: Item[] }
      export function Repro() {
        const [groups] = createSignal<Group[]>([])
        return (
          <div>
            {groups().map((g, gi) => (
              <div key={g.id}>
                {g.items.map((it) => (
                  <span key={it.id}>{gi}-{it.label}</span>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    // The inner mapArray's own renderItem has no `gi` param at all — the
    // outer accessor must be read directly by name, exactly as `item()`
    // reads the outer ITEM in the sibling case #2865 already covers.
    expect(content).toMatch(
      /mapArray\(\(\) => g\(\)\.items \|\| \[\], .*?, \(it, __innerIdx\d+_\d+, __existing\) => \{[\s\S]*?createEffect\(\(\) => \{ __bfw_s0\('s0', String\(gi\(\)\)\) \}\)/
    )
  })

  test('composite path: inner row class attr reads the outer index through its accessor', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: string }
      interface Group { id: string; items: Item[] }
      export function Repro() {
        const [groups] = createSignal<Group[]>([])
        return (
          <div>
            {groups().map((g, gi) => (
              <div key={g.id}>
                {g.items.map((it) => (
                  <span key={it.id} class={gi % 2 === 0 ? 'even' : 'odd'}>{it.id}</span>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).toMatch(
      /createEffect\(\(\) => \{[\s\S]*?const __v = `\$\{gi\(\) % 2 === 0 \? 'even' : 'odd'\}`/
    )
  })

  test('conditional-branch-arm path: a loop nested inside a branch reads the OUTER (pre-branch) loop\'s index', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: string; text: string }
      interface Group { id: string; flag: boolean; items: Item[] }
      export function Repro() {
        const [outer] = createSignal<Group[]>([])
        return (
          <div>
            {outer().map((o, oi) => (
              <div key={o.id}>
                {o.flag ? (
                  <div>
                    {o.items.map((item) => (
                      <span key={item.id}>{oi}: {item.text}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )
      }
    `)

    // Before #2861, `collectInnerLoops` (called from `summarizeLoopChildBranch`
    // for a loop nested inside a conditional arm) only ever built a scope
    // from the INNER loop's own param/index — a row referencing the loop
    // ONE LEVEL UP (the one whose conditional this branch belongs to) was
    // classified 'none' and baked once into the branch's initial template.
    expect(content).toMatch(
      /mapArray\(\(\) => o\(\)\.items \|\| \[\], .*?, \(item, __bidxbr_\d+, __existing\) => \{[\s\S]*?createEffect\(\(\) => \{ __bfw_s1\('s1', String\(oi\(\)\)\) \}\)/
    )
  })
})
