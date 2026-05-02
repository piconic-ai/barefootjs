import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { __bf_swap, setupStreaming } from '../../src/runtime/streaming'
import { hydrate, rehydrateAll } from '../../src/runtime/hydrate'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('__bf_swap', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('swaps fallback content with resolved template', () => {
    document.body.innerHTML = `
      <div bf-async="a0"><p>Loading...</p></div>
      <template bf-async-resolve="a0"><div>Resolved content</div></template>
    `

    __bf_swap('a0')

    // Fallback replaced with resolved content
    const slot = document.querySelector('div:not(template)')!
    expect(slot.innerHTML).toContain('Resolved content')
    expect(slot.hasAttribute('bf-async')).toBe(false)

    // Template element removed
    expect(document.querySelector('template[bf-async-resolve]')).toBeNull()
  })

  test('does nothing when slot is missing', () => {
    document.body.innerHTML = `
      <template bf-async-resolve="a0"><div>Content</div></template>
    `

    // Should not throw
    __bf_swap('a0')

    // Template should still be there (not cleaned up if no slot found)
    expect(document.querySelector('template[bf-async-resolve]')).not.toBeNull()
  })

  test('does nothing when template is missing', () => {
    document.body.innerHTML = `
      <div bf-async="a0"><p>Loading...</p></div>
    `

    __bf_swap('a0')

    // Fallback should remain unchanged
    expect(document.querySelector('[bf-async="a0"]')!.innerHTML).toContain('Loading...')
  })

  test('handles multiple async boundaries independently', () => {
    document.body.innerHTML = `
      <div bf-async="a0"><p>Loading 1...</p></div>
      <div bf-async="a1"><p>Loading 2...</p></div>
      <template bf-async-resolve="a0"><div>Content 1</div></template>
    `

    // Only resolve a0
    __bf_swap('a0')

    // a0 resolved
    const first = document.querySelector('div:not([bf-async]):not(template)')!
    expect(first.innerHTML).toContain('Content 1')

    // a1 still showing fallback
    const second = document.querySelector('[bf-async="a1"]')!
    expect(second.innerHTML).toContain('Loading 2...')
  })

  test('preserves hydration markers in resolved content', () => {
    document.body.innerHTML = `
      <div bf-async="a0"><p>Loading...</p></div>
      <template bf-async-resolve="a0"><div bf-s="Counter_x1" bf-p='{"count":0}'>0</div></template>
    `

    __bf_swap('a0')

    // Hydration markers should be preserved in swapped content
    const counter = document.querySelector('[bf-s="Counter_x1"]')
    expect(counter).not.toBeNull()
    expect(counter!.getAttribute('bf-p')).toBe('{"count":0}')
  })
})

describe('rehydrateAll', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('hydrates components added after initial hydration', async () => {
    const initialized: string[] = []

    // Initial hydration
    document.body.innerHTML = `
      <div bf-s="Counter_1" bf-p='{}'>initial</div>
    `
    hydrate('Counter', {
      init: (scope) => { initialized.push(scope.getAttribute('bf-s')!) },
    })
    // hydrate() schedules its walker on the next microtask.
    await Promise.resolve()

    expect(initialized).toEqual(['Counter_1'])

    // Simulate streaming: add new content to DOM
    const newEl = document.createElement('div')
    newEl.setAttribute('bf-s', 'Counter_2')
    newEl.setAttribute('bf-p', '{}')
    newEl.textContent = 'streamed'
    document.body.appendChild(newEl)

    // Trigger re-hydration. `rehydrateAll()` schedules a walk through
    // the same microtask + rAF pipeline as `hydrate()`, so we await a
    // microtask flush before asserting.
    rehydrateAll()
    await Promise.resolve()

    expect(initialized).toEqual(['Counter_1', 'Counter_2'])
  })

  test('does not re-hydrate already initialized elements', async () => {
    let initCount = 0

    document.body.innerHTML = `
      <div bf-s="Toggle_1" bf-p='{}'>toggle</div>
    `
    hydrate('Toggle', {
      init: () => { initCount++ },
    })
    await Promise.resolve()

    expect(initCount).toBe(1)

    // Re-hydrate should not re-initialize
    rehydrateAll()
    await Promise.resolve()
    expect(initCount).toBe(1)
  })
})

describe('setupStreaming', () => {
  test('installs __bf_swap on window', () => {
    setupStreaming()

    const w = window as unknown as Record<string, unknown>
    expect(typeof w.__bf_swap).toBe('function')
    expect(typeof w.__bf_hydrate).toBe('function')
  })
})
