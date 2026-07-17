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

  // A fragment-root component's runtime scope is a comment-scope *proxy*
  // element — one specific top-level sibling picked to anchor lookups, per
  // `commentScopeRegistry`. A conditional's own markers can land as a
  // *different* top-level sibling of that same proxy (not nested inside
  // it) — e.g. piconic-ai/sora's `ListSidebar`, where a stable `<aside>`
  // is the proxy and a reopen-button conditional sits alongside it as a
  // sibling. `updateFragmentConditional`/`updateElementConditional`/
  // `autoFocusConditionalElement` used to search only the *descendants* of
  // `scope` (`document.createTreeWalker(scope, ...)` / `scope.querySelector`),
  // so they never found such a conditional's markers — the branch silently
  // froze on whatever rendered at first hydration, forever, no error.
  describe('conditional as a top-level sibling of a comment-scope proxy', () => {
    test('fragment-conditional branch swap finds markers outside the proxy element', async () => {
      const { commentScopeRegistry } = await import('../../src/runtime/scope.ts')

      document.body.innerHTML =
        '<div bf-s="Parent_abc">' +
        '<!--bf-scope:Parent_abc_s1|h=Parent_abc|m=s1-->' +
        '<aside>sidebar content</aside>' +
        '<!--bf-cond-start:c1--><!--bf-cond-end:c1-->' +
        '<!--bf-/scope:Parent_abc_s1-->' +
        '</div>'

      const container = document.querySelector('[bf-s="Parent_abc"]')!
      const comment = Array.from(container.childNodes).find(
        (n) => n.nodeType === 8 && n.nodeValue?.startsWith('bf-scope:')
      ) as Comment
      const proxy = container.querySelector('aside')!
      commentScopeRegistry.set(proxy, { commentNode: comment, scopeId: 'Parent_abc_s1' })

      const [show, setShow] = createSignal(false)

      insert(
        proxy,
        'c1',
        show,
        { template: () => '<!--bf-cond-start:c1--><button>reopen</button><!--bf-cond-end:c1-->', bindEvents: () => {} },
        { template: () => '<!--bf-cond-start:c1--><!--bf-cond-end:c1-->', bindEvents: () => {} }
      )

      expect(container.querySelector('button')).toBeNull()

      setShow(true)
      expect(container.querySelector('button')?.textContent).toBe('reopen')

      setShow(false)
      expect(container.querySelector('button')).toBeNull()
    })

    test('element-conditional branch swap finds the bf-c element outside the proxy', async () => {
      const { commentScopeRegistry } = await import('../../src/runtime/scope.ts')

      document.body.innerHTML =
        '<div bf-s="Parent_def">' +
        '<!--bf-scope:Parent_def_s1|h=Parent_def|m=s1-->' +
        '<aside>sidebar content</aside>' +
        '<span bf-c="c2">off</span>' +
        '<!--bf-/scope:Parent_def_s1-->' +
        '</div>'

      const container = document.querySelector('[bf-s="Parent_def"]')!
      const comment = Array.from(container.childNodes).find(
        (n) => n.nodeType === 8 && n.nodeValue?.startsWith('bf-scope:')
      ) as Comment
      const proxy = container.querySelector('aside')!
      commentScopeRegistry.set(proxy, { commentNode: comment, scopeId: 'Parent_def_s1' })

      const [show, setShow] = createSignal(false)

      insert(
        proxy,
        'c2',
        show,
        { template: () => '<span bf-c="c2">on</span>', bindEvents: () => {} },
        { template: () => '<span bf-c="c2">off</span>', bindEvents: () => {} }
      )

      expect(container.querySelector('[bf-c="c2"]')?.textContent).toBe('off')

      setShow(true)
      expect(container.querySelector('[bf-c="c2"]')?.textContent).toBe('on')

      setShow(false)
      expect(container.querySelector('[bf-c="c2"]')?.textContent).toBe('off')
    })
  })

  // Contract documented on `BranchConfig.template` in insert.ts.
  describe('template purity contract', () => {
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
          // The probe walks BOTH branches on insert() entry, so a read in
          // either template would leak — putting it in the inactive
          // branch isolates the probe path from the first-run path below.
          { template: () => '<span bf-c="c1">Visible</span>', bindEvents: () => {} },
          { template: () => `<span bf-c="c1">${count()}</span>`, bindEvents: () => {} }
        )
      })

      expect(outerRuns).toBe(1)
      setCount(5)
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
      setShow(true)
      setCount(99)
      expect(outerRuns).toBe(1)
    })
  })
})
