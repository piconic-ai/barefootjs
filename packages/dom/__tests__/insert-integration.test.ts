/**
 * Integration test: onClick → signal update → conditional text update (#526)
 *
 * Simulates the full hydration + click scenario to verify
 * that text-only ternary branches update correctly.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { insert } from '../src/insert'
import { createSignal, createEffect } from '../src/reactive'
import { $ as query } from '../src/query'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('insert integration (#526)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('onClick handler → signal update → text ternary updates', () => {
    // Simulate SSR-rendered HTML (status() returns 'idle', condition is false)
    document.body.innerHTML = `
      <div bf-s="VerifyForm_test1" bf="s4">
        <button bf="s1"><!--bf-cond-start:s0-->Verify<!--bf-cond-end:s0--></button>
        <!--bf-cond-start:s2--><!--bf-cond-end:s2-->
        <!--bf-cond-start:s3--><!--bf-cond-end:s3-->
      </div>
    `

    const scope = document.querySelector('[bf-s]')!
    expect(scope).not.toBeNull()

    // Simulate initVerifyForm (generated code)
    const [status, setStatus] = createSignal('idle')
    const handleSubmit = () => { setStatus('loading') }

    const [_s1] = query(scope, 's1')

    // disabled attribute effect
    createEffect(() => {
      if (_s1) {
        ;(_s1 as HTMLButtonElement).disabled = !!(status() === 'loading')
      }
    })

    // Text ternary: {status() === 'loading' ? 'Verifying...' : 'Verify'}
    insert(scope, 's0', () => status() === 'loading', {
      template: () => `<!--bf-cond-start:s0-->${'Verifying...'}<!--bf-cond-end:s0-->`,
      bindEvents: () => {}
    }, {
      template: () => `<!--bf-cond-start:s0-->${'Verify'}<!--bf-cond-end:s0-->`,
      bindEvents: () => {}
    })

    // Logical AND: {status() === 'success' && <p>Success!</p>}
    insert(scope, 's2', () => status() === 'success', {
      template: () => '<p bf-c="s2">Success!</p>',
      bindEvents: () => {}
    }, {
      template: () => '<!--bf-cond-start:s2--><!--bf-cond-end:s2-->',
      bindEvents: () => {}
    })

    // Logical AND: {status() === 'error' && <p>Error occurred</p>}
    insert(scope, 's3', () => status() === 'error', {
      template: () => '<p bf-c="s3">Error occurred</p>',
      bindEvents: () => {}
    }, {
      template: () => '<!--bf-cond-start:s3--><!--bf-cond-end:s3-->',
      bindEvents: () => {}
    })

    // Bind onclick
    if (_s1) (_s1 as HTMLButtonElement).onclick = handleSubmit

    const button = scope.querySelector('button')!

    // Verify initial state
    expect(button.textContent).toBe('Verify')
    expect((button as HTMLButtonElement).disabled).toBe(false)
    expect(scope.querySelector('p')).toBeNull()

    // Simulate click → setStatus('loading')
    handleSubmit()

    // Text should update to "Verifying..."
    expect(button.textContent).toBe('Verifying...')
    expect((button as HTMLButtonElement).disabled).toBe(true)

    // setStatus('success')
    setStatus('success')

    // Text should go back to "Verify" (not loading)
    expect(button.textContent).toBe('Verify')
    expect((button as HTMLButtonElement).disabled).toBe(false)

    // Success message should appear
    const successEl = scope.querySelector('p')
    expect(successEl).not.toBeNull()
    expect(successEl!.textContent).toBe('Success!')
  })

  test('multiple signal updates toggle text correctly', () => {
    document.body.innerHTML = `
      <div bf-s="Toggle_test1">
        <button bf="s1"><!--bf-cond-start:s0-->Off<!--bf-cond-end:s0--></button>
      </div>
    `

    const scope = document.querySelector('[bf-s]')!
    const [active, setActive] = createSignal(false)

    insert(scope, 's0', () => active(), {
      template: () => `<!--bf-cond-start:s0-->${'On'}<!--bf-cond-end:s0-->`,
      bindEvents: () => {}
    }, {
      template: () => `<!--bf-cond-start:s0-->${'Off'}<!--bf-cond-end:s0-->`,
      bindEvents: () => {}
    })

    const button = scope.querySelector('button')!
    expect(button.textContent).toBe('Off')

    // Toggle on
    setActive(true)
    expect(button.textContent).toBe('On')

    // Toggle off
    setActive(false)
    expect(button.textContent).toBe('Off')

    // Toggle on again
    setActive(true)
    expect(button.textContent).toBe('On')
  })
})
