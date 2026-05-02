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

  test('skips nested component scopes with same component type', async () => {
    const initialized: Element[] = []

    // Counter nested inside another Counter should be skipped
    // (parent component is responsible for initializing its children)
    document.body.innerHTML = `
      <div bf-s="Counter_1">
        <div bf-s="Counter_nested">nested</div>
      </div>
    `

    hydrate('Counter', { init: (scope) => initialized.push(scope) })
    await flush()

    // Only the outer Counter_1 should be initialized, not the nested one
    expect(initialized.length).toBe(1)
    expect(initialized[0].getAttribute('bf-s')).toBe('Counter_1')
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
