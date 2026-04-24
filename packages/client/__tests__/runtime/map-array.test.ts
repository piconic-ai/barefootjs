import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { createSignal, createEffect, createRoot } from '../../src/reactive'
import { mapArray } from '../../src/runtime/map-array'
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

  // Regression: #949. The emitter (see destructureLoopParam in
  // emit-control-flow.ts) now renames the renderItem param to a synthetic
  // accessor and unwraps once at body entry. This shape — "function-typed
  // param unwrapped via __bfItem()" — is what the compiled output
  // produces for `signalArr().map(([a, b]) => ...)`. The test exercises
  // the contract directly against the runtime so the fix doesn't silently
  // regress on the client side.
  test('destructuring via accessor unwrap works for array-pattern params', () => {
    const [items, setItems] = createSignal<[string, string][]>([
      ['1', 'A'],
      ['2', 'B'],
    ])

    mapArray(
      items,
      container,
      (item, _i) => item[0],
      // Shape matches compiled output: synthetic __bfItem, unwrap at entry.
      (__bfItem) => {
        const [a, b] = __bfItem()
        const li = document.createElement('li')
        li.setAttribute('data-a', a)
        li.textContent = b
        return li
      },
    )

    expect(container.children.length).toBe(2)
    expect(container.children[0].getAttribute('data-a')).toBe('1')
    expect(container.children[0].textContent).toBe('A')
    expect(container.children[1].getAttribute('data-a')).toBe('2')
    expect(container.children[1].textContent).toBe('B')

    // Array-level update: add + reorder must update DOM.
    setItems([
      ['3', 'C'],
      ['1', 'A'],
      ['2', 'B'],
    ])

    expect(container.children.length).toBe(3)
    expect(container.children[0].getAttribute('data-a')).toBe('3')
    expect(container.children[1].getAttribute('data-a')).toBe('1')
    expect(container.children[2].getAttribute('data-a')).toBe('2')

    // Remove one.
    setItems([['1', 'A']])
    expect(container.children.length).toBe(1)
    expect(container.children[0].getAttribute('data-a')).toBe('1')
  })

  test('destructuring via accessor unwrap works for object-pattern params', () => {
    const [items, setItems] = createSignal([
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ])

    mapArray(
      items,
      container,
      (item) => item.id,
      (__bfItem) => {
        const { id, label } = __bfItem()
        const li = document.createElement('li')
        li.setAttribute('data-id', id)
        li.textContent = label
        return li
      },
    )

    expect(container.children.length).toBe(2)
    expect(container.children[0].getAttribute('data-id')).toBe('1')
    expect(container.children[0].textContent).toBe('A')

    setItems([{ id: '2', label: 'B' }, { id: '3', label: 'C' }])

    expect(container.children.length).toBe(2)
    expect(container.children[0].getAttribute('data-id')).toBe('2')
    expect(container.children[1].getAttribute('data-id')).toBe('3')
    expect(container.children[1].textContent).toBe('C')
  })

  // #951 regression guard. Compiled output for a destructured `.map()`
  // callback no longer emits `const [, b] = __bfItem()` at body entry —
  // references to `b` are rewritten to `__bfItem()[1]` at IR emission
  // time, so fine-grained effects read the live per-item accessor.
  // mapArray still reuses the DOM node on same-key setItem updates, but
  // effects registered inside renderItem re-run when the signal changes,
  // so the DOM refreshes.
  //
  // This test mirrors the compiled output shape: no local destructure,
  // effects read `__bfItem()[1]` directly. The predecessor pinning test
  // locked in the pre-#951 captured-once semantics; flipping it here is
  // intentional. See `jsx-to-ir.ts::extractLoopParamBindings` and
  // `emit-control-flow.ts::destructureLoopParam`.
  test('destructured locals refresh via signal accessor on same-key setItem (#951)', () => {
    const [items, setItems] = createSignal<[string, string][]>([['1', 'A']])

    mapArray(
      items,
      container,
      (item) => item[0],
      (__bfItem) => {
        const li = document.createElement('li')
        // Compiler-generated shape: each destructured reference becomes
        // an `__bfItem().path` accessor read inside a createEffect.
        // `bf-test-val` makes the assertion target clearly a barefoot-test
        // marker, not a generic user attribute.
        createEffect(() => {
          li.setAttribute('bf-test-val', __bfItem()[1])
          li.textContent = __bfItem()[1]
        })
        return li
      },
    )

    const firstEl = container.children[0]
    expect(firstEl.textContent).toBe('A')
    expect(firstEl.getAttribute('bf-test-val')).toBe('A')

    // Same key '1', new inner value — mapArray reuses the DOM node and
    // fires setItem. The effects re-run because they read the per-item
    // accessor, so the DOM text/attribute refresh to the new value.
    setItems([['1', 'B']])

    expect(container.children[0]).toBe(firstEl)
    expect(firstEl.textContent).toBe('B')
    expect(firstEl.getAttribute('bf-test-val')).toBe('B')

    // Array-level update (different key) still produces a fresh
    // renderItem call, so a new DOM node is created.
    setItems([['2', 'C']])

    expect(container.children[0].getAttribute('bf-test-val')).toBe('C')
    expect(container.children[0].textContent).toBe('C')
  })
})
