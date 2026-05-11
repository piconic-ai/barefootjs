import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { insert } from '../../src/runtime/insert'
import { __bfSlot } from '../../src/runtime/branch-slot'
import { createSignal, createEffect } from '../../src/reactive'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('insert', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('does not modify DOM on first run when condition is true', () => {
    document.body.innerHTML = `
      <div bf-s="Test_1">
        <span bf-c="c1">Initial</span>
      </div>
    `
    const scope = document.querySelector('[bf-s]')!
    const [show] = createSignal(true)

    insert(
      scope,
      'c1',
      show,
      { template: () => '<span bf-c="c1">Visible</span>', bindEvents: () => {} },
      { template: () => '<span bf-c="c1">Hidden</span>', bindEvents: () => {} }
    )

    // First run should not change DOM (same tag match)
    expect(scope.querySelector('[bf-c]')?.textContent).toBe('Initial')
  })

  test('switches templates when condition changes', () => {
    document.body.innerHTML = `
      <div bf-s="Test_1">
        <span bf-c="c1">Initial</span>
      </div>
    `
    const scope = document.querySelector('[bf-s]')!
    const [show, setShow] = createSignal(true)

    insert(
      scope,
      'c1',
      show,
      { template: () => '<span bf-c="c1">Visible</span>', bindEvents: () => {} },
      { template: () => '<span bf-c="c1">Hidden</span>', bindEvents: () => {} }
    )

    // Toggle to false
    setShow(false)
    expect(scope.querySelector('[bf-c]')?.textContent).toBe('Hidden')

    // Toggle back to true
    setShow(true)
    expect(scope.querySelector('[bf-c]')?.textContent).toBe('Visible')
  })

  test('handles null scope gracefully', () => {
    const [show] = createSignal(true)
    // Should not throw
    insert(
      null,
      'c1',
      show,
      { template: () => '<span>True</span>', bindEvents: () => {} },
      { template: () => '<span>False</span>', bindEvents: () => {} }
    )
  })

  test('calls bindEvents on first run', () => {
    document.body.innerHTML = `
      <div bf-s="Test_1">
        <button bf-c="c1" bf="btn">Click me</button>
      </div>
    `
    const scope = document.querySelector('[bf-s]')!
    const [show] = createSignal(true)
    const boundScopes: Element[] = []

    insert(
      scope,
      'c1',
      show,
      { template: () => '<button bf-c="c1" bf="btn">Show</button>', bindEvents: (s) => boundScopes.push(s) },
      { template: () => '<button bf-c="c1" bf="btn">Hide</button>', bindEvents: () => {} }
    )

    expect(boundScopes.length).toBe(1)
    expect(boundScopes[0]).toBe(scope)
  })

  test('calls bindEvents on condition change', () => {
    document.body.innerHTML = `
      <div bf-s="Test_1">
        <button bf-c="c1">Click me</button>
      </div>
    `
    const scope = document.querySelector('[bf-s]')!
    const [show, setShow] = createSignal(true)
    const trueBound: Element[] = []
    const falseBound: Element[] = []

    insert(
      scope,
      'c1',
      show,
      { template: () => '<button bf-c="c1">Show</button>', bindEvents: (s) => trueBound.push(s) },
      { template: () => '<button bf-c="c1">Hide</button>', bindEvents: (s) => falseBound.push(s) }
    )

    expect(trueBound.length).toBe(1)
    expect(falseBound.length).toBe(0)

    setShow(false)
    expect(falseBound.length).toBe(1)

    setShow(true)
    expect(trueBound.length).toBe(2)
  })

  describe('fragment conditional (comment markers) (#526)', () => {
    test('text swap via comment markers', () => {
      document.body.innerHTML = `
        <div bf-s="Test_1">
          <button><!--bf-cond-start:c1-->Verify<!--bf-cond-end:c1--></button>
        </div>
      `
      const scope = document.querySelector('[bf-s]')!
      const [show, setShow] = createSignal(false)

      insert(
        scope,
        'c1',
        show,
        { template: () => '<!--bf-cond-start:c1-->Verifying...<!--bf-cond-end:c1-->', bindEvents: () => {} },
        { template: () => '<!--bf-cond-start:c1-->Verify<!--bf-cond-end:c1-->', bindEvents: () => {} }
      )

      // Initial: condition is false, should show "Verify"
      const button = scope.querySelector('button')!
      expect(button.textContent).toBe('Verify')

      // Toggle to true → "Verifying..."
      setShow(true)
      expect(button.textContent).toBe('Verifying...')

      // Toggle back to false → "Verify"
      setShow(false)
      expect(button.textContent).toBe('Verify')
    })

    test('inserts live HTMLElement returned via template slots (#1213)', () => {
      // Reproduces the bug from #1213: a `renderNode={(n) => SomeComp(n)}`
      // callback returns a live HTMLElement. The branch template captures
      // it via __bfSlot; insert() must splice the actual node by identity
      // rather than letting the template literal stringify it.
      document.body.innerHTML = `
        <div bf-s="Test_1">
          <!--bf-cond-start:c1--><span>placeholder</span><!--bf-cond-end:c1-->
        </div>
      `
      const scope = document.querySelector('[bf-s]')!
      const live = document.createElement('div')
      live.id = 'live-marker'
      live.textContent = 'live content'
      const [show] = createSignal(true)

      insert(
        scope,
        'c1',
        show,
        {
          template: () => {
            const slots: Node[] = []
            return {
              html: `<!--bf-cond-start:c1-->${__bfSlot(live, slots)}<!--bf-cond-end:c1-->`,
              slots,
            }
          },
          bindEvents: () => {},
        },
        {
          template: () => `<!--bf-cond-start:c1--><!--bf-cond-end:c1-->`,
          bindEvents: () => {},
        },
      )

      // The live node should be in the DOM by identity (not cloned, not
      // stringified to "[object HTMLDivElement]").
      const found = scope.querySelector('#live-marker')
      expect(found).toBe(live)
      expect(scope.textContent).not.toContain('[object')
      expect(scope.textContent).not.toContain('placeholder')
    })

    test('preserves identity for slot nodes nested inside an element wrapper (#1213)', () => {
      // Catches a regression where the runtime would `cloneNode(true)` the
      // parsed wrapper element, cloning the slot Node along with it and
      // dropping its event listeners / signal effects. The fix moves
      // parsed nodes by reference instead of cloning.
      document.body.innerHTML = `
        <div bf-s="Test_1">
          <!--bf-cond-start:c1--><span>placeholder</span><!--bf-cond-end:c1-->
        </div>
      `
      const scope = document.querySelector('[bf-s]')!
      const live = document.createElement('button')
      live.id = 'nested-live'
      live.textContent = 'click'
      let clicks = 0
      live.addEventListener('click', () => { clicks++ })
      const [show] = createSignal(true)

      insert(
        scope,
        'c1',
        show,
        {
          template: () => {
            const slots: Node[] = []
            return {
              html: `<!--bf-cond-start:c1--><div class="wrapper">${__bfSlot(live, slots)}</div><!--bf-cond-end:c1-->`,
              slots,
            }
          },
          bindEvents: () => {},
        },
        {
          template: () => `<!--bf-cond-start:c1--><!--bf-cond-end:c1-->`,
          bindEvents: () => {},
        },
      )

      const found = scope.querySelector('#nested-live')
      expect(found).toBe(live)
      expect((found as HTMLElement | null)?.parentElement?.className).toBe('wrapper')

      // Identity preservation should keep the original event listener
      // attached. Cloning would have detached it.
      ;(found as HTMLElement).click()
      expect(clicks).toBe(1)
    })

    test('preserves identity for slot nodes inside element conditional root (#1213)', () => {
      // First-run hydration with `slots.length > 0` forces a swap via
      // `updateElementConditional`. The replaced element has the slot
      // node nested inside it; identity must survive.
      document.body.innerHTML = `
        <div bf-s="Test_1">
          <div bf-c="c1">stale</div>
        </div>
      `
      const scope = document.querySelector('[bf-s]')!
      const live = document.createElement('button')
      live.id = 'el-cond-live'
      live.textContent = 'live'
      let clicks = 0
      live.addEventListener('click', () => { clicks++ })
      const [show] = createSignal(true)

      insert(
        scope,
        'c1',
        show,
        {
          template: () => {
            const slots: Node[] = []
            return {
              html: `<div bf-c="c1" class="root">${__bfSlot(live, slots)}</div>`,
              slots,
            }
          },
          bindEvents: () => {},
        },
        {
          template: () => `<div bf-c="c1"></div>`,
          bindEvents: () => {},
        },
      )

      const found = scope.querySelector('#el-cond-live')
      expect(found).toBe(live)
      expect((found as HTMLElement | null)?.parentElement?.className).toBe('root')
      ;(found as HTMLElement).click()
      expect(clicks).toBe(1)
    })

    test('swaps live element on branch toggle via slots (#1213)', () => {
      document.body.innerHTML = `
        <div bf-s="Test_1">
          <!--bf-cond-start:c1--><!--bf-cond-end:c1-->
        </div>
      `
      const scope = document.querySelector('[bf-s]')!
      const liveTrue = document.createElement('div')
      liveTrue.id = 'true-marker'
      liveTrue.textContent = 'TRUE'
      const liveFalse = document.createElement('div')
      liveFalse.id = 'false-marker'
      liveFalse.textContent = 'FALSE'
      const [show, setShow] = createSignal(true)

      insert(
        scope,
        'c1',
        show,
        {
          template: () => {
            const slots: Node[] = []
            return {
              html: `<!--bf-cond-start:c1-->${__bfSlot(liveTrue, slots)}<!--bf-cond-end:c1-->`,
              slots,
            }
          },
          bindEvents: () => {},
        },
        {
          template: () => {
            const slots: Node[] = []
            return {
              html: `<!--bf-cond-start:c1-->${__bfSlot(liveFalse, slots)}<!--bf-cond-end:c1-->`,
              slots,
            }
          },
          bindEvents: () => {},
        },
      )

      expect(scope.querySelector('#true-marker')).toBe(liveTrue)
      expect(scope.querySelector('#false-marker')).toBeNull()

      setShow(false)
      expect(scope.querySelector('#false-marker')).toBe(liveFalse)
      expect(scope.querySelector('#true-marker')).toBeNull()

      setShow(true)
      expect(scope.querySelector('#true-marker')).toBe(liveTrue)
    })

    test('null-to-element branch switch via comment markers', () => {
      document.body.innerHTML = `
        <div bf-s="Test_1">
          <!--bf-cond-start:c1--><!--bf-cond-end:c1-->
        </div>
      `
      const scope = document.querySelector('[bf-s]')!
      const [show, setShow] = createSignal(false)

      insert(
        scope,
        'c1',
        show,
        { template: () => '<!--bf-cond-start:c1--><p bf-c="c1">Success!</p><!--bf-cond-end:c1-->', bindEvents: () => {} },
        { template: () => '<!--bf-cond-start:c1--><!--bf-cond-end:c1-->', bindEvents: () => {} }
      )

      // Initial: condition is false, should be empty
      expect(scope.querySelector('p')).toBeNull()

      // Set condition true → <p>Success!</p> appears
      setShow(true)
      const p = scope.querySelector('p')
      expect(p).not.toBeNull()
      expect(p!.textContent).toBe('Success!')

      // Set back to false → element removed
      setShow(false)
      expect(scope.querySelector('p')).toBeNull()
    })
  })

  describe('template purity contract (#1224 follow-up)', () => {
    // The contract: signal reads inside a branch template MUST NOT be
    // attributed to whatever effect is the active Listener when
    // `insert()` runs. Otherwise a `createDisposableEffect` that wraps
    // an `insert()` call would re-run on every signal change inside the
    // template, re-invoke `insert()`, and spawn duplicate inner
    // constructs (e.g. duplicate mapArray instances).
    //
    // These tests verify the contract directly — they exercise the
    // private `evalBranchTemplate` chokepoint through `insert()`'s
    // public API.

    test('isFragmentCond probe does not leak signal reads to a surrounding effect', () => {
      document.body.innerHTML = `
        <div bf-s="Test_1">
          <span bf-c="c1">Initial</span>
        </div>
      `
      const scope = document.querySelector('[bf-s]')!
      const [show] = createSignal(true)
      const [count, setCount] = createSignal(0)

      let outerRuns = 0
      createEffect(() => {
        outerRuns++
        insert(
          scope,
          'c1',
          show,
          {
            // Template intentionally reads `count` — this models the
            // compiler-emitted `_p.item.replies.map(...)` pattern.
            // The probe walks both branches on insert() entry, so the
            // read happens regardless of `show`.
            template: () => `<span bf-c="c1">${count()}</span>`,
            bindEvents: () => {},
          },
          { template: () => '<span bf-c="c1">Hidden</span>', bindEvents: () => {} }
        )
      })

      expect(outerRuns).toBe(1)
      // Mutate the signal the template reads. If insert() were leaking
      // the read into the surrounding createEffect, outerRuns would tick.
      setCount(5)
      expect(outerRuns).toBe(1)
      setCount(6)
      expect(outerRuns).toBe(1)
    })

    test('first-run template evaluation inside insert\'s own effect does not leak', () => {
      document.body.innerHTML = `
        <div bf-s="Test_1">
          <span bf-c="c1">Initial</span>
        </div>
      `
      const scope = document.querySelector('[bf-s]')!
      const [show] = createSignal(true)
      const [count, setCount] = createSignal(0)

      let outerRuns = 0
      createEffect(() => {
        outerRuns++
        insert(
          scope,
          'c1',
          show,
          // Only the active branch reads the signal — exercises the
          // first-run template-evaluation path inside insert's internal
          // createEffect (distinct from the entry-time probe above).
          { template: () => `<span bf-c="c1">${count()}</span>`, bindEvents: () => {} },
          { template: () => '<span bf-c="c1">Hidden</span>', bindEvents: () => {} }
        )
      })

      expect(outerRuns).toBe(1)
      setCount(42)
      expect(outerRuns).toBe(1)
    })

    test('branch-swap template evaluation does not leak', () => {
      document.body.innerHTML = `
        <div bf-s="Test_1">
          <span bf-c="c1">Initial</span>
        </div>
      `
      const scope = document.querySelector('[bf-s]')!
      const [show, setShow] = createSignal(false)
      const [count, setCount] = createSignal(0)

      let outerRuns = 0
      createEffect(() => {
        outerRuns++
        insert(
          scope,
          'c1',
          show,
          { template: () => `<span bf-c="c1">on:${count()}</span>`, bindEvents: () => {} },
          { template: () => `<span bf-c="c1">off:${count()}</span>`, bindEvents: () => {} }
        )
      })

      expect(outerRuns).toBe(1)
      // Trigger a branch swap — this calls the branch.template() path
      // inside insert's internal createEffect at the swap site.
      setShow(true)
      // The branch-swap path itself does not re-run the outer effect.
      expect(outerRuns).toBe(1)
      // And subsequent signal mutations whose reads happened inside the
      // template still do not leak.
      setCount(99)
      expect(outerRuns).toBe(1)
    })
  })
})
