import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { insert } from '../src/insert'
import { createSignal } from '../src/reactive'
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
})
