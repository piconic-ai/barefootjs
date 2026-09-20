import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { createContext, useContext, provideContext, setCurrentScope } from '../../src/runtime/context'
import { createSignal } from '../../src/reactive'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('createContext', () => {
  test('creates context with unique id', () => {
    const ctx1 = createContext<string>()
    const ctx2 = createContext<string>()
    expect(typeof ctx1.id).toBe('symbol')
    expect(ctx1.id).not.toBe(ctx2.id)
  })

  test('stores default value', () => {
    const ctx = createContext('hello')
    expect(ctx.defaultValue).toBe('hello')
  })

  test('default is undefined when not provided', () => {
    const ctx = createContext<string>()
    expect(ctx.defaultValue).toBeUndefined()
  })

  test('default is undefined whether explicit or omitted', () => {
    const withExplicit = createContext<string | undefined>(undefined)
    const withoutDefault = createContext<string>()
    expect(withExplicit.defaultValue).toBeUndefined()
    expect(withoutDefault.defaultValue).toBeUndefined()
  })
})

describe('useContext', () => {
  test('returns default value when no provider', () => {
    const ctx = createContext('fallback')
    expect(useContext(ctx)).toBe('fallback')
  })

  test('returns undefined when no provider and no default', () => {
    const ctx = createContext<string>()
    expect(useContext(ctx)).toBeUndefined()
  })

  test('returns explicit undefined default without throwing', () => {
    const ctx = createContext<string | undefined>(undefined)
    expect(useContext(ctx)).toBeUndefined()
  })
})

describe('provideContext + useContext', () => {
  test('round-trip with simple value', () => {
    const ctx = createContext<number>()
    provideContext(ctx, 42)
    expect(useContext(ctx)).toBe(42)
  })

  test('round-trip with object', () => {
    const ctx = createContext<{ name: string }>()
    const value = { name: 'test' }
    provideContext(ctx, value)
    expect(useContext(ctx)).toBe(value)
  })

  test('round-trip with signal values', () => {
    const ctx = createContext<{ open: () => boolean; setOpen: (v: boolean) => void }>()
    const [open, setOpen] = createSignal(false)
    provideContext(ctx, { open, setOpen })

    const result = useContext(ctx)
    expect(result.open()).toBe(false)

    result.setOpen(true)
    expect(result.open()).toBe(true)
  })

  test('provided value overrides default', () => {
    const ctx = createContext('default')
    provideContext(ctx, 'provided')
    expect(useContext(ctx)).toBe('provided')
  })

  test('multiple independent contexts', () => {
    const ctx1 = createContext<string>()
    const ctx2 = createContext<number>()

    provideContext(ctx1, 'hello')
    provideContext(ctx2, 99)

    expect(useContext(ctx1)).toBe('hello')
    expect(useContext(ctx2)).toBe(99)
  })

  test('null as valid value', () => {
    const ctx = createContext<string | null>('default')
    provideContext(ctx, null)
    expect(useContext(ctx)).toBeNull()
  })

  test('0 as valid value', () => {
    const ctx = createContext<number>(999)
    provideContext(ctx, 0)
    expect(useContext(ctx)).toBe(0)
  })

  test('false as valid value', () => {
    const ctx = createContext<boolean>(true)
    provideContext(ctx, false)
    expect(useContext(ctx)).toBe(false)
  })

  test('empty string as valid value', () => {
    const ctx = createContext<string>('default')
    provideContext(ctx, '')
    expect(useContext(ctx)).toBe('')
  })

  test('reactivity propagates through context', () => {
    const ctx = createContext<() => number>()
    const [count, setCount] = createSignal(0)
    provideContext(ctx, count)

    const getter = useContext(ctx)
    expect(getter()).toBe(0)

    setCount(10)
    expect(getter()).toBe(10)
  })

  test('useContext captures value at call time', () => {
    const ctx = createContext<number>()

    provideContext(ctx, 1)
    const val1 = useContext(ctx)

    provideContext(ctx, 2)
    const val2 = useContext(ctx)

    // val1 captured the value 1, val2 captured 2
    expect(val1).toBe(1)
    expect(val2).toBe(2)
  })
})

// #3059 follow-up: multiple instances of a component using a
// self-owner-portaled child (NavigationMenu/Menubar/ContextMenu's
// Content/Overlay, whose own root carries bf-s and is portaled via
// createPortal — never SSR-portal-placed, so this is unrelated to #3059's
// own SSR outlet work) were observed on a real `site/ui` reference page
// sharing ONE instance's open/active state instead of each reading its
// own. Reproduces the exact DOM shape: two independent host instances,
// each with a portaled self-owner content element carrying a
// self-referential bf-po (the shape `createPortal`'s
// `el.closest('[bf-s]')` produces when the portaled element is itself a
// component) and a correct, non-self-referential bf-h naming its real
// host.
describe('useContext — self-owner portaled child, multiple instances (#3059 follow-up)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function setupInstance(hostId: string, contentId: string) {
    const host = document.createElement('div')
    host.setAttribute('bf-s', hostId)
    document.body.appendChild(host)

    // Content starts as a host descendant (its SSR position)…
    const content = document.createElement('div')
    content.setAttribute('bf-s', contentId)
    content.setAttribute('bf-h', hostId)
    host.appendChild(content)

    // …then createPortal relocates it to document.body, stamping a
    // self-referential bf-po (content IS a component, so
    // `el.closest('[bf-s]')` computed before the move resolves to
    // itself).
    content.setAttribute('bf-po', contentId)
    document.body.appendChild(content)

    return { host, content }
  }

  test('each instance resolves its own provided value, not another instance\'s', () => {
    const ctx = createContext<{ label: string }>()

    const a = setupInstance('NavMenuA', 'NavMenuA_content')
    const b = setupInstance('NavMenuB', 'NavMenuB_content')

    // Each host provides its own value, as the real Context.Provider
    // compiles down to — provideContext also pre-seeds descendants still
    // in their SSR position, but by the time both hosts have provided,
    // only ONE value survives in the module-level global fallback.
    setCurrentScope(a.host)
    provideContext(ctx, { label: 'A' })
    setCurrentScope(b.host)
    provideContext(ctx, { label: 'B' })
    setCurrentScope(null)

    setCurrentScope(a.content)
    const fromA = useContext(ctx)
    setCurrentScope(b.content)
    const fromB = useContext(ctx)
    setCurrentScope(null)

    expect(fromA.label).toBe('A')
    expect(fromB.label).toBe('B')
  })

  test('falls back to the global store only when no bf-h/bf-po path resolves', () => {
    const ctx = createContext<string>('default')
    provideContext(ctx, 'global')

    const orphan = document.createElement('div')
    orphan.setAttribute('bf-s', 'Orphan_1')
    document.body.appendChild(orphan)

    setCurrentScope(orphan)
    const result = useContext(ctx)
    setCurrentScope(null)

    expect(result).toBe('global')
  })
})
