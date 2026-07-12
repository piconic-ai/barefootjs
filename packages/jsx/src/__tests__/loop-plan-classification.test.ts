/**
 * BarefootJS Compiler — `buildLoopPlan` decision tree classification (#1253).
 *
 * Exercises every predicate branch of the single `buildLoopPlan` entry with
 * minimal `TopLevelLoop` fixtures so a future predicate change shows up as a
 * single-test failure with an obvious diagnostic, rather than as a subtle
 * stringifier regression caught only by adapter conformance.
 *
 * Predicate order under test (matches the implementation in
 * `control-flow/plan/build-loop.ts`):
 *
 *   1. `isStaticArray`                                              → 'static'
 *   2. `useElementReconciliation` AND (nestedComps OR innerLoops)   → 'composite'
 *   3. `childComponent`                                             → 'component'
 *   4. fallthrough                                                  → 'plain'
 *
 * Boundary cases verified inline:
 *   - composite predicate requires BOTH `useElementReconciliation` and a
 *     non-empty `nestedComponents`/`innerLoops` — either alone falls through.
 *   - `childComponent` is checked AFTER composite, so a loop carrying both
 *     `childComponent` and `useElementReconciliation` still routes to
 *     composite (the per-issue refactor target shape).
 *   - `isStaticArray` wins over every dynamic predicate.
 */

import { describe, test, expect } from 'bun:test'
import { buildLoopPlan } from '../ir-to-client-js/control-flow/plan/build-loop'
import type { TopLevelLoop } from '../ir-to-client-js/types'
import type { IRLoopChildComponent } from '../types'

function makeLoop(overrides: Partial<TopLevelLoop> = {}): TopLevelLoop {
  return {
    kind: 'top-level',
    slotId: 's1',
    index: null,
    template: '<li bf="s2"></li>',
    array: 'items',
    param: 'item',
    key: null,
    markerId: 'm0',
    childEventHandlers: [],
    isStaticArray: false,
    bindings: {
      events: [],
      reactiveAttrs: [],
      reactiveTexts: [],
      refs: [],
      conditionals: [],
    },
    ...overrides,
  }
}

function makeChildComponent(name = 'Card'): IRLoopChildComponent {
  return { name, slotId: 's3', props: [], children: [] }
}

const NO_UNSAFE = new Set<string>()

describe('buildLoopPlan decision tree (#1253)', () => {
  test('isStaticArray → static (wins over every dynamic predicate)', () => {
    const plan = buildLoopPlan(
      makeLoop({
        isStaticArray: true,
        useElementReconciliation: true,
        nestedComponents: [makeChildComponent()],
        childComponent: makeChildComponent('Outer'),
      }),
      { unsafeLocalNames: NO_UNSAFE },
    )
    expect(plan.kind).toBe('static')
  })

  test('dynamic + useElementReconciliation + nestedComponents → composite', () => {
    const plan = buildLoopPlan(
      makeLoop({
        useElementReconciliation: true,
        nestedComponents: [makeChildComponent()],
      }),
      { unsafeLocalNames: NO_UNSAFE },
    )
    expect(plan.kind).toBe('composite')
  })

  test('dynamic + useElementReconciliation + innerLoops → composite', () => {
    const plan = buildLoopPlan(
      makeLoop({
        useElementReconciliation: true,
        nestedComponents: [],
        innerLoops: [
          {
            kind: 'nested',
            array: 'item.subs',
            param: 'sub',
            index: null,
            key: null,
            markerId: 'inner-m1',
            template: '<span></span>',
            depth: 1,
            containerSlotId: null,
            bindings: {
              events: [],
              reactiveAttrs: [],
              reactiveTexts: [],
              refs: [],
              conditionals: [],
            },
          },
        ],
      }),
      { unsafeLocalNames: NO_UNSAFE },
    )
    expect(plan.kind).toBe('composite')
  })

  test('boundary: useElementReconciliation true but NO nestedComps/innerLoops → falls through (not composite)', () => {
    const plan = buildLoopPlan(
      makeLoop({ useElementReconciliation: true }),
      { unsafeLocalNames: NO_UNSAFE },
    )
    // Falls through to 'plain' — the composite predicate is `AND`, not `OR`.
    expect(plan.kind).toBe('plain')
  })

  test('boundary: nestedComponents present but useElementReconciliation false → not composite', () => {
    const plan = buildLoopPlan(
      makeLoop({
        useElementReconciliation: false,
        nestedComponents: [makeChildComponent()],
      }),
      { unsafeLocalNames: NO_UNSAFE },
    )
    // Without `useElementReconciliation`, the IR collector decided this is
    // not a reconcile-driven shape, so the plan stays plain even though
    // nestedComponents data is present.
    expect(plan.kind).toBe('plain')
  })

  test('childComponent without composite indicators → component', () => {
    const plan = buildLoopPlan(
      makeLoop({
        template: '',
        childComponent: makeChildComponent('Card'),
      }),
      { unsafeLocalNames: NO_UNSAFE },
    )
    expect(plan.kind).toBe('component')
  })

  test('boundary: childComponent + composite predicate → composite wins (single-component-body inner loops)', () => {
    // A loop whose body is a single component but ALSO has inner loops at
    // the component's children level still routes through composite — the
    // composite predicate is checked first by design so the inner loops
    // get their own mapArray reconciliation.
    const plan = buildLoopPlan(
      makeLoop({
        useElementReconciliation: true,
        childComponent: makeChildComponent('Card'),
        nestedComponents: [],
        innerLoops: [
          {
            kind: 'nested',
            array: 'item.subs',
            param: 'sub',
            index: null,
            key: null,
            markerId: 'inner-m1',
            template: '<span></span>',
            depth: 1,
            containerSlotId: null,
            bindings: {
              events: [],
              reactiveAttrs: [],
              reactiveTexts: [],
              refs: [],
              conditionals: [],
            },
          },
        ],
      }),
      { unsafeLocalNames: NO_UNSAFE },
    )
    expect(plan.kind).toBe('composite')
  })

  test('plain element body, no child components, no inner loops → plain', () => {
    const plan = buildLoopPlan(makeLoop(), { unsafeLocalNames: NO_UNSAFE })
    expect(plan.kind).toBe('plain')
  })
})
