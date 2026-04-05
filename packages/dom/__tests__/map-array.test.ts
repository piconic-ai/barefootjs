import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { createSignal, createEffect, createRoot } from '../src/reactive'
import { mapArray } from '../src/map-array'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('createRoot', () => {
  test('isolates signal tracking from parent effect', () => {
    const [count, setCount] = createSignal(0)
    let outerRuns = 0
    let innerRuns = 0

    createEffect(() => {
      outerRuns++
      createRoot(() => {
        createEffect(() => {
          innerRuns++
          count() // read inside inner root
        })
      })
    })

    expect(outerRuns).toBe(1)
    expect(innerRuns).toBe(1)

    setCount(1)
    expect(outerRuns).toBe(1)
    expect(innerRuns).toBe(2)
  })

  test('dispose cleans up all child effects', () => {
    const [count, setCount] = createSignal(0)
    let runs = 0
    let disposeFn!: () => void

    createRoot((dispose) => {
      disposeFn = dispose
      createEffect(() => {
        runs++
        count()
      })
    })

    expect(runs).toBe(1)
    setCount(1)
    expect(runs).toBe(2)

    disposeFn()
    setCount(2)
    expect(runs).toBe(2)
  })

  test('nested roots dispose independently', () => {
    const [a, setA] = createSignal(0)
    const [b, setB] = createSignal(0)
    let aRuns = 0
    let bRuns = 0
    let disposeInner!: () => void

    createRoot(() => {
      createEffect(() => { aRuns++; a() })

      createRoot((dispose) => {
        disposeInner = dispose
        createEffect(() => { bRuns++; b() })
      })
    })

    expect(aRuns).toBe(1)
    expect(bRuns).toBe(1)

    disposeInner()
    setB(1)
    expect(bRuns).toBe(1)

    setA(1)
    expect(aRuns).toBe(2)
  })
})

describe('mapArray', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    container = document.createElement('ul')
    document.body.appendChild(container)
  })

  // Note: renderItem receives item as a signal accessor: item() returns current value
  test('renders initial items', () => {
    const [items] = createSignal([
      { id: '1', text: 'A' },
      { id: '2', text: 'B' },
    ])

    mapArray(
      items,
      container,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item().text
        return li
      },
    )

    expect(container.children.length).toBe(2)
    expect(container.children[0].textContent).toBe('A')
    expect(container.children[1].textContent).toBe('B')
  })

  test('adds new items', () => {
    const [items, setItems] = createSignal([{ id: '1', text: 'A' }])

    mapArray(
      items,
      container,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item().text
        return li
      },
    )

    expect(container.children.length).toBe(1)

    setItems([{ id: '1', text: 'A' }, { id: '2', text: 'B' }])

    expect(container.children.length).toBe(2)
    expect(container.children[0].textContent).toBe('A')
    expect(container.children[1].textContent).toBe('B')
  })

  test('removes items and disposes their scopes', () => {
    const [items, setItems] = createSignal([
      { id: '1', text: 'A' },
      { id: '2', text: 'B' },
      { id: '3', text: 'C' },
    ])

    mapArray(
      items,
      container,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item().text
        return li
      },
    )

    setItems([{ id: '1', text: 'A' }, { id: '3', text: 'C' }])

    expect(container.children.length).toBe(2)
    expect(container.children[0].textContent).toBe('A')
    expect(container.children[1].textContent).toBe('C')
  })

  test('reorders items and preserves DOM elements', () => {
    const [items, setItems] = createSignal([
      { id: '1', text: 'A' },
      { id: '2', text: 'B' },
      { id: '3', text: 'C' },
    ])

    mapArray(
      items,
      container,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item().text
        return li
      },
    )

    const elA = container.children[0]
    const elB = container.children[1]
    const elC = container.children[2]

    // Reverse order — same keys, elements should be preserved
    setItems([
      { id: '3', text: 'C' },
      { id: '2', text: 'B' },
      { id: '1', text: 'A' },
    ])

    expect(container.children.length).toBe(3)
    // Same DOM nodes, just reordered
    expect(container.children[0]).toBe(elC)
    expect(container.children[1]).toBe(elB)
    expect(container.children[2]).toBe(elA)
  })

  test('clears to empty', () => {
    const [items, setItems] = createSignal([{ id: '1', text: 'A' }])

    mapArray(
      items,
      container,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item().text
        return li
      },
    )

    expect(container.children.length).toBe(1)

    setItems([])
    expect(container.children.length).toBe(0)
  })

  test('disposes item scope when item is removed', () => {
    const [items, setItems] = createSignal([{ id: '1', text: 'A' }])
    const [signal, setSignal] = createSignal(0)
    let effectRuns = 0

    mapArray(
      items,
      container,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        li.textContent = item().text
        createEffect(() => {
          effectRuns++
          signal()
        })
        return li
      },
    )

    expect(effectRuns).toBe(1)
    setSignal(1)
    expect(effectRuns).toBe(2)

    setItems([])
    setSignal(2)
    expect(effectRuns).toBe(2)
  })

  test('same-key item updates in place via per-item signal', () => {
    const [items, setItems] = createSignal([{ id: '1', text: 'A' }])

    mapArray(
      items,
      container,
      (item) => item.id,
      (item) => {
        const li = document.createElement('li')
        // Fine-grained effect reads item signal
        createEffect(() => {
          li.textContent = item().text
        })
        return li
      },
    )

    const firstEl = container.children[0]
    expect(firstEl.textContent).toBe('A')

    // Update item data (same key, new object)
    setItems([{ id: '1', text: 'B' }])

    // Same DOM element preserved
    expect(container.children[0]).toBe(firstEl)
    // Text updated via fine-grained effect
    expect(container.children[0].textContent).toBe('B')
  })

  test('same-key update does not re-call renderItem', () => {
    const [items, setItems] = createSignal([{ id: '1', text: 'A' }])
    let renderCount = 0

    mapArray(
      items,
      container,
      (item) => item.id,
      (item) => {
        renderCount++
        const li = document.createElement('li')
        createEffect(() => { li.textContent = item().text })
        return li
      },
    )

    expect(renderCount).toBe(1)

    setItems([{ id: '1', text: 'B' }])

    // renderItem should NOT be called again for same-key item
    expect(renderCount).toBe(1)
    expect(container.children[0].textContent).toBe('B')
  })
})
