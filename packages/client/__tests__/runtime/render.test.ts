import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { render } from '../../src/runtime/render'
import { createComponent, renderChild } from '../../src/runtime/component'
import { $c } from '../../src/runtime/query'
import { registerComponent } from '../../src/runtime/registry'
import { registerTemplate } from '../../src/runtime/template'
import { hydrate, flushHydration } from '../../src/runtime/hydrate'
import { hydratedScopes } from '../../src/runtime/hydration-state'
import type { ComponentDef } from '../../src/runtime/types'
import type { InitFn } from '../../src/runtime/types'
import type { TemplateFn } from '../../src/runtime/template'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

function registerTestComponent(name: string, init: InitFn, template: TemplateFn): void {
  registerComponent(name, init)
  registerTemplate(name, template)
}

describe('render', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('renders component into container', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const initialized: Element[] = []
    registerTestComponent(
      'RenderTest_Basic',
      (scope) => { initialized.push(scope) },
      (props) => `<div class="counter">${props.count ?? 0}</div>`
    )

    render(container, 'RenderTest_Basic', { count: 42 })

    expect(container.children.length).toBe(1)
    expect(container.firstElementChild?.textContent).toBe('42')
    expect(container.firstElementChild?.className).toBe('counter')
    expect(initialized.length).toBe(1)
  })

  test('clears existing content', () => {
    const container = document.createElement('div')
    container.innerHTML = '<p>old content</p>'
    document.body.appendChild(container)

    registerTestComponent(
      'RenderTest_Clear',
      () => {},
      () => `<div>new content</div>`
    )

    render(container, 'RenderTest_Clear')

    expect(container.children.length).toBe(1)
    expect(container.firstElementChild?.textContent).toBe('new content')
  })

  test('sets bf-s scope attribute', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    registerTestComponent(
      'RenderTest_Scope',
      () => {},
      () => `<div>content</div>`
    )

    render(container, 'RenderTest_Scope')

    expect(container.firstElementChild?.hasAttribute('bf-s')).toBe(true)
  })

  test('throws when component is not registered', () => {
    const container = document.createElement('div')

    expect(() => render(container, 'RenderTest_NotRegistered')).toThrow('not registered')
  })

  test('passes props to init', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const receivedProps: Record<string, unknown>[] = []
    registerTestComponent(
      'RenderTest_Props',
      (_scope, props) => { receivedProps.push(props) },
      () => `<div>content</div>`
    )

    render(container, 'RenderTest_Props', { foo: 'bar' })

    expect(receivedProps.length).toBe(1)
    expect(receivedProps[0]).toEqual({ foo: 'bar' })
  })

  test('marks element in hydratedScopes after init', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    registerTestComponent(
      'RenderTest_Hydrated',
      () => {},
      () => `<div>content</div>`
    )

    render(container, 'RenderTest_Hydrated')

    const element = container.firstElementChild!
    expect(hydratedScopes.has(element)).toBe(true)
  })
})

describe('render multi-root (fragment) templates', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('appends every root element, not just the first', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    registerTestComponent(
      'RenderTest_MultiRoot',
      () => {},
      () => `<h1>one</h1><h2>two</h2><h3>three</h3>`
    )

    render(container, 'RenderTest_MultiRoot')

    const headings = container.querySelectorAll('h1, h2, h3')
    expect(headings.length).toBe(3)
    expect(container.textContent).toBe('onetwothree')
  })

  test('resolves sibling child scopes via the comment-scope range', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    registerTestComponent('FragLeafA', () => {}, (p) => `<h1 data-slot="a">${p.children}</h1>`)
    registerTestComponent('FragLeafB', () => {}, (p) => `<h2 data-slot="b">${p.children}</h2>`)

    const resolved: (Element | null)[] = []
    registerTestComponent(
      'RenderTest_Frag',
      (scope) => {
        const [s0, s1] = $c(scope, 's0', 's1')
        resolved.push(s0, s1)
      },
      () =>
        `${renderChild('FragLeafA', { children: 'one' }, undefined, 's0')}` +
        `${renderChild('FragLeafB', { children: 'two' }, undefined, 's1')}`
    )

    render(container, 'RenderTest_Frag', {})

    // Both roots mounted (regression: previously only the first sibling).
    expect(container.querySelector('[data-slot="a"]')?.textContent).toBe('one')
    expect(container.querySelector('[data-slot="b"]')?.textContent).toBe('two')
    // $c() from init resolved the *second* sibling, not just s0.
    expect(resolved[0]?.getAttribute('data-slot')).toBe('a')
    expect(resolved[1]?.getAttribute('data-slot')).toBe('b')
  })

  test('does not re-init the fragment when the hydration walker runs', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let initCount = 0
    // Register through hydrate() (the real preview/app path) so the async
    // document-order walker is scheduled — registerTestComponent bypasses it.
    // Name must be a single token: the walker derives the component name as
    // the substring before the first `_` in the scope id.
    hydrate('RenderFragHydrate', {
      init: () => {
        initCount++
      },
      template: () => `<h1>a</h1><h2>b</h2>`,
      comment: true,
    })

    render(container, 'RenderFragHydrate', {})
    expect(initCount).toBe(1) // render() initialized it once, synchronously

    // Run the walker synchronously: it visits the bf-scope comment render()
    // created. Without honouring hydratedScopes it would init a second time.
    flushHydration()
    expect(initCount).toBe(1)
  })
})

describe('render with ComponentDef', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('renders from ComponentDef without registry lookup', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const initialized: Array<{ scope: Element; props: Record<string, unknown> }> = []
    const def: ComponentDef = {
      name: 'DefBased',
      init: (scope, props) => { initialized.push({ scope, props }) },
      template: (props) => `<section>${props.label}</section>`,
    }

    render(container, def, { label: 'custom-node' })

    expect(container.children.length).toBe(1)
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('section')
    expect(container.firstElementChild?.textContent).toBe('custom-node')
    expect(initialized.length).toBe(1)
    expect(initialized[0].props).toEqual({ label: 'custom-node' })
  })

  test('uses def.name as scope prefix', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const def: ComponentDef = {
      name: 'MyScopedDef',
      init: () => {},
      template: () => `<div>x</div>`,
    }

    render(container, def)

    const scope = container.firstElementChild?.getAttribute('bf-s') ?? ''
    expect(scope.startsWith('MyScopedDef_')).toBe(true)
  })

  test('throws when ComponentDef has no template', () => {
    const container = document.createElement('div')
    const def: ComponentDef = { init: () => {} }

    expect(() => render(container, def)).toThrow('requires a template function')
  })

  test('marks element in hydratedScopes after init', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const def: ComponentDef = {
      init: () => {},
      template: () => `<div>x</div>`,
    }

    render(container, def)

    expect(hydratedScopes.has(container.firstElementChild!)).toBe(true)
  })
})

describe('createComponent with ComponentDef', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('creates element from ComponentDef', () => {
    const initialized: Element[] = []
    const def: ComponentDef = {
      init: (scope) => { initialized.push(scope) },
      template: (props) => `<li>${props.text}</li>`
    }

    const el = createComponent(def, { text: 'hello' })

    expect(el.tagName.toLowerCase()).toBe('li')
    expect(el.textContent).toBe('hello')
    expect(el.hasAttribute('bf-s')).toBe(true)
    expect(initialized.length).toBe(1)
  })

  test('sets data-key when provided', () => {
    const def: ComponentDef = {
      init: () => {},
      template: () => `<li>item</li>`
    }

    const el = createComponent(def, {}, 'key-1')

    expect(el.getAttribute('data-key')).toBe('key-1')
  })
})
