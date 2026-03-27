import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { reconcileElements } from '../src/reconcile-elements'
import { hydratedScopes } from '../src/hydration-state'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('reconcileElements', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    container = document.createElement('ul')
    document.body.appendChild(container)
  })

  test('renders items into empty container', () => {
    const items = [{ id: '1', text: 'A' }, { id: '2', text: 'B' }]

    reconcileElements(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item.text
        return li
      }
    )

    expect(container.children.length).toBe(2)
    expect(container.children[0].textContent).toBe('A')
    expect(container.children[1].textContent).toBe('B')
  })

  test('clears container for empty array', () => {
    container.innerHTML = '<li>old</li>'

    reconcileElements(
      container,
      [],
      null,
      () => document.createElement('li')
    )

    expect(container.children.length).toBe(0)
  })

  test('reuses elements by key', () => {
    // Initial render
    const items = [{ id: '1', text: 'A' }, { id: '2', text: 'B' }]
    reconcileElements(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item.text
        li.setAttribute('data-key', item.id)
        return li
      }
    )

    // Mark elements as hydrated so they are recognized as initialized
    for (const child of Array.from(container.children)) {
      hydratedScopes.add(child)
    }

    // Re-render with same keys but different text
    const updated = [{ id: '1', text: 'A2' }, { id: '2', text: 'B2' }]
    reconcileElements(
      container,
      updated,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item.text
        li.setAttribute('data-key', item.id)
        return li
      }
    )

    expect(container.children.length).toBe(2)
    // Elements are replaced (no focus), so new text is shown
    expect(container.children[0].textContent).toBe('A2')
    expect(container.children[1].textContent).toBe('B2')
  })

  test('removes elements not in new items', () => {
    const items = [{ id: '1', text: 'A' }, { id: '2', text: 'B' }, { id: '3', text: 'C' }]
    reconcileElements(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item.text
        li.setAttribute('data-key', item.id)
        return li
      }
    )

    // Remove middle item
    const fewer = [{ id: '1', text: 'A' }, { id: '3', text: 'C' }]
    reconcileElements(
      container,
      fewer,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item.text
        li.setAttribute('data-key', item.id)
        return li
      }
    )

    expect(container.children.length).toBe(2)
    expect(container.children[0].getAttribute('data-key')).toBe('1')
    expect(container.children[1].getAttribute('data-key')).toBe('3')
  })

  test('handles null container gracefully', () => {
    expect(() =>
      reconcileElements(null, [{ id: '1' }], (item) => item.id, () => document.createElement('li'))
    ).not.toThrow()
  })

  test('replaces SSR elements that are not yet hydrated', () => {
    // Simulate SSR-rendered element with bf-s but not in hydratedScopes
    container.innerHTML = '<li bf-s="Item_abc" data-key="1">SSR</li>'

    const items = [{ id: '1', text: 'Client' }]
    reconcileElements(
      container,
      items,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item.text
        return li
      }
    )

    expect(container.children.length).toBe(1)
    expect(container.children[0].textContent).toBe('Client')
  })

  test('uses firstElement for index 0', () => {
    const firstEl = document.createElement('li')
    firstEl.textContent = 'pre-created'

    const items = [{ id: '1' }, { id: '2' }]
    reconcileElements(
      container,
      items,
      (item) => item.id,
      (_item, i) => {
        const li = document.createElement('li')
        li.textContent = `created-${i}`
        return li
      },
      firstEl
    )

    expect(container.children.length).toBe(2)
    expect(container.children[0].textContent).toBe('pre-created')
    expect(container.children[1].textContent).toBe('created-1')
  })
})

