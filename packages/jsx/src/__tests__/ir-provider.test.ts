/**
 * BarefootJS Compiler - Context.Provider IR Tests
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { compileJSX } from '../compiler'
import { ErrorCodes } from '../errors'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('Context.Provider JSX', () => {
  test('<X.Provider value={...}> becomes IRProvider with contextName, valueProp, and children', () => {
    // <MenuContext.Provider> should produce an IRProvider node that:
    // - extracts "MenuContext" from "MenuContext.Provider"
    // - captures the value prop expression
    // - preserves child elements
    const source = `
      'use client'
      import { createContext, createSignal, provideContext } from '@barefootjs/client'

      const MenuContext = createContext()

      export function DropdownMenu({ children }) {
        const [open, setOpen] = createSignal(false)
        return (
          <MenuContext.Provider value={{ open, setOpen }}>
            <div>{children}</div>
          </MenuContext.Provider>
        )
      }
    `

    const ctx = analyzeComponent(source, 'DropdownMenu.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).toMatchObject({
      type: 'provider',
      contextName: 'MenuContext',
      valueProp: {
        name: 'value',
        value: { kind: 'expression', expr: '{ open, setOpen }' },
      },
      children: [
        {
          type: 'element',
          tag: 'div',
          children: [
            { type: 'expression', expr: 'children' },
          ],
        },
      ],
    })
  })

  test('Provider preserves multiple children as sibling IR nodes', () => {
    // Provider is transparent — its children should appear
    // directly under the IRProvider node, not wrapped.
    const source = `
      'use client'
      import { createContext, createSignal, provideContext } from '@barefootjs/client'

      const Ctx = createContext()

      export function Tabs({ children }) {
        const [active, setActive] = createSignal(0)
        return (
          <Ctx.Provider value={{ active, setActive }}>
            <div className="tabs-header">Header</div>
            <div className="tabs-body">{children}</div>
          </Ctx.Provider>
        )
      }
    `

    const ctx = analyzeComponent(source, 'Tabs.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).toMatchObject({
      type: 'provider',
      contextName: 'Ctx',
      valueProp: { name: 'value', value: { kind: 'expression', expr: '{ active, setActive }' } },
      children: [
        { type: 'element', tag: 'div', attrs: [{ name: 'class', value: { kind: 'literal', value: 'tabs-header' } }] },
        { type: 'element', tag: 'div', attrs: [{ name: 'class', value: { kind: 'literal', value: 'tabs-body' } }] },
      ],
    })
  })

  test('compiler generates provideContext() before initChild() in client JS', () => {
    // The generated init function must:
    // 1. Import provideContext from @barefootjs/client
    // 2. Call provideContext(ContextName, valueExpr) BEFORE initChild()
    //    so child components can read the context during their initialization
    const adapter = new TestAdapter()
    const source = `
      'use client'
      import { createContext, createSignal, provideContext } from '@barefootjs/client'

      const MenuContext = createContext()

      export function DropdownMenu(props) {
        const [open, setOpen] = createSignal(false)
        return (
          <MenuContext.Provider value={{ open, setOpen }}>
            <DropdownTrigger />
          </MenuContext.Provider>
        )
      }
    `

    const result = compileJSX(source, 'DropdownMenu.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    expect(clientJs).toBeDefined()

    // Verify the init function body contains the expected sequence:
    //   provideContext(MenuContext, { open, setOpen })   <- context setup
    //   initChild('DropdownTrigger', ...)                <- child init (after)
    const initBody = clientJs.content
      .split('\n')
      .filter(line => line.includes('provideContext(') || line.includes('initChild('))
      .map(line => line.trim())

    expect(initBody).toEqual([
      'provideContext(MenuContext, { open, setOpen })',
      "initChild('DropdownTrigger', _s0, {})",
    ])
  })

  test('provider-only root (no element child) auto-generates scope wrapper (#290)', () => {
    // When a component returns only a Provider wrapping {children},
    // the compiler should auto-wrap in a <div style="display:contents"> with needsScope=true
    const source = `
      'use client'
      import { createContext, createSignal, provideContext } from '@barefootjs/client'

      const DialogContext = createContext()

      export function Dialog({ children }) {
        const [open, setOpen] = createSignal(false)
        return (
          <DialogContext.Provider value={{ open, setOpen }}>
            {children}
          </DialogContext.Provider>
        )
      }
    `

    const ctx = analyzeComponent(source, 'Dialog.tsx')
    const ir = jsxToIR(ctx)

    // Root should be a synthetic scope wrapper element
    expect(ir).toMatchObject({
      type: 'element',
      tag: 'div',
      needsScope: true,
      attrs: [{ name: 'style', value: { kind: 'literal', value: 'display:contents' } }],
      children: [
        {
          type: 'provider',
          contextName: 'DialogContext',
          children: [
            { type: 'expression', expr: 'children' },
          ],
        },
      ],
    })
  })

  test('provider with element child does NOT get auto-wrapped (#290)', () => {
    // When a provider already contains an HTML element, no wrapper should be added
    const source = `
      'use client'
      import { createContext, createSignal, provideContext } from '@barefootjs/client'

      const MenuContext = createContext()

      export function DropdownMenu({ children }) {
        const [open, setOpen] = createSignal(false)
        return (
          <MenuContext.Provider value={{ open, setOpen }}>
            <div>{children}</div>
          </MenuContext.Provider>
        )
      }
    `

    const ctx = analyzeComponent(source, 'DropdownMenu.tsx')
    const ir = jsxToIR(ctx)

    // Root should be the provider itself (no synthetic wrapper)
    expect(ir).toMatchObject({
      type: 'provider',
      contextName: 'MenuContext',
      children: [
        {
          type: 'element',
          tag: 'div',
          needsScope: true,
        },
      ],
    })
  })

  test('end-to-end: provider-only component generates hydrate + provideContext in client JS (#290)', () => {
    const adapter = new TestAdapter()
    const source = `
      'use client'
      import { createContext, createSignal, provideContext } from '@barefootjs/client'

      const DialogContext = createContext()

      export function Dialog(props) {
        const [open, setOpen] = createSignal(false)
        return (
          <DialogContext.Provider value={{ open, setOpen }}>
            {props.children}
          </DialogContext.Provider>
        )
      }
    `

    const result = compileJSX(source, 'Dialog.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    expect(clientJs).toBeDefined()

    // The generated client JS must contain hydrate (for registration + hydration)
    // and provideContext (for context setup)
    expect(clientJs.content).toContain('hydrate')
    expect(clientJs.content).toContain('provideContext(DialogContext')
  })

  test('strips TypeScript type annotations from provider value expression (#341)', () => {
    const source = `
      'use client'
      import { createContext, createSignal, provideContext } from '@barefootjs/client'

      const Ctx = createContext()

      export function Root() {
        const [val, setVal] = createSignal('')
        return (
          <Ctx.Provider value={{ onValueChange: (newValue: string) => { setVal(newValue) } }}>
            <div>child</div>
          </Ctx.Provider>
        )
      }
    `

    const result = compileJSX(source, 'Root.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    expect(clientJs).toBeDefined()
    expect(clientJs.content).toContain('provideContext(Ctx')
    expect(clientJs.content).not.toContain('newValue: string')
  })

  test('named function references in provider value are emitted in client JS (#342)', () => {
    const source = `
      'use client'
      import { createContext, createSignal, provideContext } from '@barefootjs/client'

      const TabsContext = createContext()

      export function Tabs(props) {
        const [value, setValue] = createSignal(props.defaultValue ?? '')
        const handleValueChange = (newValue) => {
          setValue(newValue)
          props.onValueChange?.(newValue)
        }
        return (
          <TabsContext.Provider value={{ value, handleValueChange }}>
            <div>{props.children}</div>
          </TabsContext.Provider>
        )
      }
    `

    const result = compileJSX(source, 'Tabs.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    expect(clientJs).toBeDefined()
    expect(clientJs.content).toContain('handleValueChange')
    // Function must be defined before provideContext call
    const fnIndex = clientJs.content.indexOf('handleValueChange')
    const provideIndex = clientJs.content.indexOf('provideContext(TabsContext')
    expect(fnIndex).toBeLessThan(provideIndex)
  })

  test('self-closing <X.Provider /> produces IRProvider with empty children', () => {
    // Self-closing syntax should work just like the open/close form
    // but with no children (e.g., for provider-only setup components)
    const source = `
      'use client'
      import { createContext, createSignal, provideContext } from '@barefootjs/client'

      const Ctx = createContext()

      export function Root() {
        const [val, setVal] = createSignal(0)
        return <Ctx.Provider value={{ val, setVal }} />
      }
    `

    const ctx = analyzeComponent(source, 'Root.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).toMatchObject({
      type: 'provider',
      contextName: 'Ctx',
      valueProp: {
        name: 'value',
        value: { kind: 'expression', expr: '{ val, setVal }' },
      },
      children: [],
    })
  })

  test('reports BF046 and walks children when value prop is missing', () => {
    const source = `
      import { createContext } from '@barefootjs/client'
      const Ctx = createContext<unknown>()
      export function Page() {
        return (
          <Ctx.Provider>
            <span>x</span>
          </Ctx.Provider>
        )
      }
    `

    const ctx = analyzeComponent(source, 'Page.tsx')
    const ir = jsxToIR(ctx)

    const error = ctx.errors.find(e => e.code === ErrorCodes.COMPONENT_REQUIRED_PROP_MISSING)
    expect(error).toBeDefined()
    expect(error?.severity).toBe('error')
    expect(error?.message).toContain('value')

    // Stub fragment preserves the IR shape and the descendant walk.
    expect(ir?.type).toBe('fragment')
    if (ir?.type === 'fragment') {
      expect(ir.children.length).toBe(1)
    }
  })

  test('reports BF046 when self-closing Provider lacks value prop', () => {
    const source = `
      import { createContext } from '@barefootjs/client'
      const Ctx = createContext<unknown>()
      export function Page() {
        return <Ctx.Provider />
      }
    `

    const ctx = analyzeComponent(source, 'Page.tsx')
    const ir = jsxToIR(ctx)

    const error = ctx.errors.find(e => e.code === ErrorCodes.COMPONENT_REQUIRED_PROP_MISSING)
    expect(error).toBeDefined()
    expect(error?.severity).toBe('error')
    expect(ir?.type).toBe('fragment')

    // Empty stub at root must NOT emit `needsScopeComment` — see
    // ir-async.test.ts for the runtime parentElement-fallback rationale.
    if (ir?.type === 'fragment') {
      expect(ir.children.length).toBe(0)
      expect(ir.needsScopeComment).toBeUndefined()
    }
  })

  test('compileJSX surfaces BF046 in errors without crashing on multi-child stub', () => {
    // Multi-child + root pins the scope-metadata path: a transparent stub
    // would suppress needsScopeComment and leak ctx.isRoot to only the first
    // child. Whatever the adapter chooses to emit, compileJSX must not throw
    // and the BF046 diagnostic must reach result.errors so consumers can
    // fail the build.
    const source = `
      import { createContext } from '@barefootjs/client'
      const Ctx = createContext<unknown>()
      export function Page() {
        return (
          <Ctx.Provider>
            <header>a</header>
            <footer>b</footer>
          </Ctx.Provider>
        )
      }
    `

    const result = compileJSX(source, 'Page.tsx', { adapter })

    const error = result.errors.find(e => e.code === ErrorCodes.COMPONENT_REQUIRED_PROP_MISSING)
    expect(error).toBeDefined()
    expect(error?.severity).toBe('error')
  })
})

describe('Context API constraints (#1607)', () => {
  test('useContext without "use client" triggers BF001', () => {
    const source = `
      import { createContext, useContext } from '@barefootjs/client'

      const Ctx = createContext()

      export function Consumer() {
        const handleMount = (el: HTMLElement) => {
          const ctx = useContext(Ctx)
        }
        return <div ref={handleMount} />
      }
    `

    const result = compileJSX(source, 'Consumer.tsx', { adapter })
    const bf001 = result.errors.find(e => e.code === ErrorCodes.MISSING_USE_CLIENT)
    expect(bf001).toBeDefined()
  })

  test('useContext with "use client" compiles without errors', () => {
    const source = `
      'use client'
      import { createContext, useContext } from '@barefootjs/client'

      const Ctx = createContext()

      export function Consumer() {
        const handleMount = (el: HTMLElement) => {
          const ctx = useContext(Ctx)
        }
        return <div ref={handleMount} />
      }
    `

    const result = compileJSX(source, 'Consumer.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
  })

  test('useContext import is rewritten to runtime path in client JS', () => {
    const source = `
      'use client'
      import { createContext, useContext } from '@barefootjs/client'

      const Ctx = createContext()

      export function Consumer() {
        const handleMount = (el: HTMLElement) => {
          const ctx = useContext(Ctx)
        }
        return <div ref={handleMount} />
      }
    `

    const result = compileJSX(source, 'Consumer.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!
    expect(clientJs).toBeDefined()
    expect(clientJs.content).toContain("from '@barefootjs/client/runtime'")
    expect(clientJs.content).toContain('useContext')
  })

  test('same-file provider + consumer compiles with provideContext before useContext', () => {
    const source = `
      'use client'
      import { createContext, useContext, createSignal } from '@barefootjs/client'

      const ThemeContext = createContext('light')

      export function ThemeProvider(props) {
        return (
          <ThemeContext.Provider value={props.theme}>
            <ThemedButton />
          </ThemeContext.Provider>
        )
      }

      function ThemedButton() {
        const handleMount = (el: HTMLButtonElement) => {
          const theme = useContext(ThemeContext)
          el.className = theme === 'dark' ? 'btn-dark' : 'btn-light'
        }
        return <button ref={handleMount}>click</button>
      }
    `

    const result = compileJSX(source, 'Theme.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    const provideIdx = clientJs.content.indexOf('provideContext(ThemeContext')
    const useIdx = clientJs.content.indexOf('useContext(ThemeContext')
    expect(provideIdx).toBeGreaterThan(-1)
    expect(useIdx).toBeGreaterThan(-1)
    expect(provideIdx).toBeLessThan(useIdx)
  })
})
