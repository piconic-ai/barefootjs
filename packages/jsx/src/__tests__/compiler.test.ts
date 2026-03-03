/**
 * BarefootJS Compiler - Basic Tests
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync, compileJSX } from '../compiler'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { analyzeClientNeeds } from '../ir-to-client-js'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../../packages/hono/src/adapter/hono-adapter'
import { resolve, dirname } from 'node:path'
import { isBooleanAttr, BOOLEAN_ATTRS } from '../html-constants'

// Create a shared adapter instance for tests
const adapter = new TestAdapter()

describe('Compiler', () => {
  describe('analyzeComponent', () => {
    test('extracts signals', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div>{count()}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Counter.tsx')

      expect(ctx.componentName).toBe('Counter')
      expect(ctx.signals).toHaveLength(1)
      expect(ctx.signals[0].getter).toBe('count')
      expect(ctx.signals[0].setter).toBe('setCount')
      expect(ctx.signals[0].initialValue).toBe('0')
      expect(ctx.hasUseClientDirective).toBe(true)
    })

    test('extracts props', () => {
      const source = `
        'use client'

        interface CounterProps {
          initial?: number
        }

        export function Counter({ initial = 0 }: CounterProps) {
          return <div>{initial}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Counter.tsx')

      expect(ctx.componentName).toBe('Counter')
      expect(ctx.propsParams).toHaveLength(1)
      expect(ctx.propsParams[0].name).toBe('initial')
      expect(ctx.propsParams[0].defaultValue).toBe('0')
      expect(ctx.typeDefinitions).toHaveLength(1)
      expect(ctx.typeDefinitions[0].name).toBe('CounterProps')
    })

    test('extracts memos', () => {
      const source = `
        'use client'
        import { createSignal, createMemo } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          const doubled = createMemo(() => count() * 2)
          return <div>{doubled()}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Counter.tsx')

      expect(ctx.memos).toHaveLength(1)
      expect(ctx.memos[0].name).toBe('doubled')
      expect(ctx.memos[0].computation).toBe('() => count() * 2')
    })

    test('does not collect variables from nested function declarations', () => {
      const source = `
        'use client'

        export function FilterList() {
          const topLevelConst = 'visible'

          function getInitialFilter() {
            const hash = window.location.hash
            return hash ? hash.slice(1) : 'all'
          }

          return <div>{topLevelConst}</div>
        }
      `

      const ctx = analyzeComponent(source, 'FilterList.tsx')

      // Should collect top-level const
      expect(ctx.localConstants.some((c) => c.name === 'topLevelConst')).toBe(
        true
      )
      // Should NOT collect variables from nested function declaration
      expect(ctx.localConstants.some((c) => c.name === 'hash')).toBe(false)
    })
  })

  describe('jsxToIR', () => {
    test('transforms simple element', () => {
      const source = `
        'use client'

        export function App() {
          return <div>Hello</div>
        }
      `

      const ctx = analyzeComponent(source, 'App.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir?.type).toBe('element')
      if (ir?.type === 'element') {
        expect(ir.tag).toBe('div')
        expect(ir.children).toHaveLength(1)
        expect(ir.children[0].type).toBe('text')
      }
    })

    test('transforms element with event', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>Click</button>
        }
      `

      const ctx = analyzeComponent(source, 'Counter.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir?.type).toBe('element')
      if (ir?.type === 'element') {
        expect(ir.tag).toBe('button')
        expect(ir.events).toHaveLength(1)
        expect(ir.events[0].name).toBe('click')
      }
    })

    test('transforms dynamic expression', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div>{count()}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Counter.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir?.type).toBe('element')
      if (ir?.type === 'element') {
        expect(ir.children).toHaveLength(1)
        expect(ir.children[0].type).toBe('expression')
        if (ir.children[0].type === 'expression') {
          expect(ir.children[0].reactive).toBe(true)
          expect(ir.children[0].slotId).not.toBeNull()
        }
      }
    })

    test('marks constant reference attributes as dynamic', () => {
      // Regression test for: JSX attribute values referencing constants should be
      // rendered as {expr} not "expr" string literals
      const source = `
        'use client'

        const paths = {
          'icon': 'M12 0L24 12',
        } as const

        export function Icon() {
          return <svg><path d={paths['icon']} /></svg>
        }
      `

      const ctx = analyzeComponent(source, 'Icon.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir?.type).toBe('element')
      if (ir?.type === 'element') {
        // svg element
        expect(ir.tag).toBe('svg')
        expect(ir.children).toHaveLength(1)

        const pathElement = ir.children[0]
        expect(pathElement.type).toBe('element')
        if (pathElement.type === 'element') {
          expect(pathElement.tag).toBe('path')
          // The 'd' attribute should be marked as dynamic
          const dAttr = pathElement.attrs.find(a => a.name === 'd')
          expect(dAttr).toBeDefined()
          expect(dAttr?.value).toBe("paths['icon']")
          expect(dAttr?.dynamic).toBe(true)
        }
      }
    })

    test('ternary constant has valueBranches', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Demo() {
          const [active, setActive] = createSignal(false)
          const cls = active() ? 'a b' : 'c d'
          return <div className={cls}></div>
        }
      `

      const ctx = analyzeComponent(source, 'test.tsx')
      const cls = ctx.localConstants.find(c => c.name === 'cls')
      expect(cls).toBeDefined()
      expect(cls!.valueBranches).toEqual(["'a b'", "'c d'"])
    })

    test('nested ternary constant has flattened valueBranches', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Demo() {
          const [state, setState] = createSignal(0)
          const cls = state() === 0 ? 'a' : state() === 1 ? 'b' : 'c'
          return <div className={cls}></div>
        }
      `

      const ctx = analyzeComponent(source, 'test.tsx')
      const cls = ctx.localConstants.find(c => c.name === 'cls')
      expect(cls).toBeDefined()
      expect(cls!.valueBranches).toEqual(["'a'", "'b'", "'c'"])
    })

    test('non-ternary constant has no valueBranches', () => {
      const source = `
        'use client'

        export function Demo() {
          const cls = 'hello world'
          return <div className={cls}></div>
        }
      `

      const ctx = analyzeComponent(source, 'test.tsx')
      const cls = ctx.localConstants.find(c => c.name === 'cls')
      expect(cls).toBeDefined()
      expect(cls!.valueBranches).toBeUndefined()
    })
  })

  describe('compileJSXSync', () => {
    test('compiles simple component', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return (
            <button onClick={() => setCount(n => n + 1)}>
              Count: {count()}
            </button>
          )
        }
      `

      const result = compileJSXSync(source, 'Counter.tsx', { adapter })

      expect(result.errors).toHaveLength(0)
      expect(result.files).toHaveLength(2) // markedJsx + clientJs

      const markedJsx = result.files.find(f => f.type === 'markedTemplate')
      expect(markedJsx).toBeDefined()
      expect(markedJsx?.content).toContain('export function Counter')

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs?.content).toContain('initCounter')
    })

    test('extracts props-based event handlers in client JS', () => {
      // Regression test: event handlers passed as props should be extracted from props
      const source = `
        'use client'

        interface ButtonProps {
          onClick?: () => void
        }

        export function Button(props: ButtonProps) {
          return <button onClick={props.onClick}>Click</button>
        }
      `

      const result = compileJSXSync(source, 'Button.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should use props.onClick directly
      expect(clientJs?.content).toContain('props.onClick')
    })

    test('extracts props and props-dependent constants in client JS', () => {
      // Regression test: props used in template literals should be extracted,
      // and constants that depend on props should also be included
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        interface Props {
          command: string
        }

        export function CommandDisplay(props: Props) {
          const [show, setShow] = createSignal(true)
          const fullCommand = \`npx \${props.command}\`

          return (
            <div>
              <button onClick={() => setShow(!show())}>Toggle</button>
              <pre>{show() ? fullCommand : ''}</pre>
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'CommandDisplay.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should use props.command directly in fullCommand constant
      expect(clientJs?.content).toContain('const fullCommand = `npx ${props.command}`')
    })

    test('outputs IR JSON when requested', () => {
      const source = `
        'use client'

        export function App() {
          return <div>Hello</div>
        }
      `

      const result = compileJSXSync(source, 'App.tsx', { adapter, outputIR: true })

      const ir = result.files.find(f => f.type === 'ir')
      expect(ir).toBeDefined()
      expect(ir?.content).toContain('"version": "0.1"')
    })

    test('inlines local constants in child component props getter', () => {
      // Local constants referenced in child component props should be
      // inlined in the getter for reactivity (SolidJS-style)
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function AccordionItem() {
          const [open, setOpen] = createSignal(false)
          const iconClasses = \`transition \${open() ? 'rotate-180' : ''}\`

          return (
            <div>
              <button onClick={() => setOpen(!open())}>Toggle</button>
              <ChevronIcon className={iconClasses} />
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'AccordionItem.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should use getter syntax with inlined constant value for reactivity
      expect(clientJs?.content).toContain('get className() { return `transition ${open() ?')
    })
  })

  describe('real components', () => {
    test('compiles ButtonDemo component', async () => {
      // Path to the actual button-demo component
      const docsUiPath = resolve(dirname(import.meta.path), '../../../../site/ui')
      const buttonDemoPath = resolve(docsUiPath, 'components/button-demo.tsx')

      const result = await compileJSX(buttonDemoPath, async (path) => {
        const file = Bun.file(path)
        return await file.text()
      }, { adapter })

      // Should have no errors
      expect(result.errors).toHaveLength(0)

      // Should generate markedJsx and clientJs
      expect(result.files.length).toBeGreaterThanOrEqual(2)

      const markedJsx = result.files.find(f => f.type === 'markedTemplate')
      expect(markedJsx).toBeDefined()
      expect(markedJsx?.content).toContain('export function ButtonDemo')

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs?.content).toContain('initButtonDemo')
    })

    test('compiles component with props', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        interface CounterProps {
          initial?: number
          label: string
        }

        export function Counter(props: CounterProps) {
          const [count, setCount] = createSignal(props.initial ?? 0)
          return (
            <button onClick={() => setCount(n => n + 1)}>
              {props.label}: {count()}
            </button>
          )
        }
      `

      const result = compileJSXSync(source, 'Counter.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const markedJsx = result.files.find(f => f.type === 'markedTemplate')
      expect(markedJsx).toBeDefined()
      // Should preserve props in function signature
      expect(markedJsx?.content).toContain('initial')
      expect(markedJsx?.content).toContain('label')

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs?.content).toContain('createSignal')
    })
  })

  describe('boolean attributes', () => {
    test('isBooleanAttr identifies known boolean attributes', () => {
      expect(isBooleanAttr('checked')).toBe(true)
      expect(isBooleanAttr('disabled')).toBe(true)
      expect(isBooleanAttr('readonly')).toBe(true)
      expect(isBooleanAttr('selected')).toBe(true)
      expect(isBooleanAttr('required')).toBe(true)
      expect(isBooleanAttr('hidden')).toBe(true)
      expect(isBooleanAttr('autofocus')).toBe(true)
      expect(isBooleanAttr('autoplay')).toBe(true)
      expect(isBooleanAttr('controls')).toBe(true)
      expect(isBooleanAttr('loop')).toBe(true)
      expect(isBooleanAttr('muted')).toBe(true)
      expect(isBooleanAttr('open')).toBe(true)
      expect(isBooleanAttr('multiple')).toBe(true)
      expect(isBooleanAttr('novalidate')).toBe(true)
    })

    test('isBooleanAttr is case-insensitive', () => {
      expect(isBooleanAttr('CHECKED')).toBe(true)
      expect(isBooleanAttr('Disabled')).toBe(true)
    })

    test('isBooleanAttr returns false for non-boolean attrs', () => {
      expect(isBooleanAttr('class')).toBe(false)
      expect(isBooleanAttr('id')).toBe(false)
      expect(isBooleanAttr('value')).toBe(false)
      expect(isBooleanAttr('type')).toBe(false)
    })

    test('BOOLEAN_ATTRS contains all expected attributes', () => {
      expect(BOOLEAN_ATTRS.size).toBe(14)
      expect(BOOLEAN_ATTRS.has('checked')).toBe(true)
      expect(BOOLEAN_ATTRS.has('disabled')).toBe(true)
    })

    test('compiles dynamic boolean attribute using DOM property', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Checkbox() {
          const [isChecked, setIsChecked] = createSignal(false)
          return (
            <input type="checkbox" checked={isChecked()} onChange={() => setIsChecked(!isChecked())} />
          )
        }
      `

      const result = compileJSXSync(source, 'Checkbox.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should use DOM property assignment for boolean attrs, not setAttribute
      expect(clientJs?.content).toContain('.checked = !!')
      expect(clientJs?.content).not.toContain("setAttribute('checked'")
    })

    test('compiles dynamic disabled attribute using DOM property', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Button() {
          const [isLoading, setIsLoading] = createSignal(false)
          return (
            <button disabled={isLoading()}>Submit</button>
          )
        }
      `

      const result = compileJSXSync(source, 'Button.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should use DOM property assignment for boolean attrs
      expect(clientJs?.content).toContain('.disabled = !!')
    })

    test('compiles data-disabled={expr || undefined} using setAttribute/removeAttribute', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Button(props: { disabled?: boolean }) {
          return (
            <button data-disabled={props.disabled || undefined}>Submit</button>
          )
        }
      `

      const result = compileJSXSync(source, 'Button.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should use setAttribute/removeAttribute for boolean presence attrs
      expect(clientJs?.content).toContain("setAttribute('data-disabled', '')")
      expect(clientJs?.content).toContain("removeAttribute('data-disabled')")
      // Should NOT use String() wrapper
      expect(clientJs?.content).not.toContain("String(props.disabled)")
      // Should strip `|| undefined` from the expression
      expect(clientJs?.content).not.toContain('|| undefined')
    })

    test('compiles data-state={open() || undefined} using setAttribute/removeAttribute', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Dialog() {
          const [open, setOpen] = createSignal(false)
          return (
            <div data-state={open() || undefined}>Content</div>
          )
        }
      `

      const result = compileJSXSync(source, 'Dialog.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should use setAttribute/removeAttribute for boolean presence attrs
      expect(clientJs?.content).toContain("setAttribute('data-state', '')")
      expect(clientJs?.content).toContain("removeAttribute('data-state')")
      // Should strip `|| undefined`
      expect(clientJs?.content).not.toContain('|| undefined')
    })
  })

  describe('map with index parameter', () => {
    test('includes index parameter in reconcileTemplates callback', () => {
      const source = `
        'use client'
        import { createMemo } from '@barefootjs/dom'

        export function List() {
          const items = createMemo(() => ['a', 'b', 'c'])
          return (
            <div>
              {items().map((item, i) => (
                <div key={i} className={\`item-\${i}\`}>{item}</div>
              ))}
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'List.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // Should include index param in callback (not just item without index)
      expect(clientJs?.content).toContain('(item, i) => `')
    })

    test('includes index parameter in key function when key references index', () => {
      const source = `
        'use client'
        import { createMemo } from '@barefootjs/dom'

        export function List() {
          const items = createMemo(() => ['a', 'b', 'c'])
          return (
            <ul>
              {items().map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )
        }
      `

      const result = compileJSXSync(source, 'List.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // Key function must include the index parameter to avoid ReferenceError
      expect(clientJs?.content).toContain('(item, i) => String(i)')
    })
  })

  describe('local constants arrow function detection', () => {
    test('type cast expression starting with ( should NOT become arrow function stub', () => {
      // Issue #212: Type casts like "(array as Type).method()" were incorrectly
      // treated as arrow functions because they start with "("
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        const iconNames = ['chevron', 'arrow'] as const
        type IconName = typeof iconNames[number]

        export function Icon(props: { name: IconName }) {
          const [active, setActive] = createSignal(false)
          const linecap = (iconNames as readonly string[]).includes(props.name) ? 'butt' : 'round'
          return (
            <svg stroke-linecap={linecap} onClick={() => setActive(true)}>
              <path d="M0 0" />
            </svg>
          )
        }
      `

      const result = compileJSXSync(source, 'Icon.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should NOT convert type cast to arrow function stub
      expect(clientJs?.content).not.toContain('const linecap = () => {}')
    })

    test('grouped expression starting with ( should NOT become arrow function stub', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Calculator() {
          const [count, setCount] = createSignal(0)
          const a = 2
          const b = 3
          const result = (a + b) * count()
          return (
            <div onClick={() => setCount(n => n + 1)}>{result}</div>
          )
        }
      `

      const result = compileJSXSync(source, 'Calculator.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should NOT convert grouped expression to arrow function stub
      expect(clientJs?.content).not.toContain('const result = () => {}')
    })

    test('does not default conditional-guard props to {} in client JS', () => {
      // Regression: optional object props used as conditional guards (e.g. {prev && <a href={prev.href}>})
      // must NOT be defaulted to {} because {} is truthy — the conditional would always render.
      // When the prop is undefined (omitted by JSON.stringify during hydration), it must stay falsy.
      const source = `
        'use client'

        interface NavLink {
          href: string
          title: string
        }
        interface Props {
          prev?: NavLink
          next?: NavLink
        }

        export function PageNav({ prev, next }: Props) {
          return (
            <div>
              {prev && <a href={prev.href}>{prev.title}</a>}
              {next && <a href={next.href}>{next.title}</a>}
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'PageNav.tsx', { adapter })
      const errors = result.errors.filter(e => e.severity === 'error')

      expect(errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Props used as conditional guards should NOT get ?? {} default
      expect(content).toContain('const prev = props.prev\n')
      expect(content).toContain('const next = props.next\n')
      expect(content).not.toContain('props.prev ?? {}')
      expect(content).not.toContain('props.next ?? {}')
    })

    test('defers dynamic text evaluation inside conditional branches', () => {
      // Regression: when a dynamic text expression (e.g. prev.title) is only inside
      // a conditional branch, expression evaluation must happen after the element
      // existence check. Otherwise prev.title throws TypeError when prev is undefined.
      const source = `
        'use client'

        interface NavLink {
          href: string
          title: string
        }
        interface Props {
          prev?: NavLink
        }

        export function NavButton({ prev }: Props) {
          return (
            <div>
              {prev && <a href={prev.href}><span>{prev.title}</span></a>}
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'NavButton.tsx', { adapter })
      const errors = result.errors.filter(e => e.severity === 'error')

      expect(errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // The expression should be inlined inside the element check, not evaluated before it.
      // Pattern: if (__el_XX) __el_XX.nodeValue = String(prev.title)
      // NOT:     const __val = prev.title  (which would throw when prev is undefined)
      expect(content).toMatch(/if \(__el_\w+\) __el_\w+\.nodeValue = String\(prev\.title\)/)
      expect(content).not.toMatch(/const __val = prev\.title/)
    })

    test('still defaults props with property access to {} when not used as conditional guard', () => {
      // Ensure the ?? {} default is preserved for destructured props that have
      // property access but are NOT used as conditional guards.
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        interface Config { theme: string }
        interface Props {
          config: Config
        }

        export function ThemedBox({ config }: Props) {
          const [open, setOpen] = createSignal(false)
          return (
            <div>
              <button onClick={() => setOpen(!open())}>toggle</button>
              {open() && <span>{config.theme}</span>}
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'ThemedBox.tsx', { adapter })
      const errors = result.errors.filter(e => e.severity === 'error')

      expect(errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // config is accessed with dot notation but NOT used as a conditional guard
      // (the guard is open()), so it should still get ?? {} to prevent TypeError.
      expect(content).toContain('props.config ?? {}')
    })
  })

  describe('import optimization', () => {
    test('component with event handler imports only required functions', () => {
      const source = `
        'use client'

        export function Button() {
          return <button onClick={() => console.log('clicked')}>Click</button>
        }
      `

      const result = compileJSXSync(source, 'Button.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should import only required functions
      expect(clientJs?.content).toContain('$(__scope')  // shorthand finder
      expect(clientJs?.content).toContain('hydrate')
      // Should NOT import unused functions
      expect(clientJs?.content).not.toContain('createSignal')
      expect(clientJs?.content).not.toContain('createMemo')
      expect(clientJs?.content).not.toContain('createEffect')
      expect(clientJs?.content).not.toContain('onCleanup')
      expect(clientJs?.content).not.toContain('onMount')
    })

    test('component with signal imports createSignal and createEffect', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div>{count()}</div>
        }
      `

      const result = compileJSXSync(source, 'Counter.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should import createSignal and createEffect (for reactive updates)
      expect(clientJs?.content).toContain('createSignal')
      expect(clientJs?.content).toContain('createEffect')
      // Should NOT import unused functions
      expect(clientJs?.content).not.toContain('createMemo')
      expect(clientJs?.content).not.toContain('onCleanup')
      expect(clientJs?.content).not.toContain('onMount')
    })

    test('component with memo imports createMemo', () => {
      const source = `
        'use client'
        import { createSignal, createMemo } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          const doubled = createMemo(() => count() * 2)
          return <div>{doubled()}</div>
        }
      `

      const result = compileJSXSync(source, 'Counter.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should import createMemo
      expect(clientJs?.content).toContain('createMemo')
    })

    test('user-defined imports from @barefootjs/dom are preserved', () => {
      const source = `
        'use client'
        import { createSignal, createPortal } from '@barefootjs/dom'

        export function Modal() {
          const [open, setOpen] = createSignal(false)
          return <div onClick={() => setOpen(true)}>{open() && 'Open'}</div>
        }
      `

      const result = compileJSXSync(source, 'Modal.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // User-defined import should be preserved
      expect(clientJs?.content).toContain('createPortal')
    })

    test('imports are sorted alphabetically', () => {
      const source = `
        'use client'
        import { createSignal, createMemo, onMount } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          const doubled = createMemo(() => count() * 2)
          onMount(() => console.log('mounted'))
          return <div>{doubled()}</div>
        }
      `

      const result = compileJSXSync(source, 'Counter.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // Extract import line
      const importMatch = clientJs?.content.match(/import \{ ([^}]+) \} from '@barefootjs\/dom'/)
      expect(importMatch).not.toBeNull()

      const imports = importMatch![1].split(', ')
      const sortedImports = [...imports].sort()
      expect(imports).toEqual(sortedImports)
    })
  })

  describe('batch element refs', () => {
    test('emits destructured batch call for 2+ regular slots', () => {
      const source = `
        'use client'

        export function Form() {
          return (
            <form>
              <input onClick={() => {}} />
              <button onClick={() => {}}>Submit</button>
              <span onClick={() => {}}>Help</span>
            </form>
          )
        }
      `
      const result = compileJSXSync(source, 'Form.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Should emit batch pattern: const [_s0, _s1, _s2] = $(__scope, ...)
      expect(content).toMatch(/const \[_s\d+, _s\d+/)
      expect(content).toMatch(/\$\(__scope, 's\d+', 's\d+'/)
    })

    test('emits destructured call for 1 slot', () => {
      const source = `
        'use client'

        export function Button() {
          return <button onClick={() => console.log('hi')}>Click</button>
        }
      `
      const result = compileJSXSync(source, 'Button.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Single slot also uses destructured form: const [_s0] = $(__scope, 's0')
      expect(content).toMatch(/const \[_s\d+\] = \$\(__scope, 's\d+'\)/)
    })
  })

  describe('transparent fragment (Context Provider pattern)', () => {
    test('detects <>{children}</> as transparent', () => {
      const source = `
        'use client'

        export function DialogRoot({ children }) {
          return <>{children}</>
        }
      `

      const ctx = analyzeComponent(source, 'DialogRoot.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir!.type).toBe('fragment')
      if (ir!.type === 'fragment') {
        expect(ir!.transparent).toBe(true)
      }
    })

    test('detects <>{props.children}</> as transparent', () => {
      const source = `
        'use client'

        export function DialogRoot(props) {
          return <>{props.children}</>
        }
      `

      const ctx = analyzeComponent(source, 'DialogRoot.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir!.type).toBe('fragment')
      if (ir!.type === 'fragment') {
        expect(ir!.transparent).toBe(true)
      }
    })

    test('detects <>{p.children}</> with custom props name as transparent', () => {
      const source = `
        'use client'

        export function DialogRoot(p) {
          return <>{p.children}</>
        }
      `

      const ctx = analyzeComponent(source, 'DialogRoot.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir!.type).toBe('fragment')
      if (ir!.type === 'fragment') {
        expect(ir!.transparent).toBe(true)
      }
    })

    test('does NOT mark fragment with multiple children as transparent', () => {
      const source = `
        'use client'

        export function Wrapper({ children }) {
          return (
            <>
              <div>Header</div>
              {children}
            </>
          )
        }
      `

      const ctx = analyzeComponent(source, 'Wrapper.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir!.type).toBe('fragment')
      if (ir!.type === 'fragment') {
        expect(ir!.transparent).toBeFalsy()
        // Non-transparent fragment uses comment-based scope marker
        expect(ir!.needsScopeComment).toBe(true)
        // Element children should NOT have needsScope (scope is via comment)
        const divChild = ir!.children.find(c => c.type === 'element')
        expect(divChild).toBeDefined()
        if (divChild && divChild.type === 'element') {
          expect(divChild.needsScope).toBe(false)
        }
      }
    })

    test('does NOT mark fragment with non-children expression as transparent', () => {
      const source = `
        'use client'

        export function Component({ value }) {
          return <>{value}</>
        }
      `

      const ctx = analyzeComponent(source, 'Component.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir!.type).toBe('fragment')
      if (ir!.type === 'fragment') {
        expect(ir!.transparent).toBeFalsy()
      }
    })
  })

  describe('conditional JSX returns (if-statement)', () => {
    test('collects event handlers from both branches of conditional return', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Toggle(props: { asChild?: boolean }) {
          const [open, setOpen] = createSignal(false)

          if (props.asChild) {
            return <span onClick={() => setOpen(!open())}>child</span>
          }

          return <button onClick={() => setOpen(!open())}>toggle</button>
        }
      `

      const result = compileJSXSync(source, 'Toggle.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs?.content).toContain('initToggle')
      // Both branches should have click handlers collected
      expect(clientJs?.content).toContain('onclick')
    })

    test('collects reactive attributes from conditional return branches', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Disclosure(props: { asChild?: boolean }) {
          const [open, setOpen] = createSignal(false)

          if (props.asChild) {
            return <div aria-expanded={open()} onClick={() => setOpen(!open())}>child</div>
          }

          return <button aria-expanded={open()} onClick={() => setOpen(!open())}>toggle</button>
        }
      `

      const result = compileJSXSync(source, 'Disclosure.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Reactive attribute should generate createEffect for aria-expanded
      expect(clientJs?.content).toContain('createEffect')
      expect(clientJs?.content).toContain('aria-expanded')
    })

    test('collects child component inits from conditional return branches', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Wrapper(props: { variant?: string }) {
          const [active, setActive] = createSignal(false)

          if (props.variant === 'fancy') {
            return <div><Child onToggle={() => setActive(!active())} /></div>
          }

          return <div><Child onToggle={() => setActive(!active())} /></div>
        }
      `

      const result = compileJSXSync(source, 'Wrapper.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Child component initialization should be collected
      expect(clientJs?.content).toContain('initChild')
    })
  })

  describe('spread props in child component', () => {
    test('does not generate invalid get ...() syntax for spread props', () => {
      const source = `
        'use client'

        export function Button({ className = '', asChild = false, children, ...props }: any) {
          if (asChild) {
            return <Slot className={className} {...props}>{children}</Slot>
          }
          return <button className={className} {...props}>{children}</button>
        }
      `

      const result = compileJSXSync(source, 'Button.tsx', { adapter })

      const clientJs = result.files.find(f => f.type === 'clientJs')
      if (clientJs) {
        // Spread props must not produce invalid JS like "get ...() { ... }"
        expect(clientJs.content).not.toContain('get ...()')
        expect(clientJs.content).not.toContain('...: ')
      }
    })

    test('preserves named props alongside spread props', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Wrapper() {
          const [active, setActive] = createSignal(false)

          return (
            <div>
              <Child className="test" onClick={() => setActive(!active())} />
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'Wrapper.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Named props should still be collected
      expect(clientJs?.content).toContain('initChild')
      expect(clientJs?.content).toContain('onClick')
    })
  })

  describe('Context.Provider JSX', () => {
    test('<X.Provider value={...}> becomes IRProvider with contextName, valueProp, and children', () => {
      // <MenuContext.Provider> should produce an IRProvider node that:
      // - extracts "MenuContext" from "MenuContext.Provider"
      // - captures the value prop expression
      // - preserves child elements
      const source = `
        'use client'
        import { createContext, createSignal, provideContext } from '@barefootjs/dom'

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
          value: '{ open, setOpen }',
          dynamic: true,
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
        import { createContext, createSignal, provideContext } from '@barefootjs/dom'

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
        valueProp: { name: 'value', value: '{ active, setActive }' },
        children: [
          { type: 'element', tag: 'div', attrs: [{ name: 'className', value: 'tabs-header' }] },
          { type: 'element', tag: 'div', attrs: [{ name: 'className', value: 'tabs-body' }] },
        ],
      })
    })

    test('compiler generates provideContext() before initChild() in client JS', () => {
      // The generated init function must:
      // 1. Import provideContext from @barefootjs/dom
      // 2. Call provideContext(ContextName, valueExpr) BEFORE initChild()
      //    so child components can read the context during their initialization
      const adapter = new TestAdapter()
      const source = `
        'use client'
        import { createContext, createSignal, provideContext } from '@barefootjs/dom'

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

      const result = compileJSXSync(source, 'DropdownMenu.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')!
      expect(clientJs).toBeDefined()

      // Verify the init function body contains the expected sequence:
      //   provideContext(MenuContext, { open, setOpen })   ← context setup
      //   initChild('DropdownTrigger', ...)                ← child init (after)
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
        import { createContext, createSignal, provideContext } from '@barefootjs/dom'

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
        attrs: [{ name: 'style', value: 'display:contents' }],
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
        import { createContext, createSignal, provideContext } from '@barefootjs/dom'

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
        import { createContext, createSignal, provideContext } from '@barefootjs/dom'

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

      const result = compileJSXSync(source, 'Dialog.tsx', { adapter })
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
        import { createContext, createSignal, provideContext } from '@barefootjs/dom'

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

      const result = compileJSXSync(source, 'Root.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')!
      expect(clientJs).toBeDefined()
      expect(clientJs.content).toContain('provideContext(Ctx')
      expect(clientJs.content).not.toContain('newValue: string')
    })

    test('named function references in provider value are emitted in client JS (#342)', () => {
      const source = `
        'use client'
        import { createContext, createSignal, provideContext } from '@barefootjs/dom'

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

      const result = compileJSXSync(source, 'Tabs.tsx', { adapter })
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
        import { createContext, createSignal, provideContext } from '@barefootjs/dom'

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
          value: '{ val, setVal }',
          dynamic: true,
        },
        children: [],
      })
    })
  })

  describe('component as JSX root (#281)', () => {
    test('component with children as root produces IRComponent (no wrapper div)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function MenuDemo() {
          const [open, setOpen] = createSignal(false)
          return (
            <DropdownMenu open={open()} onOpenChange={setOpen}>
              <DropdownMenuTrigger>
                <span>KK</span>
              </DropdownMenuTrigger>
            </DropdownMenu>
          )
        }
      `

      const ctx = analyzeComponent(source, 'MenuDemo.tsx')
      const ir = jsxToIR(ctx)

      // Root should be the component itself; the adapter handles scope
      // placement via isRootOfClientComponent / __instanceId
      expect(ir).not.toBeNull()
      expect(ir!.type).toBe('component')
      if (ir!.type === 'component') {
        expect(ir!.name).toBe('DropdownMenu')
      }
    })

    test('self-closing component as root produces IRComponent (no wrapper div)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function IconButton() {
          const [active, setActive] = createSignal(false)
          return <ChevronIcon active={active()} />
        }
      `

      const ctx = analyzeComponent(source, 'IconButton.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir!.type).toBe('component')
      if (ir!.type === 'component') {
        expect(ir!.name).toBe('ChevronIcon')
      }
    })

    test('fragment root with component child keeps component as-is', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Layout() {
          const [theme, setTheme] = createSignal('light')
          return (
            <>
              <header>Header</header>
              <ThemeProvider theme={theme()} />
            </>
          )
        }
      `

      const ctx = analyzeComponent(source, 'Layout.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir!.type).toBe('fragment')
      if (ir!.type === 'fragment') {
        // Fragment uses comment-based scope marker
        expect(ir!.needsScopeComment).toBe(true)

        // Element children do NOT get needsScope (scope is via comment)
        const header = ir!.children.find(c => c.type === 'element' && c.tag === 'header')
        expect(header).toBeDefined()
        if (header?.type === 'element') {
          expect(header.needsScope).toBe(false)
        }

        // Component child stays as IRComponent (no wrapper div)
        const provider = ir!.children.find(c => c.type === 'component')
        expect(provider).toBeDefined()
        if (provider?.type === 'component') {
          expect(provider.name).toBe('ThemeProvider')
        }
      }
    })

    test('non-root component is NOT affected', () => {
      const source = `
        'use client'

        export function App() {
          return (
            <div>
              <ChildComponent />
            </div>
          )
        }
      `

      const ctx = analyzeComponent(source, 'App.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir!.type).toBe('element')
      if (ir!.type === 'element') {
        expect(ir!.tag).toBe('div')
        expect(ir!.needsScope).toBe(true)
        // Child should be a component directly
        expect(ir!.children).toHaveLength(1)
        expect(ir!.children[0].type).toBe('component')
      }
    })

    test('isRoot does not leak into component slot children', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Demo() {
          const [open, setOpen] = createSignal(false)
          return (
            <Menu>
              <button>Toggle</button>
            </Menu>
          )
        }
      `

      const ctx = analyzeComponent(source, 'Demo.tsx')
      const ir = jsxToIR(ctx)

      // Root is the component itself
      expect(ir).not.toBeNull()
      expect(ir!.type).toBe('component')
      if (ir!.type === 'component') {
        expect(ir!.name).toBe('Menu')
        // The button inside the component's slot children must NOT have needsScope
        const button = ir!.children.find(c => c.type === 'element' && c.tag === 'button')
        expect(button).toBeDefined()
        if (button?.type === 'element') {
          expect(button.needsScope).toBe(false)
        }
      }
    })
  })

  describe('sort().map() / toSorted().map()', () => {
    test('sort((a, b) => a.price - b.price).map() produces sortComparator (asc)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function ProductList() {
          const [products, setProducts] = createSignal<any[]>([])
          return (
            <ul>
              {products().sort((a, b) => a.price - b.price).map(p => (
                <li>{p.name}</li>
              ))}
            </ul>
          )
        }
      `

      const ctx = analyzeComponent(source, 'ProductList.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      const ul = ir!
      expect(ul.type).toBe('element')
      if (ul.type === 'element') {
        const loop = ul.children.find(c => c.type === 'loop')
        expect(loop).toBeDefined()
        if (loop?.type === 'loop') {
          expect(loop.sortComparator).toBeDefined()
          expect(loop.sortComparator!.field).toBe('price')
          expect(loop.sortComparator!.direction).toBe('asc')
          expect(loop.sortComparator!.method).toBe('sort')
          expect(loop.sortComparator!.paramA).toBe('a')
          expect(loop.sortComparator!.paramB).toBe('b')
          expect(loop.array).toBe('products()')
        }
      }
    })

    test('toSorted((a, b) => b.price - a.price).map() produces sortComparator (desc)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function ProductList() {
          const [products, setProducts] = createSignal<any[]>([])
          return (
            <ul>
              {products().toSorted((a, b) => b.price - a.price).map(p => (
                <li>{p.name}</li>
              ))}
            </ul>
          )
        }
      `

      const ctx = analyzeComponent(source, 'ProductList.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      const ul = ir!
      if (ul.type === 'element') {
        const loop = ul.children.find(c => c.type === 'loop')
        expect(loop).toBeDefined()
        if (loop?.type === 'loop') {
          expect(loop.sortComparator).toBeDefined()
          expect(loop.sortComparator!.field).toBe('price')
          expect(loop.sortComparator!.direction).toBe('desc')
          expect(loop.sortComparator!.method).toBe('toSorted')
        }
      }
    })

    test('filter().sort().map() produces both filterPredicate and sortComparator', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function TodoList() {
          const [todos, setTodos] = createSignal<any[]>([])
          return (
            <ul>
              {todos().filter(t => !t.done).sort((a, b) => a.priority - b.priority).map(t => (
                <li>{t.text}</li>
              ))}
            </ul>
          )
        }
      `

      const ctx = analyzeComponent(source, 'TodoList.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      if (ir!.type === 'element') {
        const loop = ir!.children.find(c => c.type === 'loop')
        expect(loop).toBeDefined()
        if (loop?.type === 'loop') {
          expect(loop.filterPredicate).toBeDefined()
          expect(loop.filterPredicate!.param).toBe('t')
          expect(loop.sortComparator).toBeDefined()
          expect(loop.sortComparator!.field).toBe('priority')
          expect(loop.sortComparator!.direction).toBe('asc')
          expect(loop.chainOrder).toBe('filter-sort')
          expect(loop.array).toBe('todos()')
        }
      }
    })

    test('sort().filter().map() produces both with correct chainOrder', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function TodoList() {
          const [todos, setTodos] = createSignal<any[]>([])
          return (
            <ul>
              {todos().sort((a, b) => a.priority - b.priority).filter(t => !t.done).map(t => (
                <li>{t.text}</li>
              ))}
            </ul>
          )
        }
      `

      const ctx = analyzeComponent(source, 'TodoList.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      if (ir!.type === 'element') {
        const loop = ir!.children.find(c => c.type === 'loop')
        expect(loop).toBeDefined()
        if (loop?.type === 'loop') {
          expect(loop.filterPredicate).toBeDefined()
          expect(loop.sortComparator).toBeDefined()
          expect(loop.chainOrder).toBe('sort-filter')
          expect(loop.array).toBe('todos()')
        }
      }
    })

    test('complex sort comparator with @client keeps sort in array', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function TodoList() {
          const [items, setItems] = createSignal<any[]>([])
          return (
            <ul>
              {/* @client */ items().sort((a, b) => a.name.localeCompare(b.name)).map(t => (
                <li>{t.name}</li>
              ))}
            </ul>
          )
        }
      `

      const ctx = analyzeComponent(source, 'TodoList.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      if (ir!.type === 'element') {
        const loop = ir!.children.find(c => c.type === 'loop')
        expect(loop).toBeDefined()
        if (loop?.type === 'loop') {
          // @client: sort kept in array string, no sortComparator extracted
          expect(loop.sortComparator).toBeUndefined()
          expect(loop.clientOnly).toBe(true)
          expect(loop.array).toContain('sort')
        }
      }
    })
  })

  describe('mount template local constant inlining (#343)', () => {
    test('props-derived constant is inlined in mount template', () => {
      // Local constants computed from props should be inlined in the hydrate()
      // template callback, which executes at module scope where locals are unavailable
      const source = `
        'use client'

        export function MyItem(props: { disabled?: boolean, onClick?: () => void }) {
          const isDisabled = props.disabled ?? false
          return <button disabled={isDisabled || undefined} onClick={props.onClick}>Click</button>
        }
      `

      const result = compileJSXSync(source, 'MyItem.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Template should inline the constant value, not reference the local name
      expect(content).toContain('(props) => `')
      expect(content).not.toMatch(/\bisDisabled\b.*\?>/)
      // The inlined expression should reference props directly
      expect(content).toMatch(/props\.disabled/)
    })

    test('template literal constant is inlined in mount template', () => {
      const source = `
        'use client'

        export function Badge(props: { variant?: string, onClick?: () => void }) {
          const classes = \`badge \${props.variant ?? 'default'}\`
          return <span className={classes} onClick={props.onClick}>Label</span>
        }
      `

      const result = compileJSXSync(source, 'Badge.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Template should inline the template literal, not reference 'classes'
      expect(content).toContain('(props) => `')
      expect(content).not.toMatch(/\bclasses\b/)
    })

    test('signal-dependent constant: no CSR fallback for top-level-only component', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Display() {
          const [count, setCount] = createSignal(0)
          const label = count()
          return <div onClick={() => setCount(n => n + 1)}>{label}</div>
        }
      `

      const result = compileJSXSync(source, 'Display.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Top-level-only: no CSR fallback template (saves bytes)
      expect(content).not.toContain('template:')
      expect(content).toContain("hydrate('Display', { init: initDisplay })")
    })

    test('signal-dependent constant gets CSR fallback when used as child', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Display() {
          const [count, setCount] = createSignal(0)
          const label = count()
          return <div onClick={() => setCount(n => n + 1)}>{label}</div>
        }

        export function Wrapper() {
          const [show, setShow] = createSignal(true)
          return (
            <div>
              {show() && <Display />}
              <button onClick={() => setShow(v => !v)}>toggle</button>
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'Display.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Display IS used as a child by Wrapper → gets CSR fallback with template
      expect(content).toMatch(/hydrate\('Display',.*template:/)
    })

    test('issue #343 full reproduction: local constant in disabled attribute', () => {
      // Exact reproduction from issue #343
      const source = `
        'use client'

        export function MyItem(props: { disabled?: boolean, onClick?: () => void }) {
          const isDisabled = props.disabled ?? false
          return <button disabled={isDisabled || undefined} onClick={props.onClick}>Click</button>
        }
      `

      const result = compileJSXSync(source, 'MyItem.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Must have a template (the component is simple enough)
      expect(content).toContain('(props) => `')
      // Template must NOT reference the local variable name 'isDisabled'
      // It should instead contain the inlined expression with props access
      const templateMatch = content.match(/\(props\) => `([^`]*)`/)
      expect(templateMatch).not.toBeNull()
      const template = templateMatch![1]
      expect(template).not.toContain('isDisabled')
      expect(template).toContain('props.disabled')
    })
  })

  describe('multi-level variable inlining (#366)', () => {
    test('two-level chain: props.variant → variant → outlineShadow', () => {
      const source = `
        'use client'

        export function MyButton(props: { variant?: string, onClick?: () => void, children?: any }) {
          const variant = props.variant ?? 'default'
          const outlineShadow = variant === 'outline' ? 'shadow-sm' : ''
          return <button className={outlineShadow} onClick={props.onClick}>{props.children}</button>
        }
      `

      const result = compileJSXSync(source, 'MyButton.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Must not contain corrupted props.(props. syntax
      expect(content).not.toContain('props.(props.')
      // Local constants should be fully resolved
      const templateMatch = content.match(/\(props\) => `([^`]*)`/)
      expect(templateMatch).not.toBeNull()
      const template = templateMatch![1]
      expect(template).not.toContain('outlineShadow')
      // props.variant should appear as valid syntax
      expect(template).toContain('props.variant')
    })

    test('three-level chain: props.kind → kind → color → classes', () => {
      const source = `
        'use client'

        export function Tag(props: { kind?: string, onClick?: () => void }) {
          const kind = props.kind ?? 'info'
          const color = kind === 'error' ? 'red' : 'blue'
          const classes = 'tag-' + color
          return <span className={classes} onClick={props.onClick}>Tag</span>
        }
      `

      const result = compileJSXSync(source, 'Tag.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      expect(content).not.toContain('props.(props.')
      const templateMatch = content.match(/\(props\) => `([^`]*)`/)
      expect(templateMatch).not.toBeNull()
      const template = templateMatch![1]
      expect(template).not.toContain('classes')
      expect(template).toContain('props.kind')
    })

    test('template literal with multi-level chain', () => {
      const source = `
        'use client'

        export function Card(props: { variant?: string, onClick?: () => void }) {
          const variant = props.variant ?? 'default'
          const classes = \`card card-\${variant}\`
          return <div className={classes} onClick={props.onClick}>Content</div>
        }
      `

      const result = compileJSXSync(source, 'Card.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Must not contain corrupted props.(props. syntax
      expect(content).not.toContain('props.(props.')
      // The mount call should contain props.variant properly resolved
      expect(content).toContain('props.variant')
      // Local constant 'classes' should not appear in mount template
      expect(content).not.toMatch(/mount\([^)]*\bclasses\b/)
    })

    test('constant name matching property suffix does not corrupt props access', () => {
      const source = `
        'use client'

        export function Widget(props: { size?: string, label?: string, onClick?: () => void }) {
          const size = props.size ?? 'md'
          return <div data-size={size} onClick={props.onClick}>{props.label}</div>
        }
      `

      const result = compileJSXSync(source, 'Widget.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      expect(content).not.toContain('props.(props.')
      const templateMatch = content.match(/\(props\) => `([^`]*)`/)
      expect(templateMatch).not.toBeNull()
      const template = templateMatch![1]
      // props.size should be valid and not corrupted
      expect(template).toContain('props.size')
      // Should not have double-wrapped props references
      expect(template).not.toMatch(/props\.\(props\./)
    })
  })

  describe('hyphenated prop names in child component (#346)', () => {
    test('quotes hyphenated prop names in initChild', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        import { Toggle } from './Toggle'

        export function Toolbar() {
          const [bold, setBold] = createSignal(false)
          return (
            <div>
              <Toggle aria-label="Toggle bold" pressed={bold()} />
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'Toolbar.tsx', { adapter })
      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('"aria-label"')
      expect(clientJs!.content).not.toMatch(/[^"]aria-label[^"]/)
    })

    test('quotes data-* prop names in initChild', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        import { Item } from './Item'

        export function List() {
          const [active, setActive] = createSignal(false)
          return (
            <div>
              <Item data-testid="item-1" data-state="closed" active={active()} />
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'List.tsx', { adapter })
      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('"data-testid"')
      expect(clientJs!.content).toContain('"data-state"')
    })

    test('does not quote camelCase prop names', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        import { Toggle } from './Toggle'

        export function Toolbar() {
          const [bold, setBold] = createSignal(false)
          return (
            <div>
              <Toggle pressed={bold()} label="Bold" />
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'Toolbar.tsx', { adapter })
      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // camelCase props should NOT be quoted
      expect(clientJs!.content).toMatch(/\bpressed\b/)
      expect(clientJs!.content).toMatch(/\blabel\b/)
      expect(clientJs!.content).not.toContain('"pressed"')
      expect(clientJs!.content).not.toContain('"label"')
    })
  })

  describe('child components inside .map() (#344)', () => {
    test('static array: nested component inside element wrapper generates initChild', () => {
      const source = `
        'use client'

        export function RadioGroup() {
          const items = [{ value: 'a' }, { value: 'b' }]
          return (
            <div>
              {items.map(item => (
                <div><RadioGroupItem value={item.value} /></div>
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'RadioGroup.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain("initChild('RadioGroupItem'")
    })

    test('static array: direct component generates initChild with JSX props', () => {
      const source = `
        'use client'

        export function RadioGroup() {
          const items = [{ value: 'a' }, { value: 'b' }]
          return (
            <div>
              {items.map(item => (
                <RadioGroupItem value={item.value} />
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'RadioGroup.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain("initChild('RadioGroupItem'")
      // Props should reference item.value, not pass raw array item
      expect(clientJs!.content).toContain('item.value')
      expect(clientJs!.content).not.toContain('__childProps')
    })

    test('static array: literal JSX props preserved on direct child component', () => {
      const source = `
        'use client'

        export function List() {
          const items = [{ name: 'a' }, { name: 'b' }]
          return (
            <div>
              {items.map(item => (
                <ListItem label={item.name} className="pl-2 basis-1/3" />
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'List.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('className: "pl-2 basis-1/3"')
      expect(clientJs!.content).toContain('item.name')
    })

    test('static array: event handler props preserved on direct child component', () => {
      const source = `
        'use client'

        export function List() {
          const items = [{ id: '1' }, { id: '2' }]
          const handleClick = (id: string) => console.log(id)
          return (
            <div>
              {items.map(item => (
                <ListItem onClick={() => handleClick(item.id)} />
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'List.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('onClick:')
    })

    test('static array: index parameter renamed in direct child component props (#479)', () => {
      const source = `
        'use client'

        export function List() {
          const items = [{ id: '1' }, { id: '2' }]
          return (
            <div>
              {items.map((item, index) => (
                <ListItem index={index} value={item.id} />
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'List.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // The forEach callback should use the user-defined index parameter name
      expect(clientJs!.content).toContain('(childScope, index)')
      expect(clientJs!.content).not.toContain('(childScope, __idx)')
    })

    test('static array: index parameter renamed in nested component props (#479)', () => {
      const source = `
        'use client'

        export function List() {
          const items = [{ id: '1' }, { id: '2' }]
          return (
            <div>
              {items.map((item, idx) => (
                <div><Nested position={idx} value={item.id} /></div>
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'List.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // The forEach callback should use the user-defined index parameter name
      expect(clientJs!.content).toContain(`(item, idx)`)
      expect(clientJs!.content).not.toContain(`(item, __idx)`)
    })

    test('static array: nested component with index in callback and signal access (#480)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

        export function SelectionDemo() {
          const [selected, setSelected] = createSignal(items.map(() => false))

          const toggleRow = (index) => {
            setSelected(prev => prev.map((v, i) => i === index ? !v : v))
          }

          return (
            <table>
              <tbody>
                {items.map((item, index) => (
                  <tr>
                    <td>
                      <Checkbox
                        checked={selected()[index]}
                        onCheckedChange={() => toggleRow(index)}
                        aria-label={\`Select \${item.id}\`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      `
      const result = compileJSXSync(source, 'SelectionDemo.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // The forEach callback should use the user-defined 'index' parameter
      expect(clientJs!.content).toContain('(item, index)')
      expect(clientJs!.content).not.toContain('__idx')
      // Props should reference 'index' correctly in callback and signal access
      expect(clientJs!.content).toContain('selected()[index]')
      expect(clientJs!.content).toContain('toggleRow(index)')
    })

    test('dynamic signal array: component generates reconcileElements with createComponent', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function RadioGroup() {
          const [items, setItems] = createSignal([{ value: 'a' }, { value: 'b' }])
          return (
            <div>
              {items().map(item => (
                <RadioGroupItem value={item.value} />
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'RadioGroup.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('reconcileElements')
      expect(clientJs!.content).toContain("createComponent('RadioGroupItem'")
    })

    test('static array: SSR template includes __bfChild for "use client" parent (#483)', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'

        export function CardList() {
          const items = [{ title: 'a' }, { title: 'b' }]
          return (
            <div>
              {items.map(item => (
                <Card title={item.title} className="p-4" />
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'CardList.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()
      expect(template!.content).toContain('__bfChild={true}')
    })

    test('static array: SSR template includes __bfChild for stateless parent with client interactivity (#483)', () => {
      // Parent has no "use client" but has static array with child components,
      // which triggers needsClientInit (client JS with initChild calls).
      // Without __bfChild, child components hydrate with empty props before
      // the parent's initChild can pass correct props (including className).
      const honoAdapter = new HonoAdapter()
      const source = `
        export function StaticList() {
          const items = [{ label: 'x' }, { label: 'y' }]
          return (
            <ul>
              {items.map(item => (
                <ListItem label={item.label} className="text-sm" />
              ))}
            </ul>
          )
        }
      `
      const result = compileJSXSync(source, 'StaticList.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()
      expect(template!.content).toContain('__bfChild={true}')

      // Should also generate client JS with initChild
      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain("initChild('ListItem'")
    })

    test('no duplicate variable declaration when .map() slot ID matches component slot ID (#360)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Parent() {
          const [items, setItems] = createSignal([{ name: 'a' }, { name: 'b' }])
          return (
            <Wrapper>
              {items().map(item => <span>{item.name}</span>)}
            </Wrapper>
          )
        }
      `
      const result = compileJSXSync(source, 'Parent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Each slot variable should be declared at most once
      const batchDecls = content.match(/const \[([^\]]+)\]/g) || []
      const allVars = batchDecls.flatMap((d: string) => {
        const inner = d.match(/\[([^\]]+)\]/)
        return inner ? inner[1].split(',').map((v: string) => v.trim()) : []
      })
      const uniqueVars = new Set(allVars)
      expect(allVars.length).toBe(uniqueVars.size)

      // Component slot ref ($c) and reconcileTemplates should both be present
      expect(content).toContain('$c(__scope')
      expect(content).toContain('reconcileTemplates')
    })

    test('dynamic signal array: component with component children emits nested createComponent (#481)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function DataTable() {
          const [payments, setPayments] = createSignal([
            { id: 'PAY-001', amount: 100 },
            { id: 'PAY-002', amount: 200 },
          ])
          return (
            <div>
              {payments().map(payment => (
                <TableRow>
                  <TableCell>{payment.id}</TableCell>
                  <TableCell>{payment.amount}</TableCell>
                </TableRow>
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'DataTable.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Should use reconcileElements with createComponent
      expect(content).toContain('reconcileElements')
      expect(content).toContain("createComponent('TableRow'")

      // Children should be emitted as nested createComponent calls
      expect(content).toContain("createComponent('TableCell'")
      expect(content).toContain('get children()')
      expect(content).toContain('payment.id')
      expect(content).toContain('payment.amount')
    })

    test('dynamic signal array: component with mixed children (text + components)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function List() {
          const [items, setItems] = createSignal([{ name: 'a' }, { name: 'b' }])
          return (
            <div>
              {items().map(item => (
                <Card>
                  <CardHeader>{item.name}</CardHeader>
                </Card>
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'List.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      expect(content).toContain("createComponent('Card'")
      expect(content).toContain("createComponent('CardHeader'")
      expect(content).toContain('get children()')
      expect(content).toContain('item.name')
    })

    test('dynamic signal array: component without children does not emit children getter', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function RadioGroup() {
          const [items, setItems] = createSignal([{ value: 'a' }, { value: 'b' }])
          return (
            <div>
              {items().map(item => (
                <RadioGroupItem value={item.value} />
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'RadioGroup.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      expect(content).toContain("createComponent('RadioGroupItem'")
      // No children getter should be emitted for childless component
      expect(content).not.toContain('get children()')
    })

    test('dynamic signal array: deeply nested components (A > B > C)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function DataTable() {
          const [rows, setRows] = createSignal([{ id: '1', value: 'test' }])
          return (
            <div>
              {rows().map(row => (
                <TableRow>
                  <TableCell>
                    <Badge>{row.value}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'DataTable.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // All three nested components should appear
      expect(content).toContain("createComponent('TableRow'")
      expect(content).toContain("createComponent('TableCell'")
      expect(content).toContain("createComponent('Badge'")
      expect(content).toContain('row.value')

      // All nested component names should be imported
      expect(content).toContain('@bf-child:TableRow')
      expect(content).toContain('@bf-child:TableCell')
      expect(content).toContain('@bf-child:Badge')
    })

    test('static array: onClick on plain element generates event delegation (#537)', () => {
      const source = `
        'use client'

        export function List() {
          const items = [{ id: '1', label: 'A' }, { id: '2', label: 'B' }]
          const handleClick = (id: string) => console.log(id)
          return (
            <ul>
              {items.map(item => (
                <li><button onClick={() => handleClick(item.id)}>{item.label}</button></li>
              ))}
            </ul>
          )
        }
      `
      const result = compileJSXSync(source, 'List.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Event delegation should be generated for the static array
      expect(content).toContain('.onclick = (e) => {')
      expect(content).toContain('target.closest')
      expect(content).toContain('Array.from(')
      expect(content).toContain('handleClick(item.id)')
    })

    test('static array: onClick on nested element uses walk-up strategy (#537)', () => {
      const source = `
        'use client'

        export function List() {
          const items = [{ value: 'x' }, { value: 'y' }]
          const setValue = (v: string) => console.log(v)
          return (
            <div>
              {items.map(item => (
                <div className="card">
                  <span>{item.value}</span>
                  <button onClick={() => setValue(item.value)}>Select</button>
                </div>
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'List.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Walk-up strategy: traverse from matched element to container's direct child
      expect(content).toContain('while (__el.parentElement')
      expect(content).toContain('.children).indexOf(__el)')
      expect(content).toContain('setValue(item.value)')
    })

    test('dynamic signal array: onClick on plain element still works (regression guard)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function DynList() {
          const [items, setItems] = createSignal([{ id: '1' }, { id: '2' }])
          const handleClick = (id: string) => console.log(id)
          return (
            <ul>
              {items().map(item => (
                <li><button onClick={() => handleClick(item.id)}>{item.id}</button></li>
              ))}
            </ul>
          )
        }
      `
      const result = compileJSXSync(source, 'DynList.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Dynamic array should use reconcileTemplates and event delegation
      expect(content).toContain('reconcileTemplates')
      expect(content).toContain('.onclick = (e) => {')
      expect(content).toContain('handleClick(item.id)')
    })
  })

  describe('TypeScript syntax guard (#349)', () => {
    // Guard test: ensures no TypeScript syntax survives in generated client JS.
    // This catches regressions like #341 where a new emit site forgot to call
    // strip-types. Types are now stripped at the AST level in Phase 1
    // via collectAllTypeRanges() + reconstructWithoutTypes() instead of regex-based stripping in Phase 2.

    test('all TypeScript syntax patterns are stripped from client JS output', () => {
      const source = `
        'use client'
        import { createSignal, createMemo, createEffect, createContext, provideContext, onCleanup } from '@barefootjs/dom'

        interface ItemType {
          id: number
          label: string
          active: boolean
        }

        type Variant = 'default' | 'outline'

        const Ctx = createContext()

        export function TypeScriptGuard(props: { items: ItemType[], variant: Variant }) {
          const [selected, setSelected] = createSignal<string | null>(null)
          const [items, setItems] = createSignal<ItemType[]>([])
          let timer: ReturnType<typeof setTimeout> | null

          const activeCount = createMemo((): number => {
            return items().filter(t => t.active).length
          })

          createEffect(() => {
            const el = document.getElementById('target') as HTMLElement | null
            if (el) {
              el.textContent = String(activeCount())
            }
          })

          const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            const id = target.dataset.id!
            setSelected(id)
          }

          const handleChange = (newValue: string, index: number) => {
            setItems(prev => prev.map((item: ItemType, i: number) =>
              i === index ? { ...item, label: newValue } : item
            ))
          }

          onCleanup(() => {
            if (timer) clearTimeout(timer)
          })

          return (
            <Ctx.Provider value={{ onSelect: (id: string) => { setSelected(id) } }}>
              <div onClick={handleClick}>
                <span>{activeCount()}</span>
                {items().filter(t => t.active).map(item => (
                  <button data-id={item.id}>{item.label}</button>
                ))}
              </div>
            </Ctx.Provider>
          )
        }
      `

      const result = compileJSXSync(source, 'TypeScriptGuard.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const js = clientJs!.content

      // --- Type annotations on parameters ---
      expect(js).not.toContain('e: MouseEvent')
      expect(js).not.toContain('newValue: string')
      expect(js).not.toContain('index: number')
      expect(js).not.toContain('item: ItemType')
      expect(js).not.toContain('i: number')
      expect(js).not.toContain('id: string')

      // --- Type assertions ---
      expect(js).not.toContain('as HTMLElement')
      expect(js).not.toContain('as HTMLElement | null')

      // --- Non-null assertions (x! but not !== or !=) ---
      expect(js).not.toMatch(/\.id!(?!=)/)

      // --- Generic type parameters ---
      expect(js).not.toContain('<string | null>')
      expect(js).not.toContain('<ItemType[]>')
      expect(js).not.toContain('<string>')

      // --- Variable type annotations ---
      expect(js).not.toMatch(/let\s+\w+\s*:\s*ReturnType/)
      expect(js).not.toContain(': ReturnType<typeof setTimeout>')

      // --- Return type annotations ---
      expect(js).not.toMatch(/\)\s*:\s*number\s*=>/)

      // --- Interface / type alias (should not appear at all) ---
      expect(js).not.toContain('interface ')
      expect(js).not.toContain('type Variant')

      // --- Sanity: core runtime calls ARE present ---
      expect(js).toContain('createSignal')
      expect(js).toContain('createMemo')
      expect(js).toContain('createEffect')
      expect(js).toContain('provideContext(Ctx')
      expect(js).toContain('onCleanup')
    })
  })

  describe('function declarations hoisted after usage (#365)', () => {
    test('function declaration used in createSignal initializer is emitted before the signal', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function ToggleGroup(props) {
          function toArray(value) {
            return Array.isArray(value) ? value : value ? [value] : []
          }
          const [selected, setSelected] = createSignal(toArray(props.defaultValue))
          return <div data-state={selected().length > 0 ? 'on' : 'off'}>{props.children}</div>
        }
      `

      const result = compileJSXSync(source, 'ToggleGroup.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')!
      expect(clientJs).toBeDefined()
      expect(clientJs.content).toContain('toArray')

      // toArray must be defined before the signal declaration
      const fnIndex = clientJs.content.indexOf('toArray')
      const signalIndex = clientJs.content.indexOf('const [selected')
      expect(signalIndex).toBeGreaterThan(-1)
      expect(fnIndex).toBeLessThan(signalIndex)
    })

    test('arrow-function constant used in createSignal initializer is emitted before the signal', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function MyComponent(props) {
          const normalize = (val) => val == null ? '' : String(val)
          const [value, setValue] = createSignal(normalize(props.defaultValue))
          return <input value={value()} />
        }
      `

      const result = compileJSXSync(source, 'MyComponent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')!
      expect(clientJs).toBeDefined()
      expect(clientJs.content).toContain('normalize')

      // normalize must be defined before the signal declaration
      const fnIndex = clientJs.content.indexOf('normalize')
      const signalIndex = clientJs.content.indexOf('const [value')
      expect(signalIndex).toBeGreaterThan(-1)
      expect(fnIndex).toBeLessThan(signalIndex)
    })

    test('object literal createSignal initializer is parenthesized in getter output', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function MyComponent() {
          const [position, setPosition] = createSignal({ x: 0, y: 0 })
          return <div>{position().x}</div>
        }
      `

      const result = compileJSXSync(source, 'MyComponent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const markedTemplate = result.files.find(f => f.type === 'markedTemplate')
      expect(markedTemplate).toBeDefined()
      expect(markedTemplate!.content).toContain('const position = () => ({ x: 0, y: 0 })')
    })
  })

  describe('module-level function scope isolation', () => {
    test('module-level helper function internals are not leaked as component constants', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        function computeError(field: { value: string }, allFields: { id: number; value: string }[]) {
          const basicError = field.value === '' ? 'Required' : ''
          const isDuplicate = allFields.some(f => f.id !== 0 && f.value === field.value)
          return isDuplicate ? 'Duplicate' : basicError
        }

        export function MyComponent() {
          const [items, setItems] = createSignal([{ id: 1, value: '' }])
          const error = computeError(items()[0], items())
          return <div>{error}</div>
        }
      `

      const result = compileJSXSync(source, 'MyComponent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // The helper function itself should be emitted (as arrow function constant)
      expect(clientJs!.content).toContain('const computeError')

      // Internal declarations should appear only once (inside the function body),
      // not duplicated at the init function's top level
      const content = clientJs!.content
      const basicErrorCount = content.split('const basicError').length - 1
      const isDuplicateCount = content.split('const isDuplicate').length - 1
      expect(basicErrorCount).toBe(1) // only inside computeError body
      expect(isDuplicateCount).toBe(1) // only inside computeError body
    })
  })

  describe('child component value/boolean prop binding', () => {
    test('compiles child component value prop using .value = (emitReactivePropBindings)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        import { Input } from './Input'

        export function MultiInputSync() {
          const [text, setText] = createSignal('')
          return (
            <div>
              <Input value={text()} onInput={(e) => setText(e.target.value)} />
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'MultiInputSync.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should use .value = for value prop, not setAttribute
      expect(clientJs!.content).toContain('.value =')
      expect(clientJs!.content).not.toContain("setAttribute('value'")
    })

    test('compiles child component disabled prop using .disabled = !! (emitReactivePropBindings)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        import { Input } from './Input'

        export function DisabledInput() {
          const [isLoading, setIsLoading] = createSignal(false)
          return (
            <div>
              <Input disabled={isLoading()} />
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'DisabledInput.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should use .disabled = !! for boolean prop, not setAttribute
      expect(clientJs!.content).toContain('.disabled = !!')
      expect(clientJs!.content).not.toContain("setAttribute('disabled'")
    })
  })

  describe('parent-owned slots (^ prefix)', () => {
    test('elements with events inside component children get ^-prefixed slotId in IR', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Parent() {
          const [count, setCount] = createSignal(0)
          return (
            <div>
              <Child>
                <button onClick={() => setCount(c => c + 1)}>Inc</button>
              </Child>
            </div>
          )
        }
      `
      const ctx = analyzeComponent(source, 'Parent.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      // Find the component node
      const div = ir as any
      expect(div.type).toBe('element')

      // Find the Child component in children
      const child = div.children.find((c: any) => c.type === 'component')
      expect(child).toBeDefined()
      expect(child.name).toBe('Child')

      // The button inside Child should have ^-prefixed slotId
      const button = child.children.find((c: any) => c.type === 'element' && c.tag === 'button')
      expect(button).toBeDefined()
      expect(button.slotId).toMatch(/^\^s\d+$/)
      expect(button.events).toHaveLength(1)
      expect(button.events[0].name).toBe('click')
    })

    test('component own slotId does NOT get ^ prefix', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Parent() {
          const [count, setCount] = createSignal(0)
          return (
            <div>
              <Child>
                <button onClick={() => setCount(c => c + 1)}>Inc</button>
              </Child>
            </div>
          )
        }
      `
      const ctx = analyzeComponent(source, 'Parent.tsx')
      const ir = jsxToIR(ctx)
      const div = ir as any
      const child = div.children.find((c: any) => c.type === 'component')

      // The component's own slotId should NOT have ^ prefix
      expect(child.slotId).toMatch(/^s\d+$/)
      expect(child.slotId).not.toContain('^')
    })

    test('generated client JS uses ^-prefixed ID in $() but clean variable name', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Parent() {
          const [count, setCount] = createSignal(0)
          return (
            <div>
              <Child>
                <button onClick={() => setCount(c => c + 1)}>Inc</button>
              </Child>
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'Parent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // Should use $(__scope, '^sN') for the lookup (raw ID with ^)
      expect(clientJs!.content).toMatch(/\$\(__scope, .*'\^s\d+'/)
      // Should use _sN (without ^) for variable name in destructured form
      expect(clientJs!.content).toMatch(/const \[.*_s\d+.*\] = \$\(__scope, .*'\^s\d+'/)
    })

    test('reactive expressions inside component children get ^-prefixed slotId', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Parent() {
          const [count, setCount] = createSignal(0)
          return (
            <div>
              <Child>
                <span>{count()}</span>
              </Child>
            </div>
          )
        }
      `
      const ctx = analyzeComponent(source, 'Parent.tsx')
      const ir = jsxToIR(ctx)
      const div = ir as any
      const child = div.children.find((c: any) => c.type === 'component')

      // The span with reactive content inside Child should have ^-prefixed slotId
      const span = child.children.find((c: any) => c.type === 'element' && c.tag === 'span')
      expect(span).toBeDefined()
      expect(span.slotId).toMatch(/^\^s\d+$/)
    })

    test('nested component slotId does NOT get ^ prefix when inside another component children', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Parent() {
          const [count, setCount] = createSignal(0)
          return (
            <div>
              <Outer>
                <Inner>
                  <button onClick={() => setCount(c => c + 1)}>Click</button>
                </Inner>
              </Outer>
            </div>
          )
        }
      `
      const ctx = analyzeComponent(source, 'Parent.tsx')
      const ir = jsxToIR(ctx)
      const div = ir as any

      const outer = div.children.find((c: any) => c.type === 'component' && c.name === 'Outer')
      expect(outer).toBeDefined()
      // Outer's own slotId should NOT have ^ prefix
      expect(outer.slotId).toMatch(/^s\d+$/)
      expect(outer.slotId).not.toContain('^')

      const inner = outer.children.find((c: any) => c.type === 'component' && c.name === 'Inner')
      expect(inner).toBeDefined()
      // Inner's own slotId should NOT have ^ prefix (this was the bug)
      expect(inner.slotId).toMatch(/^s\d+$/)
      expect(inner.slotId).not.toContain('^')

      // But the button (native element) inside Inner SHOULD have ^ prefix
      const button = inner.children.find((c: any) => c.type === 'element' && c.tag === 'button')
      expect(button).toBeDefined()
      expect(button.slotId).toMatch(/^\^s\d+$/)
    })

    test('self-closing component inside component children does NOT get ^ prefix', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Parent() {
          const [open, setOpen] = createSignal(false)
          return (
            <div>
              <Outer>
                <SelfClosing />
              </Outer>
            </div>
          )
        }
      `
      const ctx = analyzeComponent(source, 'Parent.tsx')
      const ir = jsxToIR(ctx)
      const div = ir as any

      const outer = div.children.find((c: any) => c.type === 'component' && c.name === 'Outer')
      const selfClosing = outer.children.find((c: any) => c.type === 'component' && c.name === 'SelfClosing')
      expect(selfClosing).toBeDefined()
      // Self-closing component's slotId should NOT have ^ prefix
      expect(selfClosing.slotId).toMatch(/^s\d+$/)
      expect(selfClosing.slotId).not.toContain('^')
    })
  })

  describe('controlled prop detection (#434)', () => {
    test('props.xxx ?? default generates sync effect', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        interface SliderProps {
          initial?: number
        }

        export function Slider(props: SliderProps) {
          const [value, setValue] = createSignal(props.initial ?? 0)
          return <input type="range" value={value()} />
        }
      `

      const result = compileJSXSync(source, 'Slider.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Sync effect for controlled prop should be generated
      expect(clientJs?.content).toContain('const __val = props.initial')
    })

    test('props.defaultXxx ?? default does NOT generate sync effect', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        interface CheckboxProps {
          defaultChecked?: boolean
        }

        export function Checkbox(props: CheckboxProps) {
          const [checked, setChecked] = createSignal(props.defaultChecked ?? false)
          return <input type="checkbox" checked={checked()} />
        }
      `

      const result = compileJSXSync(source, 'Checkbox.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // No sync effect for uncontrolled (defaultXxx) props
      expect(clientJs?.content).not.toContain('const __val = props.')
    })

    test('no redundant double-?? in output', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        interface SliderProps {
          initial?: number
        }

        export function Slider(props: SliderProps) {
          const [value, setValue] = createSignal(props.initial ?? 0)
          return <input type="range" value={value()} />
        }
      `

      const result = compileJSXSync(source, 'Slider.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Init function should not contain double ?? like "props.initial ?? 0 ?? 0"
      // (Template function may legitimately contain ?? in signal initial value substitutions)
      const initFn = clientJs?.content.match(/export function initSlider[\s\S]*?^}/m)?.[0] ?? ''
      expect(initFn).not.toMatch(/\?\?.*\?\?/)
    })

    test('preserves original ?? fallback value in output', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        interface SliderProps {
          initial?: number
        }

        export function Slider(props: SliderProps) {
          const [value, setValue] = createSignal(props.initial ?? 0)
          return <input type="range" value={value()} />
        }
      `

      const result = compileJSXSync(source, 'Slider.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Must preserve the original fallback value, NOT replace with undefined
      expect(clientJs?.content).toContain('props.initial ?? 0')
      expect(clientJs?.content).not.toContain('props.initial ?? undefined')
    })

    test('preserves boolean fallback value in output', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        interface CheckboxProps {
          defaultChecked?: boolean
        }

        export function Checkbox(props: CheckboxProps) {
          const [checked, setChecked] = createSignal(props.defaultChecked ?? false)
          return <input type="checkbox" checked={checked()} />
        }
      `

      const result = compileJSXSync(source, 'Checkbox.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Must preserve false, NOT replace with undefined
      expect(clientJs?.content).toContain('props.defaultChecked ?? false')
      expect(clientJs?.content).not.toContain('props.defaultChecked ?? undefined')
    })

    test('preserves string fallback value in output', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        interface InputProps {
          defaultValue?: string
        }

        export function Input(props: InputProps) {
          const [value, setValue] = createSignal(props.defaultValue ?? '')
          return <input value={value()} />
        }
      `

      const result = compileJSXSync(source, 'Input.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Must preserve empty string, NOT replace with undefined
      expect(clientJs?.content).not.toContain("props.defaultValue ?? undefined")
    })

    test('custom props parameter name (e.g., p) generates sync effect', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        interface SliderProps {
          initial?: number
        }

        export function Slider(p: SliderProps) {
          const [value, setValue] = createSignal(p.initial ?? 0)
          return <input type="range" value={value()} />
        }
      `

      const result = compileJSXSync(source, 'Slider.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Sync effect should be generated
      expect(clientJs?.content).toContain('const __val = props.initial')
      // Output should use 'props.initial' (not 'p.initial')
      expect(clientJs?.content).toContain('props.initial')
      expect(clientJs?.content).not.toContain('p.initial')
      // Init function should not contain double ??
      const initFn = clientJs?.content.match(/export function initSlider[\s\S]*?^}/m)?.[0] ?? ''
      expect(initFn).not.toMatch(/\?\?.*\?\?/)
    })
  })

  describe('event callbacks on stateless components', () => {
    test('stateless component with event-forwarding prop generates client JS', () => {
      const source = `
        interface SortHeaderProps {
          label: string
          onSort: () => void
        }

        export function SortHeader({ label, onSort }: SortHeaderProps) {
          return <th onClick={onSort}>{label}</th>
        }
      `

      const result = compileJSXSync(source, 'SortHeader.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs?.content).toContain('click')
    })

    test('stateless component with local event handler generates client JS', () => {
      const source = `
        export function LogButton() {
          return <button onClick={() => console.log('clicked')}>Log</button>
        }
      `

      const result = compileJSXSync(source, 'LogButton.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs?.content).toContain('click')
    })

    test('analyzeClientNeeds returns needsInit: true for event-wiring components', () => {
      const source = `
        interface ClickableProps {
          onClick: () => void
        }

        export function Clickable({ onClick }: ClickableProps) {
          return <div onClick={onClick}>Click me</div>
        }
      `

      const ctx = analyzeComponent(source, 'Clickable.tsx')
      const ir = jsxToIR(ctx)
      expect(ir).not.toBeNull()

      const componentIR = {
        version: '0.1' as const,
        metadata: {
          componentName: ctx.componentName || 'Clickable',
          hasDefaultExport: ctx.hasDefaultExport,
          isClientComponent: ctx.hasUseClientDirective,
          typeDefinitions: ctx.typeDefinitions,
          propsType: ctx.propsType,
          propsParams: ctx.propsParams,
          propsObjectName: ctx.propsObjectName,
          restPropsName: ctx.restPropsName,
          restPropsExpandedKeys: ctx.restPropsExpandedKeys,
          signals: ctx.signals,
          memos: ctx.memos,
          effects: ctx.effects,
          onMounts: ctx.onMounts,
          imports: ctx.imports,
          localFunctions: ctx.localFunctions,
          localConstants: ctx.localConstants,
        },
        root: ir!,
        errors: [],
      }

      const analysis = analyzeClientNeeds(componentIR)
      expect(analysis.needsInit).toBe(true)
    })

    test('purely static component generates template-only mount (#435)', () => {
      const source = `
        export function StaticLabel() {
          return <span>Hello World</span>
        }
      `

      const result = compileJSXSync(source, 'StaticLabel.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain("hydrate('StaticLabel'")
      expect(clientJs!.content).toContain('function initStaticLabel() {}')
      expect(clientJs!.content).toContain('<span>Hello World</span>')
    })

    test('components with reactive primitives still require "use client"', () => {
      const source = `
        import { createSignal } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
        }
      `

      // This should produce errors because signals require "use client"
      // The compiler itself doesn't throw, but the adapter will
      expect(() => {
        compileJSXSync(source, 'Counter.tsx', { adapter })
      }).not.toThrow()

      // Verify the analyzer detects the issue
      const ctx = analyzeComponent(source, 'Counter.tsx')
      expect(ctx.signals.length).toBeGreaterThan(0)
      expect(ctx.hasUseClientDirective).toBe(false)
    })

    test('HonoAdapter does not throw for stateless event-wiring components', () => {
      const source = `
        interface SortHeaderProps {
          label: string
          onSort: () => void
        }

        export function SortHeader({ label, onSort }: SortHeaderProps) {
          return <th onClick={onSort}>{label}</th>
        }
      `

      const honoAdapter = new HonoAdapter()
      const result = compileJSXSync(source, 'SortHeader.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      // Should produce client JS
      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // Should produce marked template with scope attributes
      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()
      expect(template?.content).toContain('bf-s=')
    })

    test('HonoAdapter throws for signals without "use client"', () => {
      const source = `
        import { createSignal } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
        }
      `

      const honoAdapter = new HonoAdapter()
      expect(() => {
        compileJSXSync(source, 'Counter.tsx', { adapter: honoAdapter })
      }).toThrow(/reactive primitives/)
    })
  })

  describe('comment scope flag for fragment roots (#381)', () => {
    test('fragment-root component generates mount with comment: true', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        export function FragComp() {
          const [count, setCount] = createSignal(0)
          return (
            <>
              <div>{count()}</div>
              <button onClick={() => setCount(c => c + 1)}>+</button>
            </>
          )
        }
      `
      const result = compileJSXSync(source, 'FragComp.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // hydrate() should include comment: true for fragment roots
      expect(content).toMatch(/hydrate\('FragComp',/)
      expect(content).toContain('comment: true')
    })

    test('single-root component generates mount without comment flag', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        export function SingleRoot() {
          const [count, setCount] = createSignal(0)
          return (
            <div>
              <span>{count()}</span>
              <button onClick={() => setCount(c => c + 1)}>+</button>
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'SingleRoot.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // hydrate() should NOT include comment flag for single-root components
      expect(content).not.toContain('comment:')
      expect(content).not.toContain('comment: true')
    })
  })

  describe('let variable declarations (#482)', () => {
    test('let without initializer is captured by analyzer', () => {
      const source = `
        'use client'
        import { createSignal, createEffect, onCleanup } from '@barefootjs/dom'

        type ApiType = { scrollPrev: () => void }

        export function Carousel() {
          let emblaApi: ApiType | undefined
          const [canScrollPrev, setCanScrollPrev] = createSignal(false)

          createEffect(() => {
            if (emblaApi) {
              setCanScrollPrev(true)
            }
          })

          return <div>{canScrollPrev() ? 'yes' : 'no'}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Carousel.tsx')
      const letConstant = ctx.localConstants.find(c => c.name === 'emblaApi')
      expect(letConstant).toBeDefined()
      expect(letConstant!.declarationKind).toBe('let')
      expect(letConstant!.value).toBeUndefined()
    })

    test('let without initializer is emitted in client JS', () => {
      const source = `
        'use client'
        import { createSignal, createEffect, onCleanup } from '@barefootjs/dom'

        type ApiType = { scrollPrev: () => void }

        export function Carousel() {
          let emblaApi: ApiType | undefined
          const [canScrollPrev, setCanScrollPrev] = createSignal(false)

          const scrollPrev = () => {
            if (emblaApi) emblaApi.scrollPrev()
          }

          createEffect(() => {
            if (emblaApi) {
              setCanScrollPrev(true)
            }
          })

          return <div onClick={scrollPrev}>{canScrollPrev() ? 'yes' : 'no'}</div>
        }
      `

      const result = compileJSXSync(source, 'Carousel.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('let emblaApi')
      // Must not contain type annotation in output
      expect(clientJs!.content).not.toContain('ApiType')
    })

    test('let with initializer is emitted as let, not const', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Counter() {
          let count = 0
          const [value, setValue] = createSignal(count)
          return <div>{value()}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Counter.tsx')
      const letConstant = ctx.localConstants.find(c => c.name === 'count')
      expect(letConstant).toBeDefined()
      expect(letConstant!.declarationKind).toBe('let')
      expect(letConstant!.value).toBe('0')

      const result = compileJSXSync(source, 'Counter.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('let count = 0')
      expect(clientJs!.content).not.toContain('const count')
    })

    test('const declarations still emitted as const (regression)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Counter() {
          const prefix = 'count'
          const [value, setValue] = createSignal(0)
          return <div>{value() + prefix}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Counter.tsx')
      const constConstant = ctx.localConstants.find(c => c.name === 'prefix')
      expect(constConstant).toBeDefined()
      expect(constConstant!.declarationKind).toBe('const')

      const result = compileJSXSync(source, 'Counter.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain("const prefix = 'count'")
      expect(clientJs!.content).not.toContain('let prefix')
    })
  })

  describe('nested ternary (#495)', () => {
    test('compiles all branches of nested ternary', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        export function StatusBadge() {
          const [status, setStatus] = createSignal('idle')
          return <div>{status() === 'loading' ? <span>Loading</span> : status() === 'error' ? <span>Error</span> : <span>Idle</span>}</div>
        }
      `

      const result = compileJSXSync(source, 'StatusBadge.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // No raw JSX should remain in the compiled output
      expect(clientJs!.content).not.toContain('<span>Loading</span>')
      expect(clientJs!.content).not.toContain('<span>Error</span>')
      expect(clientJs!.content).not.toContain('<span>Idle</span>')
    })

    test('compiles deeply nested ternary (3+ levels)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        export function DeepTernary() {
          const [v, setV] = createSignal(0)
          return <div>{v() === 1 ? <span>One</span> : v() === 2 ? <span>Two</span> : v() === 3 ? <span>Three</span> : <span>Other</span>}</div>
        }
      `

      const result = compileJSXSync(source, 'DeepTernary.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).not.toContain('<span>One</span>')
      expect(clientJs!.content).not.toContain('<span>Two</span>')
      expect(clientJs!.content).not.toContain('<span>Three</span>')
      expect(clientJs!.content).not.toContain('<span>Other</span>')
    })

    test('compiles stateless nested ternary without errors', () => {
      const source = `
        export function StaticNested(props: { status: string }) {
          return <div>{props.status === 'a' ? <span>A</span> : props.status === 'b' ? <span>B</span> : <span>C</span>}</div>
        }
      `

      const result = compileJSXSync(source, 'StaticNested.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      // Stateless components produce JSX templates — verify template is generated
      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()
      // The nested ternary should produce two conditional expressions in the template
      expect(template!.content).toContain("props.status === 'a'")
      expect(template!.content).toContain("props.status === 'b'")
    })

    test('compiles logical AND inside ternary branch', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        export function AndInBranch() {
          const [a, setA] = createSignal(false)
          const [b, setB] = createSignal(false)
          return <div>{a() ? <span>A</span> : b() && <span>B</span>}</div>
        }
      `

      const result = compileJSXSync(source, 'AndInBranch.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).not.toContain('<span>A</span>')
      expect(clientJs!.content).not.toContain('<span>B</span>')
    })
  })

  describe('nullish coalescing with JSX (#524)', () => {
    test('compiles stateless ?? with JSX element', () => {
      const source = `
        function Separator({ children }: { children?: any }) {
          return <div>{children ?? <span>Default</span>}</div>
        }
        export { Separator }
      `

      const result = compileJSXSync(source, 'Separator.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()
      // The condition should use != null check
      expect(template!.content).toContain('!= null')
    })

    test('compiles reactive ?? with JSX element', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        export function Fallback() {
          const [label, setLabel] = createSignal<string | null>(null)
          return <div>{label() ?? <span>Fallback</span>}</div>
        }
      `

      const result = compileJSXSync(source, 'Fallback.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Raw JSX should not remain in compiled output
      expect(clientJs!.content).not.toContain('<span>Fallback</span>')
    })

    test('compiles ?? with JSX inside ternary branch', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        export function Nested() {
          const [show, setShow] = createSignal(true)
          const [icon, setIcon] = createSignal<any>(null)
          return <div>{show() ? icon() ?? <span>Icon</span> : <span>Hidden</span>}</div>
        }
      `

      const result = compileJSXSync(source, 'Nested.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).not.toContain('<span>Icon</span>')
      expect(clientJs!.content).not.toContain('<span>Hidden</span>')
    })

    test('non-JSX ?? remains as expression', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        interface Props { initial?: number }
        export function Counter(props: Props) {
          const [count, setCount] = createSignal(props.initial ?? 0)
          return <div>{count()}</div>
        }
      `

      const result = compileJSXSync(source, 'Counter.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // props.initial ?? 0 should remain as a regular expression
      expect(clientJs!.content).toContain('props.initial ?? 0')
    })

    test('compiles || with JSX element', () => {
      const source = `
        function Label({ text }: { text?: string }) {
          return <div>{text || <span>Empty</span>}</div>
        }
        export { Label }
      `

      const result = compileJSXSync(source, 'Label.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()
    })
  })

  describe('hydrate() template generation for signal-bearing components', () => {
    test('Counter (top-level only): NO CSR fallback template', () => {
      const source = `
        'use client'
        import { createSignal, createMemo } from '@barefootjs/dom'
        interface CounterProps { initial?: number }
        export function Counter(props: CounterProps) {
          const [count, setCount] = createSignal(props.initial ?? 0)
          const doubled = createMemo(() => count() * 2)
          return (
            <div className="counter-container">
              <p className="counter-value">{count()}</p>
              <p className="counter-doubled">doubled: {doubled()}</p>
              <button className="btn-increment" onClick={() => setCount(n => n + 1)}>+1</button>
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'Counter.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Top-level-only component: no CSR fallback template (saves bytes)
      expect(content).toContain("hydrate('Counter', { init: initCounter })")
      expect(content).not.toContain('template:')
    })

    test('ItemList (top-level only): NO CSR fallback template', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        export function ItemList(props: { items: string[] }) {
          const [count, setCount] = createSignal(0)
          return (
            <div>
              <span>{count()}</span>
              <ul>
                {props.items.map((item) => (
                  <li>{item}</li>
                ))}
              </ul>
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'ItemList.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // Top-level-only: no CSR fallback
      expect(clientJs!.content).toContain("hydrate('ItemList', { init: initItemList })")
      expect(clientJs!.content).not.toContain('template:')
    })

    test('child stateless component gets template, parent (top-level) skips CSR fallback', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        function Child(props: { value: number }) {
          return <span>{props.value}</span>
        }

        export function Parent() {
          const [count, setCount] = createSignal(0)
          return (
            <div>
              <Child value={count()} />
              <button onClick={() => setCount(n => n + 1)}>+</button>
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'Parent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Stateless Child gets a static template (always useful)
      expect(content).toContain("hydrate('Child', { init: initChild, template:")

      // Parent is NOT used as a child — no CSR fallback
      expect(content).toContain("hydrate('Parent', { init: initParent })")
      expect(content).not.toMatch(/hydrate\('Parent',.*template:/)
    })

    test('component used as child gets CSR fallback template', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function StatusBadge(props: { active: boolean }) {
          const [flash, setFlash] = createSignal(false)
          return (
            <span className={flash() ? 'flash' : ''} onClick={() => setFlash(v => !v)}>
              {props.active ? 'on' : 'off'}
            </span>
          )
        }

        export function Dashboard() {
          const [items, setItems] = createSignal([{ id: 1, active: true }])
          return (
            <div>
              {items().map(item => (
                <StatusBadge active={item.active} />
              ))}
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'Dashboard.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // StatusBadge IS used as a child by Dashboard → gets CSR fallback template
      expect(content).toMatch(/hydrate\('StatusBadge',.*template:/)

      // Dashboard is NOT used as a child → no CSR fallback
      expect(content).not.toMatch(/hydrate\('Dashboard',.*template:/)
    })

    test('client-only expression (top-level only): NO CSR fallback template', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        export function Filtered() {
          const [items, setItems] = createSignal([{id: 1, done: false}])
          return (
            <ul>
              {/* @client */ items().filter(t => !t.done).map(t => (
                <li>{t.id}</li>
              ))}
            </ul>
          )
        }
      `
      const result = compileJSXSync(source, 'Filtered.tsx', { adapter })

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // Top-level-only: no CSR fallback
      expect(clientJs!.content).toContain("hydrate('Filtered', { init: initFiltered })")
      expect(clientJs!.content).not.toContain('template:')
    })

    test('string literals in CSS classes are not corrupted by constant inlining', () => {
      // Use a parent+child scenario so the child (Icon) gets a CSR fallback template,
      // which exercises the transformExpr() string-literal protection path.
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        type Size = 'sm' | 'md' | 'lg'
        const sizeClasses: Record<Size, string> = {
          sm: 'size-4',
          md: 'size-6',
          lg: 'size-8',
        }
        export function Icon(props: { size?: Size }) {
          const [active, setActive] = createSignal(false)
          const size = props.size ?? 'md'
          return (
            <svg className={sizeClasses[size]} onClick={() => setActive(v => !v)}>
              <circle />
            </svg>
          )
        }

        export function IconGallery() {
          return (
            <div>
              <Icon size="sm" />
              <Icon size="md" />
              <Icon size="lg" />
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'Icon.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Icon is used as a child → gets CSR fallback with template
      expect(content).toMatch(/hydrate\('Icon',.*template:/)

      // String literals 'size-4', 'size-6', 'size-8' must NOT be corrupted
      // by the constant `size` being inlined into them
      expect(content).toContain("'size-4'")
      expect(content).toContain("'size-6'")
      expect(content).toContain("'size-8'")
      // The word 'size' inside 'size-4' should not be replaced with the constant value
      expect(content).not.toMatch(/'\(props\.size/)
    })
  })

  describe('renderChild for components without registered templates (#536)', () => {
    test('stateless component with spread attrs and object-literal constants gets template registered', () => {
      const source = `
        const sizeMap = { sm: 16, md: 20, lg: 24 }
        type Size = 'sm' | 'md' | 'lg'

        export function CheckIcon(props: { size?: Size, className?: string }) {
          const size = props.size ?? 'md'
          const sizeAttrs = { width: sizeMap[size], height: sizeMap[size] }
          return (
            <svg {...sizeAttrs} className={props.className ?? ''} viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )
        }
      `
      const result = compileJSXSync(source, 'CheckIcon.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Stateless component must register a template so renderChild() can find it
      expect(content).toContain("hydrate('CheckIcon',")
      expect(content).toContain('template:')

      // Computed spread must use spreadAttrs() to render attributes (#545)
      expect(content).toContain('spreadAttrs(')
      expect(content).toMatch(/import \{[^}]*spreadAttrs[^}]*\} from '@barefootjs\/dom'/)
    })

    test('computed spread with conditional expression emits spreadAttrs (#545)', () => {
      const source = `
        export function Icon(props: { large?: boolean }) {
          const attrs = props.large ? { width: 48, height: 48 } : { width: 24, height: 24 }
          return <svg {...attrs} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
        }
      `
      const result = compileJSXSync(source, 'Icon.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      expect(content).toContain('spreadAttrs(')
    })

    test('multiple computed spreads on same element both emit spreadAttrs (#545)', () => {
      const source = `
        export function Icon(props: { size?: string, color?: string }) {
          const sizeAttrs = { width: props.size ?? '24', height: props.size ?? '24' }
          const colorAttrs = { fill: props.color ?? 'currentColor' }
          return <svg {...sizeAttrs} {...colorAttrs} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
        }
      `
      const result = compileJSXSync(source, 'Icon.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Both spreads should emit spreadAttrs
      const matches = content.match(/spreadAttrs\(/g)
      expect(matches).not.toBeNull()
      expect(matches!.length).toBeGreaterThanOrEqual(2)
    })

    test('rest props spread is NOT emitted as spreadAttrs (#545)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Button(props: { variant?: string }) {
          const { variant, ...rest } = props
          const [count, setCount] = createSignal(0)
          return <button {...rest} onClick={() => setCount(c => c + 1)}>{count()}</button>
        }
      `
      const result = compileJSXSync(source, 'Button.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Rest props spread should use applyRestAttrs, not spreadAttrs
      expect(content).not.toContain('spreadAttrs(')
    })

    test('multi-component file: stateless icons in conditional rendering produce renderChild + hydrate', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        function CopyIcon() {
          return <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" /></svg>
        }

        function CheckIcon() {
          return <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
        }

        export function CopyButton() {
          const [copied, setCopied] = createSignal(false)
          return (
            <button onClick={() => setCopied(true)}>
              {copied() ? <CheckIcon /> : <CopyIcon />}
            </button>
          )
        }
      `
      const result = compileJSXSync(source, 'CopyButton.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Both icon components must have templates registered
      expect(content).toContain("hydrate('CopyIcon',")
      expect(content).toContain("hydrate('CheckIcon',")

      // Both should have template functions
      expect(content).toMatch(/hydrate\('CopyIcon',\s*\{[^}]*template:/)
      expect(content).toMatch(/hydrate\('CheckIcon',\s*\{[^}]*template:/)

      // Parent should use renderChild for the icons
      expect(content).toContain("renderChild('CheckIcon'")
      expect(content).toContain("renderChild('CopyIcon'")
    })

    test('regression: AST-based identifier extraction distinguishes property keys from ternary branches', () => {
      // extractFreeIdentifiers() skips identifiers in PropertyAssignment key position.
      // This verifies that identifiers in ternary branches (structurally distinct in the AST)
      // are correctly identified as variable references.
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        function StatusOn() { return <span>ON</span> }
        function StatusOff() { return <span>OFF</span> }

        export function Toggle() {
          const [active, setActive] = createSignal(false)
          return (
            <div>
              {active() ? <StatusOn /> : <StatusOff />}
              <button onClick={() => setActive(v => !v)}>toggle</button>
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'Toggle.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Both child components must have templates registered
      expect(content).toContain("hydrate('StatusOn',")
      expect(content).toContain("hydrate('StatusOff',")
      expect(content).toContain("renderChild('StatusOn'")
      expect(content).toContain("renderChild('StatusOff'")
    })
  })

  describe('dependency-based declaration ordering (#508)', () => {
    test('constant depending on call expression with arrow argument preserves source order', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function MyForm(props) {
          const form = createForm({ onSubmit: async (values) => { await fetch('/api', { body: JSON.stringify(values) }) } })
          const emailField = form.field('email')
          const [submitted, setSubmitted] = createSignal(false)
          return <div><input value={emailField.value} onInput={(e) => emailField.onChange(e.target.value)} /><button onClick={() => setSubmitted(true)}>Submit</button></div>
        }
      `

      const result = compileJSXSync(source, 'MyForm.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')!
      expect(clientJs).toBeDefined()

      const content = clientJs.content
      // form must be defined before emailField
      const formIndex = content.indexOf('const form =')
      const emailFieldIndex = content.indexOf('const emailField =')
      expect(formIndex).toBeGreaterThan(-1)
      expect(emailFieldIndex).toBeGreaterThan(-1)
      expect(formIndex).toBeLessThan(emailFieldIndex)
    })

    test('signal depending on function: function emitted before signal (#365 regression)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function ToggleGroup(props) {
          function toArray(value) {
            return Array.isArray(value) ? value : value ? [value] : []
          }
          const [selected, setSelected] = createSignal(toArray(props.defaultValue))
          return <div data-state={selected().length > 0 ? 'on' : 'off'} onClick={() => setSelected([])}>{props.children}</div>
        }
      `

      const result = compileJSXSync(source, 'ToggleGroup.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')!
      expect(clientJs).toBeDefined()

      // toArray must be defined before the signal declaration
      const fnIndex = clientJs.content.indexOf('toArray')
      const signalIndex = clientJs.content.indexOf('const [selected')
      expect(signalIndex).toBeGreaterThan(-1)
      expect(fnIndex).toBeLessThan(signalIndex)
    })

    test('memo depending on signal: emitted after signal', () => {
      const source = `
        'use client'
        import { createSignal, createMemo } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          const doubled = createMemo(() => count() * 2)
          return <div onClick={() => setCount(n => n + 1)}>{doubled()}</div>
        }
      `

      const result = compileJSXSync(source, 'Counter.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')!
      expect(clientJs).toBeDefined()

      // Search in function body (not import line) using declaration patterns
      const signalIndex = clientJs.content.indexOf('const [count')
      const memoIndex = clientJs.content.indexOf('const doubled')
      expect(signalIndex).toBeGreaterThan(-1)
      expect(memoIndex).toBeGreaterThan(-1)
      expect(signalIndex).toBeLessThan(memoIndex)
    })

    test('independent declarations preserve source order', () => {
      // Use non-inlinable constants (function calls) so they appear in client JS
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function MyComponent(props) {
          const config = getConfig()
          const formatter = createFormatter()
          const [count, setCount] = createSignal(0)
          return <div onClick={() => setCount(n => n + 1)}>{formatter.format(config.prefix, count())}</div>
        }
      `

      const result = compileJSXSync(source, 'MyComponent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')!
      expect(clientJs).toBeDefined()

      const content = clientJs.content
      const configIndex = content.indexOf("const config =")
      const formatterIndex = content.indexOf("const formatter =")
      expect(configIndex).toBeGreaterThan(-1)
      expect(formatterIndex).toBeGreaterThan(-1)
      expect(configIndex).toBeLessThan(formatterIndex)
    })

    test('transitive dependencies: constant depending on signal', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function MyComponent() {
          const [items, setItems] = createSignal([1, 2, 3])
          const total = items().reduce((a, b) => a + b, 0)
          return <div onClick={() => setItems([4, 5, 6])}>{total}</div>
        }
      `

      const result = compileJSXSync(source, 'MyComponent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')!
      expect(clientJs).toBeDefined()

      const content = clientJs.content
      // signal must come before total (total depends on items())
      const signalIndex = content.indexOf('const [items')
      const totalIndex = content.indexOf('const total =')
      expect(signalIndex).toBeGreaterThan(-1)
      expect(totalIndex).toBeGreaterThan(-1)
      expect(signalIndex).toBeLessThan(totalIndex)
    })
  })

  describe('ternary text branches (#521)', () => {
    test('non-reactive ternary preserves string quotes (TestAdapter)', () => {
      const source = `
        export function SubmitButton(props: { isSubmitting: boolean }) {
          return <button>{props.isSubmitting ? 'Submitting...' : 'Submit'}</button>
        }
      `

      const result = compileJSXSync(source, 'SubmitButton.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template).toBeDefined()
      expect(template.content).toContain("'Submitting...'")
      expect(template.content).toContain("'Submit'")
    })

    test('reactive ternary preserves string quotes (TestAdapter)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function SubmitButton() {
          const [isSubmitting, setIsSubmitting] = createSignal(false)
          return <button>{isSubmitting() ? 'Submitting...' : 'Submit'}</button>
        }
      `

      const result = compileJSXSync(source, 'SubmitButton.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template).toBeDefined()
      expect(template.content).toContain("'Submitting...'")
      expect(template.content).toContain("'Submit'")
    })

    test('non-reactive ternary preserves string quotes (HonoAdapter)', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        export function SubmitButton(props: { isSubmitting: boolean }) {
          return <button>{props.isSubmitting ? 'Submitting...' : 'Submit'}</button>
        }
      `

      const result = compileJSXSync(source, 'SubmitButton.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template).toBeDefined()
      expect(template.content).toContain("'Submitting...'")
      expect(template.content).toContain("'Submit'")
    })

    test('reactive ternary wraps string literals in braces (HonoAdapter)', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function SubmitButton() {
          const [isSubmitting, setIsSubmitting] = createSignal(false)
          return <button>{isSubmitting() ? 'Submitting...' : 'Submit'}</button>
        }
      `

      const result = compileJSXSync(source, 'SubmitButton.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template).toBeDefined()
      // String literals should be wrapped in braces inside cond marker fragments
      expect(template.content).toContain("{'Submitting...'}")
      expect(template.content).toContain("{'Submit'}")
    })
  })

  describe('reactive text-only ternary generates insert() (#526)', () => {
    test('text ternary with string equality condition generates insert()', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function SubmitButton() {
          const [status, setStatus] = createSignal('idle')
          return <button>{status() === 'loading' ? 'Verifying...' : 'Verify'}</button>
        }
      `

      const result = compileJSXSync(source, 'SubmitButton.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('insert(')
      expect(clientJs!.content).toContain("status() === 'loading'")
    })

    test('logical AND with string equality generates insert()', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function StatusMessage() {
          const [status, setStatus] = createSignal('idle')
          return <div>{status() === 'success' && <p>Done!</p>}</div>
        }
      `

      const result = compileJSXSync(source, 'StatusMessage.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('insert(')
      expect(clientJs!.content).toContain("status() === 'success'")
    })

    test('full onClick scenario with text ternary and multiple conditionals', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function VerifyForm() {
          const [status, setStatus] = createSignal('idle')

          const handleSubmit = () => {
            setStatus('loading')
          }

          return (
            <div>
              <button onClick={handleSubmit} disabled={status() === 'loading'}>
                {status() === 'loading' ? 'Verifying...' : 'Verify'}
              </button>
              {status() === 'success' && <p>Success!</p>}
              {status() === 'error' && <p>Error occurred</p>}
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'VerifyForm.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // Should have insert() calls for each conditional
      const insertCount = (clientJs!.content.match(/insert\(/g) || []).length
      expect(insertCount).toBeGreaterThanOrEqual(3)

      // Should include handleSubmit reference
      expect(clientJs!.content).toContain('handleSubmit')

      // Should have onclick binding
      expect(clientJs!.content).toContain('onclick')
    })

    test('insert() template contains comment markers for text branches', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function SubmitButton() {
          const [status, setStatus] = createSignal('idle')
          return <button>{status() === 'loading' ? 'Verifying...' : 'Verify'}</button>
        }
      `

      const result = compileJSXSync(source, 'SubmitButton.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // Text branches should have comment markers in insert() templates
      expect(clientJs!.content).toContain('bf-cond-start:')
      expect(clientJs!.content).toContain('bf-cond-end:')
    })
  })

  describe('.map() with block body (#520)', () => {
    test('handles block body with variable declaration and return JSX', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function List() {
          const [items, setItems] = createSignal([{ name: 'a' }, { name: 'b' }])
          return (
            <ul>
              {items().map(item => {
                const label = item.name.toUpperCase()
                return <li>{label}</li>
              })}
            </ul>
          )
        }
      `

      const result = compileJSXSync(source, 'List.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // Should contain the preamble in the map callback
      expect(clientJs?.content).toContain('const label = item.name.toUpperCase()')
      // Should contain the template with the label reference
      expect(clientJs?.content).toContain('${label}')
    })

    test('handles block body with multiple variable declarations', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function List() {
          const [items, setItems] = createSignal([{ first: 'a', last: 'b' }])
          return (
            <ul>
              {items().map(item => {
                const first = item.first.toUpperCase()
                const last = item.last.toUpperCase()
                return <li>{first} {last}</li>
              })}
            </ul>
          )
        }
      `

      const result = compileJSXSync(source, 'List.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      expect(clientJs?.content).toContain('const first = item.first.toUpperCase()')
      expect(clientJs?.content).toContain('const last = item.last.toUpperCase()')
    })

    test('expression body (existing) does not set mapPreamble', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function List() {
          const [items, setItems] = createSignal(['a', 'b'])
          return (
            <ul>
              {items().map(item => (
                <li>{item}</li>
              ))}
            </ul>
          )
        }
      `

      const result = compileJSXSync(source, 'List.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      // IR should not have mapPreamble
      const irFile = result.files.find(f => f.type === 'ir')
      if (irFile) {
        const ir = JSON.parse(irFile.content)
        const findLoop = (node: any): any => {
          if (node.type === 'loop') return node
          if (node.children) {
            for (const c of node.children) {
              const found = findLoop(c)
              if (found) return found
            }
          }
          return null
        }
        const loop = findLoop(ir.root)
        expect(loop).toBeTruthy()
        expect(loop.mapPreamble).toBeUndefined()
      }
    })

    test('generates mapPreamble in IR', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function List() {
          const [items, setItems] = createSignal([{ name: 'a' }])
          return (
            <ul>
              {items().map(item => {
                const label = item.name.toUpperCase()
                return <li>{label}</li>
              })}
            </ul>
          )
        }
      `

      const result = compileJSXSync(source, 'List.tsx', { adapter, outputIR: true })

      expect(result.errors).toHaveLength(0)

      const irFile = result.files.find(f => f.type === 'ir')
      expect(irFile).toBeDefined()
      const ir = JSON.parse(irFile!.content)

      const findLoop = (node: any): any => {
        if (node.type === 'loop') return node
        if (node.children) {
          for (const c of node.children) {
            const found = findLoop(c)
            if (found) return found
          }
        }
        return null
      }
      const loop = findLoop(ir.root)
      expect(loop).toBeTruthy()
      expect(loop.mapPreamble).toContain('const label = item.name.toUpperCase()')
      expect(loop.children).toHaveLength(1)
      expect(loop.children[0].type).toBe('element')
    })

    test('Hono adapter generates block body SSR output', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function List() {
          const [items, setItems] = createSignal([{ name: 'a' }])
          return (
            <ul>
              {items().map(item => {
                const label = item.name.toUpperCase()
                return <li>{label}</li>
              })}
            </ul>
          )
        }
      `

      const result = compileJSXSync(source, 'List.tsx', { adapter: honoAdapter })

      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()

      // Should contain block body in map callback
      expect(template?.content).toContain('const label = item.name.toUpperCase()')
      expect(template?.content).toContain('return')
    })
  })

  describe('non-function exports from "use client" modules (#523)', () => {
    test('export const is preserved at module level', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export const REGEXP_ONLY_DIGITS = '^\\\\d+$'

        export function OTPInput(props: { pattern?: string }) {
          const [value, setValue] = createSignal('')
          return <input pattern={props.pattern ?? REGEXP_ONLY_DIGITS} />
        }
      `
      const result = compileJSXSync(source, 'OTPInput.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()
      const content = template!.content

      // export const should appear before the component function, at module level
      expect(content).toContain("export const REGEXP_ONLY_DIGITS = '^\\\\d+$'")

      // It should NOT appear indented inside the function body
      const funcStart = content.indexOf('export function OTPInput')
      const exportConstIndex = content.indexOf("export const REGEXP_ONLY_DIGITS")
      expect(exportConstIndex).toBeLessThan(funcStart)
    })

    test('export { X } named export syntax sets isExported on analyzer', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        const MY_CONST = 42

        export { MY_CONST }

        export function Widget() {
          const [val, setVal] = createSignal(0)
          return <div>{MY_CONST}</div>
        }
      `
      const ctx = analyzeComponent(source, 'Widget.tsx')
      const constInfo = ctx.localConstants.find(c => c.name === 'MY_CONST')
      expect(constInfo).toBeDefined()
      expect(constInfo!.isExported).toBe(true)
    })

    test('non-exported const stays inside function body', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        const INTERNAL_VALUE = 'secret'

        export function MyComponent() {
          const [count, setCount] = createSignal(0)
          return <div>{INTERNAL_VALUE}</div>
        }
      `
      const result = compileJSXSync(source, 'MyComponent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      const content = template.content

      // Non-exported const should NOT appear as 'export const' at module level
      expect(content).not.toContain('export const INTERNAL_VALUE')

      // It should appear inside the function body (indented)
      const funcStart = content.indexOf('export function MyComponent')
      const constIndex = content.indexOf("INTERNAL_VALUE = 'secret'")
      expect(constIndex).toBeGreaterThan(funcStart)
    })

    test('exported non-component function at module level', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function helperFn(x: number) { return x * 2 }

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div>{helperFn(count())}</div>
        }
      `
      const result = compileJSXSync(source, 'Counter.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      const content = template.content

      // Exported helper function should be at module level
      expect(content).toContain('export function helperFn(x)')

      // It should appear before the component
      const helperIndex = content.indexOf('export function helperFn')
      const componentIndex = content.indexOf('export function Counter')
      expect(helperIndex).toBeLessThan(componentIndex)
    })

    test('analyzer sets isExported flag correctly', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export const EXPORTED_A = 'aaa'
        const INTERNAL_B = 'bbb'
        export let EXPORTED_C = 100

        export function MyComponent() {
          const [val, setVal] = createSignal(0)
          return <div />
        }
      `
      const ctx = analyzeComponent(source, 'Test.tsx')

      const a = ctx.localConstants.find(c => c.name === 'EXPORTED_A')
      expect(a).toBeDefined()
      expect(a!.isExported).toBe(true)
      expect(a!.declarationKind).toBe('const')

      const b = ctx.localConstants.find(c => c.name === 'INTERNAL_B')
      expect(b).toBeDefined()
      expect(b!.isExported).toBeFalsy()

      const c = ctx.localConstants.find(c => c.name === 'EXPORTED_C')
      expect(c).toBeDefined()
      expect(c!.isExported).toBe(true)
      expect(c!.declarationKind).toBe('let')
    })

    test('Hono adapter: exported const appears before component', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export const PATTERN = /^[0-9]+$/

        export function InputField() {
          const [val, setVal] = createSignal('')
          return <input />
        }
      `
      const result = compileJSXSync(source, 'InputField.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      const content = template.content

      expect(content).toContain('export const PATTERN = /^[0-9]+$/')

      const exportIndex = content.indexOf('export const PATTERN')
      const componentIndex = content.indexOf('export function InputField')
      expect(exportIndex).toBeLessThan(componentIndex)
    })
  })
})
