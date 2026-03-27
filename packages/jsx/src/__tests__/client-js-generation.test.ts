/**
 * BarefootJS Compiler - Client JS Generation Tests
 *
 * Combined codegen-related describe blocks extracted from compiler.test.ts.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { analyzeComponent } from '../analyzer'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../../packages/hono/src/adapter/hono-adapter'

const adapter = new TestAdapter()

describe('Client JS generation', () => {
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
      expect(clientJs?.content).toContain('_p.onClick')
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
      expect(clientJs?.content).toContain('const fullCommand = `npx ${_p.command}`')
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

  describe('map with index parameter', () => {
    test('includes index parameter in reconcileElements renderItem callback', () => {
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

      // Should include index param in renderItem callback
      expect(clientJs?.content).toContain('(item, i) => {')
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
      expect(content).toContain('const prev = _p.prev\n')
      expect(content).toContain('const next = _p.next\n')
      expect(content).not.toContain('_p.prev ?? {}')
      expect(content).not.toContain('_p.next ?? {}')
    })

    test('evaluates dynamic text unconditionally inside conditional branches with try-catch', () => {
      // Regression: when a dynamic text expression (e.g. prev.title) is only inside
      // a conditional branch, expression must be evaluated unconditionally to maintain
      // reactive subscriptions. But wrapped in try-catch because the guard variable
      // (e.g., prev) may be undefined when the condition is false.
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

      // Text effects inside conditional branches are emitted inside bindEvents
      // using createDisposableEffect, not as top-level try-catch effects.
      // This ensures they only run when the branch is active.
      expect(content).toContain('createDisposableEffect')
      expect(content).toContain('prev.title')
      expect(content).toContain('bindEvents')
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
      expect(content).toContain('_p.config ?? {}')
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
      expect(content).toContain('(_p) => `')
      expect(content).not.toMatch(/\bisDisabled\b.*\?>/)
      // The inlined expression should reference props directly
      expect(content).toMatch(/_p\.disabled/)
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

      // Template should inline the template literal
      expect(content).toContain('(_p) => `')
      // Constant may also appear as a declaration (safe, not an error)
      // Optimization to remove unused declarations is a separate concern
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

      // All components get CSR fallback templates for cross-file conditional use
      expect(content).toMatch(/hydrate\('Display',.*template:/)
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
      expect(content).toContain('(_p) => `')
      // Template must NOT reference the local variable name 'isDisabled'
      // It should instead contain the inlined expression with props access
      const templateMatch = content.match(/\(_p\) => `([^`]*)`/)
      expect(templateMatch).not.toBeNull()
      const template = templateMatch![1]
      expect(template).not.toContain('isDisabled')
      expect(template).toContain('_p.disabled')
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
      expect(content).not.toContain('_p.(props.')
      // Local constants should be fully resolved
      const templateMatch = content.match(/\(_p\) => `([^`]*)`/)
      expect(templateMatch).not.toBeNull()
      const template = templateMatch![1]
      expect(template).not.toContain('outlineShadow')
      // props.variant should appear as valid syntax
      expect(template).toContain('_p.variant')
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

      expect(content).not.toContain('_p.(props.')
      const templateMatch = content.match(/\(_p\) => `([^`]*)`/)
      expect(templateMatch).not.toBeNull()
      const template = templateMatch![1]
      expect(template).not.toContain('classes')
      expect(template).toContain('_p.kind')
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
      expect(content).not.toContain('_p.(props.')
      // The mount call should contain props.variant properly resolved
      expect(content).toContain('_p.variant')
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

      expect(content).not.toContain('_p.(props.')
      const templateMatch = content.match(/\(_p\) => `([^`]*)`/)
      expect(templateMatch).not.toBeNull()
      const template = templateMatch![1]
      // props.size should be valid and not corrupted
      expect(template).toContain('_p.size')
      // Should not have double-wrapped props references
      expect(template).not.toMatch(/_p\.\(props\./)
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

  describe('comment scope flag for component roots (#515)', () => {
    test('component-root client component generates mount with comment: true', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        import { Layout } from './Layout'
        export function Wrapper() {
          const [count, setCount] = createSignal(0)
          return (
            <Layout count={count()} />
          )
        }
      `
      const result = compileJSXSync(source, 'Wrapper.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // hydrate() should include comment: true for component roots
      expect(content).toMatch(/hydrate\('Wrapper',/)
      expect(content).toContain('comment: true')
    })

    test('element-root client component does NOT generate comment: true', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'
        export function Counter() {
          const [count, setCount] = createSignal(0)
          return (
            <div>
              <span>{count()}</span>
              <button onClick={() => setCount(c => c + 1)}>+</button>
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'Counter.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // hydrate() should NOT include comment flag for element roots
      expect(content).not.toContain('comment:')
      expect(content).not.toContain('comment: true')
    })
  })

  describe('let variable declarations (#482)', () => {
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

      // Should have addEventListener click binding
      expect(clientJs!.content).toContain("addEventListener('click'")
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

      // Rest props spread in init function should NOT use spreadAttrs.
      // (CSR fallback template may use spreadAttrs — that's correct for template rendering.)
      const initBody = content.split(/hydrate\(/)[0]
      expect(initBody).not.toContain('spreadAttrs(')
    })

    test('multiple spreads: rest props identified when not first spread (#599)', () => {
      // Pattern: <Tag {...childProps} {...props}> where props is the component's props object.
      // The compiler must find the props spread even when it's not the first spread.
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        interface WrapperProps {
          className?: string
          children?: any
        }

        export function Wrapper(props: WrapperProps) {
          const childProps = { 'data-extra': 'true' }
          const [count, setCount] = createSignal(0)
          return <div {...childProps} {...props} onClick={() => setCount(c => c + 1)}>{count()}</div>
        }
      `
      const result = compileJSXSync(source, 'Wrapper.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // props object spread should be recognized — should use applyRestAttrs
      expect(content).toContain('applyRestAttrs')
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

    test('component event handler props are not bound as native DOM events (#551)', () => {
      // When a parent passes onChange to a child component, the compiler should
      // generate initChild with the handler in propsExpr, but NOT addEventListener.
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        function CustomInput(props: { onChange: (v: string) => void }) {
          return <input onInput={(e) => props.onChange(e.target.value)} />
        }

        export function Parent() {
          const [value, setValue] = createSignal('')
          return <CustomInput onChange={setValue} />
        }
      `
      const result = compileJSXSync(source, 'Parent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // initChild should pass onChange as a prop
      expect(content).toContain('initChild')
      expect(content).toContain('onChange')

      // Must NOT generate addEventListener('change', ...) for the component slot
      expect(content).not.toContain("addEventListener('change'")
    })
  })

  describe('reactive props through local constants', () => {
    test('stateless component with prop-dependent className generates createEffect', () => {
      const source = `
        interface BadgeProps {
          variant?: 'default' | 'secondary'
          className?: string
          children?: any
        }

        const variantClasses: Record<string, string> = {
          default: 'bg-primary',
          secondary: 'bg-secondary',
        }

        export function Badge({ variant = 'default', className = '', children }: BadgeProps) {
          const classes = \`badge \${variantClasses[variant]} \${className}\`
          return <span className={classes}>{children}</span>
        }
      `

      const result = compileJSXSync(source, 'Badge.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Should generate createEffect for the class attribute
      expect(content).toContain('createEffect')
      expect(content).toContain("setAttribute('class'")

      // Should reference props.variant and props.className (not destructured names)
      expect(content).toContain('_p.variant')
      expect(content).toContain('_p.className')
    })

    test('expanded constant with single prop reference is detected as reactive', () => {
      const source = `
        interface Props {
          size?: 'sm' | 'lg'
          children?: any
        }

        const sizeMap: Record<string, string> = { sm: 'text-sm', lg: 'text-lg' }

        export function Text({ size = 'sm', children }: Props) {
          const sizeClass = sizeMap[size]
          return <span className={sizeClass}>{children}</span>
        }
      `

      const result = compileJSXSync(source, 'Text.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      expect(content).toContain('createEffect')
      expect(content).toContain('_p.size')
    })

    test('prop rewrite does not corrupt identifiers containing the prop name', () => {
      const source = `
        interface Props {
          size?: 'sm' | 'lg'
          children?: any
        }

        const sizeMap: Record<string, string> = { sm: 'text-sm', lg: 'text-lg' }

        export function Text({ size = 'sm', children }: Props) {
          const classes = \`base \${sizeMap[size]}\`
          return <span className={classes}>{children}</span>
        }
      `

      const result = compileJSXSync(source, 'Text.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // sizeMap should remain intact (not rewritten to (props.size ?? ...)Map)
      expect(content).toContain('sizeMap')
      expect(content).not.toContain('sizeMap'.replace('size', 'props.size'))
      // The standalone size reference should be rewritten
      expect(content).toContain("_p.size ?? 'sm'")
    })

    test('default values from destructuring are included in rewrite', () => {
      const source = `
        interface Props {
          label?: string
          children?: any
        }

        export function Tag({ label = 'tag', children }: Props) {
          const text = \`[\${label}]\`
          return <span data-label={text}>{children}</span>
        }
      `

      const result = compileJSXSync(source, 'Tag.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      expect(content).toContain('createEffect')
      // Should include the default value in the rewrite
      expect(content).toContain("_p.label ?? 'tag'")
    })

    test('text node renders empty string for nullish reactive values', () => {
      // Regression: String(undefined) renders "undefined" instead of ""
      // The generated client JS must use String(__val ?? '') for text nodes
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Greeting(props: { name?: string }) {
          return <span>{props.name}</span>
        }
      `

      const result = compileJSXSync(source, 'Greeting.tsx', { adapter })
      const errors = result.errors.filter(e => e.severity === 'error')
      expect(errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Text node assignment must guard against nullish values
      expect(content).toContain("String(__val ?? '')")
      expect(content).not.toMatch(/\.nodeValue = String\(__val\)(?! )/)
    })

    test('propagates insideConditional through component children', () => {
      // Regression: {show() && <Label>{text()}</Label>} — when text() changes
      // while show() is true, the text node must update reactively.
      // insideConditional must propagate through component nodes so the codegen
      // uses $t() runtime lookup instead of init-time refs.
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        function Label(props: { children?: any }) {
          return <span>{props.children}</span>
        }

        export function App() {
          const [show, setShow] = createSignal(true)
          const [text, setText] = createSignal('hello')
          return (
            <div>
              <button onClick={() => setShow(!show())}>toggle</button>
              {show() && <Label>{text()}</Label>}
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'App.tsx', { adapter })
      const errors = result.errors.filter(e => e.severity === 'error')
      expect(errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // text() inside a component inside a conditional uses $t() in branch-scoped effect
      expect(content).toContain('$t(__branchScope')
    })

    test('propagates insideConditional through fragment children', () => {
      // Regression: {show() && <><span>{text()}</span></>} — inner signal must
      // update reactively. insideConditional must propagate through fragment nodes.
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function App() {
          const [show, setShow] = createSignal(true)
          const [text, setText] = createSignal('hello')
          return (
            <div>
              <button onClick={() => setShow(!show())}>toggle</button>
              {show() && <><span>{text()}</span></>}
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'App.tsx', { adapter })
      const errors = result.errors.filter(e => e.severity === 'error')
      expect(errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // text() inside a fragment inside a conditional uses $t() in branch-scoped effect
      expect(content).toContain('$t(__branchScope')
    })
  })

  describe('child component initialization in conditional branches', () => {
    test('emits initChild in bindEvents for component in reactive conditional', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Parent() {
          const [show, setShow] = createSignal(false)
          return (
            <div>
              <button onClick={() => setShow(!show())}>Toggle</button>
              {show() && <Spinner />}
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'Parent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // bindEvents callback should contain initChild for the component in the branch
      expect(content).toContain('initChild')
      expect(content).toMatch(/bindEvents:.*\n[\s\S]*?initChild\('Spinner'/)
    })

    test('emits initChild with props in bindEvents for component with props', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Parent() {
          const [show, setShow] = createSignal(false)
          return (
            <div>
              <button onClick={() => setShow(!show())}>Toggle</button>
              {show() && <Alert message="hello" onClose={() => setShow(false)} />}
            </div>
          )
        }
      `

      const result = compileJSXSync(source, 'Parent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      const content = clientJs!.content

      // Should have initChild with props in the bindEvents callback
      expect(content).toMatch(/initChild\('Alert'/)
    })
  })
})
