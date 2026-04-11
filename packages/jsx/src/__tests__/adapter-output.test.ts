/**
 * BarefootJS Compiler - Adapter Output Tests
 *
 * Tests for adapter-specific output behavior including real component compilation,
 * ternary text branches, non-function exports, and arrow function body preservation.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync, compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../../packages/hono/src/adapter/hono-adapter'
import { resolve, dirname } from 'node:path'

const adapter = new TestAdapter()

describe('Adapter output', () => {
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
        import { createSignal } from '@barefootjs/client-runtime'

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
        import { createSignal } from '@barefootjs/client-runtime'

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
        import { createSignal } from '@barefootjs/client-runtime'

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

  describe('non-function exports from "use client" modules (#523)', () => {
    test('export const is preserved at module level', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

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

    test('non-exported const stays inside function body', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

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
        import { createSignal } from '@barefootjs/client-runtime'

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
      expect(content).toContain('export function helperFn(x: number)')

      // It should appear before the component
      const helperIndex = content.indexOf('export function helperFn')
      const componentIndex = content.indexOf('export function Counter')
      expect(helperIndex).toBeLessThan(componentIndex)
    })

    test('Hono adapter: exported const appears before component', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

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

  describe('arrow function bodies preserved in SSR (#543)', () => {
    test('simple derived-state arrow function body is preserved in markedTemplate', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

        export function Calendar(props) {
          const [mode, setMode] = createSignal(props.mode ?? 'single')
          const isRangeMode = () => mode() === 'range'
          return <div>{isRangeMode() ? 'range' : 'single'}</div>
        }
      `

      const result = compileJSXSync(source, 'Calendar.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template).toBeDefined()
      expect(template.content).toContain("const isRangeMode = () => mode() === 'range'")
    })

    test('parameterized arrow function body is preserved in markedTemplate', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

        export function MyComponent(props) {
          const normalize = (val) => val == null ? '' : String(val)
          const [value, setValue] = createSignal(normalize(props.defaultValue))
          return <input value={value()} />
        }
      `

      const result = compileJSXSync(source, 'MyComponent.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template).toBeDefined()
      expect(template.content).toContain('normalize')
      expect(template.content).not.toContain('normalize = () => {}')
      expect(template.content).not.toContain('normalize = (val) => {}')
    })

    test('exported arrow function body is preserved in module exports', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

        export const formatDate = (d) => d.toISOString().split('T')[0]

        export function DatePicker() {
          const [date, setDate] = createSignal(new Date())
          return <span>{formatDate(date())}</span>
        }
      `

      const result = compileJSXSync(source, 'DatePicker.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template).toBeDefined()
      expect(template.content).toContain("export const formatDate = (d) => d.toISOString().split('T')[0]")
    })
  })

  describe('strict TypeScript compliance (#762)', () => {
    test('signal setter accepts arguments in generated SSR template (HonoAdapter)', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>Count: {count()}</button>
        }
      `
      const result = compileJSXSync(source, 'Counter.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // Unused setter (only used in event handler) should be omitted entirely
      expect(template.content).not.toContain('setCount')
    })

    test('signal setter accepts arguments in generated SSR template (TestAdapter)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>Count: {count()}</button>
        }
      `
      const result = compileJSXSync(source, 'Counter.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // Unused setter (only used in event handler) should be omitted entirely
      expect(template.content).not.toContain('setCount')
    })

    test('local function parameters preserve type annotations', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

        function formatNum(n: number): string { return n.toFixed(2) }

        export function Display() {
          const [val, setVal] = createSignal(0)
          return <span>{formatNum(val())}</span>
        }
      `
      const result = compileJSXSync(source, 'Display.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template.content).toContain('function formatNum(n: number)')
    })

    test('exported function parameters preserve type annotations in module exports', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

        export function helperFn(x: number, label: string) { return label + x }

        export function MyComponent() {
          const [val, setVal] = createSignal(0)
          return <div>{helperFn(val(), 'value: ')}</div>
        }
      `
      const result = compileJSXSync(source, 'MyComponent.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template.content).toContain('export function helperFn(x: number, label: string)')
    })

    test('SolidJS-style props do not generate unused PropsWithHydration type', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

        interface CounterProps { initial?: number }

        export function Counter(props: CounterProps) {
          const [count, setCount] = createSignal(props.initial ?? 0)
          return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
        }
      `
      const result = compileJSXSync(source, 'Counter.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // SolidJS-style uses inline type, should not generate PropsWithHydration
      expect(template.content).not.toContain('CounterPropsWithHydration')
    })

    test('unused signal setter is omitted when only used in event handlers', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>Count: {count()}</button>
        }
      `
      const result = compileJSXSync(source, 'Counter.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // setCount is only used in onClick which becomes () => {} in SSR — omit entirely
      expect(template.content).not.toContain('setCount')
      expect(template.content).not.toContain('_setCount')
    })

    test('event handler functions not emitted when only used in event handlers', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

        export function MembersPanel() {
          const [members, setMembers] = createSignal<string[]>([])

          function handleGrant(id: string) {
            setMembers(prev => [...prev, id])
          }

          function handleRevoke(id: string) {
            setMembers(prev => prev.filter(m => m !== id))
          }

          return (
            <div>
              <button onClick={() => handleGrant('user1')}>Grant</button>
              <button onClick={() => handleRevoke('user1')}>Revoke</button>
              <span>{members().length}</span>
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'MembersPanel.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // Functions only used in event handlers should not be emitted
      expect(template.content).not.toContain('function handleGrant')
      expect(template.content).not.toContain('function handleRevoke')
    })

    test('function used in JSX body is preserved even if also used in events', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

        export function Display() {
          const [val, setVal] = createSignal(0)

          function formatVal(n: number): string { return n.toFixed(2) }

          return (
            <div>
              <span>{formatVal(val())}</span>
              <button onClick={() => setVal(v => v + 1)}>Inc</button>
            </div>
          )
        }
      `
      const result = compileJSXSync(source, 'Display.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // formatVal is used in JSX body, must be preserved
      expect(template.content).toContain('function formatVal(n: number)')
    })

    test('unused hydration params get _ prefix (Hono interactive component)', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client-runtime'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
        }
      `
      const result = compileJSXSync(source, 'Counter.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // Hono interactive components don't use __bfScope in their scopeId generation
      // so it should be aliased with _ prefix
      expect(template.content).toContain('__bfScope: _bfScope')
      // __bfParentProps should also be aliased (no props to serialize)
      expect(template.content).toContain('__bfParentProps: _bfParentProps')
    })
  })
})
