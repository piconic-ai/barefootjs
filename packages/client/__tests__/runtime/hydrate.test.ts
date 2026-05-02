import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { hydrate } from '../../src/runtime/hydrate'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

// `hydrate()` schedules a document-order walk on the next microtask, so
// every test below awaits a microtask flush before asserting on init
// results. See packages/client/src/runtime/hydrate.ts for the rationale.
const flush = () => Promise.resolve()

describe('hydrate', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('initializes root components with props', async () => {
    const initialized: Array<{ props: Record<string, unknown>; scope: Element }> = []

    document.body.innerHTML = `
      <div bf-s="Counter_abc" bf-p='{"count": 5}'>content</div>
    `

    hydrate('Counter', {
      init: (scope, props) => {
        initialized.push({ props, scope })
      }
    })
    await flush()

    expect(initialized.length).toBe(1)
    expect(initialized[0].props).toEqual({ count: 5 })
    expect(initialized[0].scope.getAttribute('bf-s')).toBe('Counter_abc')
  })

  test('parent that calls initChild claims its same-name nested scope', async () => {
    const { initChild } = await import('../../src/runtime/registry')
    const initialized: Element[] = []

    // The walker visits both scopes in document order. When the outer
    // Counter's init calls `initChild('Counter', innerEl)` for its
    // nested same-name child, that initChild marks the inner scope as
    // hydrated — so the walker's later visit short-circuits. The
    // assertion below is on initialized order: outer first, then inner
    // via initChild, then nothing more (walker skip).
    document.body.innerHTML = `
      <div bf-s="Counter_1">
        <div bf-s="Counter_nested">nested</div>
      </div>
    `

    hydrate('Counter', {
      init: (scope) => {
        initialized.push(scope)
        // Outer claims its nested same-name child. Inner Counter has
        // no children of its own to claim — its init is a no-op
        // (no recursive initChild). Without this branching the test
        // would loop forever via mutual hydration.
        if (scope.getAttribute('bf-s') === 'Counter_1') {
          const inner = scope.querySelector('[bf-s="Counter_nested"]')
          if (inner) initChild('Counter', inner)
        }
      },
    })
    await flush()

    expect(initialized.length).toBe(2)
    expect(initialized[0].getAttribute('bf-s')).toBe('Counter_1')
    expect(initialized[1].getAttribute('bf-s')).toBe('Counter_nested')
  })

  test('walker hydrates same-name nested scope when parent does NOT claim it', async () => {
    const initialized: Element[] = []

    // Same DOM as above, but this time the outer's init is a no-op:
    // it does not call initChild for the inner. The walker, having no
    // ancestor-name guard anymore, treats the inner as a top-level
    // scope and hydrates it too. This is what makes nesting depth a
    // non-concern (the previous walker silently dropped inner inits).
    document.body.innerHTML = `
      <div bf-s="Counter_1">
        <div bf-s="Counter_nested">nested</div>
      </div>
    `

    hydrate('Counter', { init: (scope) => initialized.push(scope) })
    await flush()

    expect(initialized.length).toBe(2)
    expect(initialized.map((el) => el.getAttribute('bf-s'))).toEqual([
      'Counter_1',
      'Counter_nested',
    ])
  })

  test('initializes nested component with different parent type', async () => {
    const initialized: Element[] = []

    // Counter nested inside Parent (different type) should NOT be skipped
    // This allows e.g. ToggleItem to hydrate inside Toggle
    document.body.innerHTML = `
      <div bf-s="Parent_1">
        <div bf-s="Counter_nested">nested</div>
      </div>
    `

    hydrate('Counter', { init: (scope) => initialized.push(scope) })
    await flush()

    expect(initialized.length).toBe(1)
    expect(initialized[0].getAttribute('bf-s')).toBe('Counter_nested')
  })

  test('initializes multiple instances', async () => {
    const initialized: Element[] = []

    document.body.innerHTML = `
      <div bf-s="Counter_1">first</div>
      <div bf-s="Counter_2">second</div>
    `

    hydrate('Counter', { init: (scope) => initialized.push(scope) })
    await flush()

    expect(initialized.length).toBe(2)
  })

  test('handles missing props script', async () => {
    const initialized: Array<{ props: Record<string, unknown> }> = []

    document.body.innerHTML = `
      <div bf-s="Counter_abc">content</div>
    `

    hydrate('Counter', {
      init: (_scope, props) => {
        initialized.push({ props })
      }
    })
    await flush()

    expect(initialized.length).toBe(1)
    expect(initialized[0].props).toEqual({})
  })

  test('without comment flag does not hydrate comment-based scopes', async () => {
    const initialized: Element[] = []

    document.body.innerHTML = `
      <!--bf-scope:FragComp_abc|{"FragComp":{}}-->
      <div>child 1</div>
    `

    hydrate('FragComp', { init: (scope) => initialized.push(scope) })
    await flush()

    // Without comment flag, comment-based scopes should be skipped
    expect(initialized.length).toBe(0)
  })

  test('does not crash on invalid props JSON', async () => {
    const initialized: Array<{ props: Record<string, unknown> }> = []

    document.body.innerHTML = `
      <div bf-s="Counter_abc" bf-p='{invalid json}'>content</div>
    `

    hydrate('Counter', {
      init: (_scope, props) => {
        initialized.push({ props })
      }
    })
    await flush()

    expect(initialized.length).toBe(1)
    expect(initialized[0].props).toEqual({})
  })

  test('does not crash on invalid comment props JSON', async () => {
    const initialized: Array<{ props: Record<string, unknown> }> = []

    document.body.innerHTML = `
      <!--bf-scope:FragComp_abc|{broken-->
      <div>child</div>
    `

    hydrate('FragComp', {
      init: (_scope, props) => {
        initialized.push({ props })
      },
      comment: true
    })
    await flush()

    expect(initialized.length).toBe(1)
    expect(initialized[0].props).toEqual({})
  })

  test('with comment=true hydrates comment-based scopes', async () => {
    const initialized: Array<{ props: Record<string, unknown>; scope: Element }> = []

    document.body.innerHTML = `
      <!--bf-scope:FragComp_abc|{"FragComp":{"title":"hello"}}-->
      <div>child 1</div>
    `

    hydrate('FragComp', {
      init: (scope, props) => {
        initialized.push({ props, scope })
      },
      comment: true
    })
    await flush()

    expect(initialized.length).toBe(1)
    expect(initialized[0].props).toEqual({ title: 'hello' })
  })
})
