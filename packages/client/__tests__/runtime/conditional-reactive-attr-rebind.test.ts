/**
 * Runtime integration test for #1071: when a conditional swaps in a fresh
 * element, reactive attribute bindings on that element must re-attach so
 * subsequent signal updates reach the live node.
 *
 * Mirrors the shape the compiler now emits: per-branch `bindEvents` resolves
 * the slot via `qsa(__branchScope, ...)` on every invocation, pushes a
 * `createDisposableEffect` into a local `__disposers` array, and returns
 * a cleanup closure that the runtime calls before the next swap.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { insert } from '../../src/runtime/insert'
import { qsa } from '../../src/runtime/query'
import { createSignal, createDisposableEffect } from '../../src/reactive'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('conditional swap re-attaches reactive attribute bindings (#1071)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('reactive `d` on a conditional <path> tracks signal across rising edges', () => {
    // SSR shape: condition is initially false, so only the comment markers
    // are rendered for slot s0. The path is mounted on the rising edge.
    document.body.innerHTML = `
      <svg bf-s="Demo_test1" bf="s2">
        <!--bf-cond-start:s0--><!--bf-cond-end:s0-->
      </svg>
    `

    const scope = document.querySelector('[bf-s]')!
    expect(scope).not.toBeNull()

    const [shown, setShown] = createSignal(false)
    const [d, setD] = createSignal('M 0 0 L 10 10')

    insert(scope, 's0', () => shown(), {
      template: () => `<path bf-c="s0" data-preview d="${d()}" bf="s1"></path>`,
      bindEvents: (__branchScope) => {
        const __disposers: Array<() => void> = []
        const el = qsa(__branchScope, '[bf="s1"]')
        if (el) {
          __disposers.push(createDisposableEffect(() => {
            const v = d()
            if (v != null) el.setAttribute('d', String(v))
            else el.removeAttribute('d')
          }))
        }
        return () => __disposers.forEach(f => f())
      }
    }, {
      template: () => `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`,
      bindEvents: () => {}
    })

    // Falsy branch: path isn't mounted yet.
    expect(scope.querySelector('[data-preview]')).toBeNull()

    // Rising edge — fresh <path> is inserted. The bindEvents closure
    // resolves it via `qsa(__branchScope, ...)` and writes the current
    // signal value.
    setShown(true)
    let path = scope.querySelector('[data-preview]') as Element | null
    expect(path).not.toBeNull()
    expect(path!.getAttribute('d')).toBe('M 0 0 L 10 10')

    // Drive the signal — the binding writes to the LIVE node.
    setD('M 50 50 L 60 60')
    expect(path!.getAttribute('d')).toBe('M 50 50 L 60 60')

    // Falling edge — branch is removed, the disposable effect cleans up.
    setShown(false)
    expect(scope.querySelector('[data-preview]')).toBeNull()

    // Rising edge again — a NEW <path> node is inserted. The previous
    // closure was cleaned up; a fresh `bindEvents` invocation wires a
    // brand-new effect to the brand-new element.
    setD('M 99 99 L 100 100')
    setShown(true)
    path = scope.querySelector('[data-preview]') as Element | null
    expect(path).not.toBeNull()
    expect(path!.getAttribute('d')).toBe('M 99 99 L 100 100')

    // Subsequent updates after the second mount must still flow to the new node.
    setD('M 1 2 L 3 4')
    expect(path!.getAttribute('d')).toBe('M 1 2 L 3 4')
  })

  test('cleanup closure runs before the next bindEvents — no stale effect on detached node', () => {
    // Guards against a regression where `branchCleanup` is not called and
    // multiple effects accumulate, each writing to a different (stale or
    // live) node. Here we count how many times the body ran across two
    // rising edges; with proper cleanup, exactly one effect is alive at
    // any given moment.
    document.body.innerHTML = `
      <div bf-s="Demo_test2" bf="s2">
        <!--bf-cond-start:s0--><!--bf-cond-end:s0-->
      </div>
    `
    const scope = document.querySelector('[bf-s]')!
    const [on, setOn] = createSignal(false)
    const [tick, setTick] = createSignal(0)
    let effectRuns = 0

    insert(scope, 's0', () => on(), {
      template: () => `<span bf-c="s0" data-tick="${tick()}" bf="s1"></span>`,
      bindEvents: (__branchScope) => {
        const __disposers: Array<() => void> = []
        const el = qsa(__branchScope, '[bf="s1"]')
        if (el) {
          __disposers.push(createDisposableEffect(() => {
            effectRuns++
            el.setAttribute('data-tick', String(tick()))
          }))
        }
        return () => __disposers.forEach(f => f())
      }
    }, {
      template: () => `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`,
      bindEvents: () => {}
    })

    setOn(true)
    const initial = effectRuns
    expect(initial).toBeGreaterThanOrEqual(1)

    // Tick once — exactly one extra run.
    setTick(1)
    expect(effectRuns).toBe(initial + 1)

    // Toggle off then on — the old effect is disposed; a fresh one binds.
    setOn(false)
    setOn(true)
    const afterRebind = effectRuns

    // Drive tick — only ONE effect should fire (the freshly-bound one),
    // not the stale one from the first mount.
    setTick(2)
    expect(effectRuns).toBe(afterRebind + 1)
  })
})
