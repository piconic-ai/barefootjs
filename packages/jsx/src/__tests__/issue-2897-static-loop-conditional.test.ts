/**
 * #2897 — a conditional (`{cond ? A : B}`) inside a STATIC (non-signal)
 * array's `.map()` row was never wired reactively: neither the top-level
 * static forEach bake nor the depth-1 `inner-loop-nested` clone-and-wire
 * architecture (#2798) has any conditional-handling machinery, so the
 * condition's INITIAL value baked into the per-row template at compile
 * time and never updated again.
 *
 * `elem.bodyIsItemConditional` (#1665) already carved out ONE narrow shape
 * of this — the row's entire body is a single conditional with at least one
 * empty branch — by routing it through the plain dynamic path regardless of
 * `isStaticArray`. This fix widens the same idea: a derived client-side
 * `isStaticArray` (`collect-elements.ts`) goes false whenever a conditional
 * is present anywhere in the row tree (this row's own bindings, or any
 * depth-1 inner loop's), falling through to the plain/composite dynamic
 * path — which already wires a conditional's live branch-swap correctly on
 * a signal-backed array — instead of the static fast path that has no
 * conditional support to add.
 *
 * Only ROUTING/EMISSION is pinned here (compiler-unit speed); the actual
 * reactive behavior (does the branch really swap after a click) is a
 * `fixture-hydrate.playwright.ts` fixture, since CSR conformance only
 * observes the initial mount — which already matches SSR's baked branch
 * either way, so it can't see this bug.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compile(source: string): string {
  const result = compileJSX(source.trimStart(), 'C.tsx', { adapter })
  expect(result.errors).toHaveLength(0)
  return result.files.find((f) => f.type === 'clientJs')!.content
}

const usesStaticForEach = (js: string) => /\.forEach\(\(?\w+, __idx\)? =>/.test(js)
const usesReconciliation = (js: string) => js.includes('mapArray(') || js.includes('mapArrayLazy(') || js.includes('mapArrayAnchored(')

describe('#2897 — top-level: static array with a conditional alongside static siblings', () => {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function C() {
      const items = [{ id: 1, label: 'Alpha' }]
      const [flag] = createSignal(true)
      return (
        <ul>
          {items.map(item => (
            <li key={item.id}>
              <span>{item.label}</span>
              {flag() ? <b>Yes</b> : <i>No</i>}
            </li>
          ))}
        </ul>
      )
    }
  `

  test('routes through reconciliation (mapArray family), not the static forEach bake', () => {
    const js = compile(source)
    expect(usesReconciliation(js)).toBe(true)
    expect(usesStaticForEach(js)).toBe(false)
  })

  test('createRow/applyOuter read flag() live, not just the SSR-matching bootstrap template', () => {
    const js = compile(source)
    // The `hydrate(...).template` bootstrap legitimately bakes the signal's
    // INITIAL value (it only needs to match SSR's first render — the same
    // shape the dynamic-array control produces, see the module docstring).
    // What must NOT happen is EVERY occurrence being baked: `applyOuter`'s
    // own re-evaluation (`flag()` called bare, to track the dependency) is
    // the actual regression pin — pre-fix, this function never existed at
    // all for a static array.
    expect(js).toContain('applyOuter')
    expect(js).toMatch(/applyOuter:\s*\(__es, __seed\) => {\s*flag\(\)/)
  })
})

describe('#2897 — top-level: static array, whole-row ternary between two elements (both arms render)', () => {
  // `bodyIsItemConditional` (#1665) only carves out a WHOLE-row conditional
  // with at least one EMPTY branch — a ternary where BOTH arms render an
  // element evades that narrower gate too, and needs the same widened fix.
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function C() {
      const items = [{ id: 1 }]
      const [flag] = createSignal(true)
      return (
        <ul>
          {items.map(item => flag() ? <li key={item.id}>Active</li> : <li key={item.id}>Inactive</li>)}
        </ul>
      )
    }
  `

  test('routes through reconciliation, not the static forEach bake', () => {
    const js = compile(source)
    expect(usesReconciliation(js)).toBe(true)
    expect(usesStaticForEach(js)).toBe(false)
  })
})

describe('#2897 — nested: static outer array + depth-1 inner loop whose row has a conditional', () => {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function C() {
      const items = [{ id: 1, children: [{ id: 11 }] }]
      const [flag] = createSignal(true)
      return (
        <ul>
          {items.map(item => (
            <li key={item.id}>
              {item.children.map(child => (
                <span key={child.id}>{flag() ? <b>Yes</b> : <i>No</i>}</span>
              ))}
            </li>
          ))}
        </ul>
      )
    }
  `

  test('escalates to composite element reconciliation for BOTH loops, not the #2798 static clone-and-wire path', () => {
    const js = compile(source)
    expect(usesReconciliation(js)).toBe(true)
    expect(usesStaticForEach(js)).toBe(false)
    // The #2798 static-nested machinery's own signature (a plain
    // `_sN.children[__idx]` walk feeding `createEffect`, no `insert()`) must
    // not appear alongside the escalated path.
    expect(js).not.toContain('Initialize inner-loop components in static array')
  })
})

describe('#2897 follow-up — static array, own-row conditional reading ONLY the loop item, child-component branch', () => {
  // `SocialShell` (site/ui) shape: `item.key === 'messages'` is a
  // `classifyReactivity` `'loop-param'` verdict (every loop-param-referencing
  // condition is, regardless of array static-ness — see `reactiveBeyondLoopScope`'s
  // doc comment on `LoopChildConditional`), so `bindings.conditionals` is
  // non-empty here too. For a STATIC array the row item never changes after
  // first render, so this decision is exactly as compile-time-bakeable as a
  // bare-element conditional — escalating it is unnecessary and (via the
  // composite/`insert()` path) previously double-mounted the child component.
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    function Badge() { return <span className="badge">B</span> }
    export function C() {
      const items = [{ id: 1, key: 'other' }, { id: 2, key: 'messages' }]
      return (
        <ul>
          {items.map(item => (
            <li key={item.id}>
              {item.key === 'messages' ? <Badge /> : null}
            </li>
          ))}
        </ul>
      )
    }
  `

  test('stays on the static forEach + initChild path, no reconciliation', () => {
    const js = compile(source)
    expect(usesStaticForEach(js)).toBe(true)
    expect(usesReconciliation(js)).toBe(false)
  })
})

describe('#2897 follow-up — static array, own-row conditional whose CONDITION reads a signal, child-component branch', () => {
  // Same branch shape as above, but the condition itself (`flag()`) can
  // change after first render — this is the case #2897 actually fixes, and
  // must still escalate regardless of what the branches contain.
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    function Badge() { return <span className="badge">B</span> }
    export function C() {
      const items = [{ id: 1 }]
      const [flag] = createSignal(true)
      return (
        <ul>
          {items.map(item => (
            <li key={item.id}>
              {flag() ? <Badge /> : null}
            </li>
          ))}
        </ul>
      )
    }
  `

  test('routes through reconciliation, not the static forEach bake', () => {
    const js = compile(source)
    expect(usesReconciliation(js)).toBe(true)
    expect(usesStaticForEach(js)).toBe(false)
  })
})

describe('#2897 follow-up — static array, own-row condition mixing an item read and a signal read', () => {
  // `classifyReactivity` reports `'loop-param'` (not `'signal-or-memo-or-prop'`)
  // for `item.x && flag()` because it checks loop-bound names FIRST — that
  // precedence is deliberate and must not change (two other, typed callers
  // depend on it). `reactiveBeyondLoopScope` must still escalate this,
  // independently of that `kind`, since the value CAN change after first
  // render (`flag()`).
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function C() {
      const items = [{ id: 1, x: true }]
      const [flag] = createSignal(true)
      return (
        <ul>
          {items.map(item => (
            <li key={item.id}>
              {item.x && flag() ? <b>Yes</b> : <i>No</i>}
            </li>
          ))}
        </ul>
      )
    }
  `

  test('routes through reconciliation, not the static forEach bake', () => {
    const js = compile(source)
    expect(usesReconciliation(js)).toBe(true)
    expect(usesStaticForEach(js)).toBe(false)
  })
})

describe('#2897 follow-up — static array, own-row conditional reading ONLY the loop item, bare-element branches', () => {
  // The item-only-condition control for a BARE-element branch (as opposed
  // to the child-component branch above) — both must stay static; content
  // of the branches plays no part in the escalation decision, only whether
  // the condition itself can change. `ref` gives the row #2798's own
  // static-forEach wiring to check against (a fully inert row — no
  // ref/text/attr/childComponent needing a runtime touch at all — emits NO
  // loop wiring in the first place, which would make `usesStaticForEach`
  // vacuously false here regardless of this fix; a click handler alone
  // doesn't count either — events use container-level delegation, not
  // per-row forEach).
  const source = `
    'use client'
    export function C() {
      const items = [{ id: 1, done: true }, { id: 2, done: false }]
      return (
        <ul>
          {items.map(item => (
            <li key={item.id} ref={(el) => console.log(el, item.id)}>
              {item.done ? <b>Yes</b> : <i>No</i>}
            </li>
          ))}
        </ul>
      )
    }
  `

  test('stays on the static forEach + createEffect path, no reconciliation', () => {
    const js = compile(source)
    expect(usesStaticForEach(js)).toBe(true)
    expect(usesReconciliation(js)).toBe(false)
  })
})

describe('#2897 — control: static outer + depth-1 inner loop with NO conditional stays on the #2798 fast path', () => {
  // Regression armor: the escalation must be conditional-triggered only —
  // a nested static loop with ordinary ref/text/attr bindings and no
  // conditional anywhere must keep taking #2798's static clone-and-wire
  // path, not silently lose that optimization.
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function C() {
      const items = [{ id: 1, children: [{ id: 11 }] }]
      const [count] = createSignal(0)
      return (
        <ul>
          {items.map(item => (
            <li key={item.id}>
              {item.children.map(child => (
                <span key={child.id}>{child.id}:{count()}</span>
              ))}
            </li>
          ))}
        </ul>
      )
    }
  `

  test('stays on the static forEach + createEffect path, no reconciliation', () => {
    const js = compile(source)
    expect(usesStaticForEach(js)).toBe(true)
    expect(usesReconciliation(js)).toBe(false)
  })
})
