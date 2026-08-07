/**
 * BarefootJS Compiler - Adapter Output Tests
 *
 * Tests for adapter-specific output behavior including real component compilation,
 * ternary text branches, non-function exports, and arrow function body preservation.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'
import { resolve, dirname } from 'node:path'

const adapter = new TestAdapter()

describe('Adapter output', () => {
  describe('real components', () => {
    test('compiles ButtonDemo component', async () => {
      // Path to the actual button-demo component
      const docsUiPath = resolve(dirname(import.meta.path), '../../../../site/ui')
      const buttonDemoPath = resolve(docsUiPath, 'components/button-demo.tsx')

      const source = await Bun.file(buttonDemoPath).text()
      const result = compileJSX(source, buttonDemoPath, { adapter })

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
        import { createSignal } from '@barefootjs/client'

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

      const result = compileJSX(source, 'Counter.tsx', { adapter })

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

      const result = compileJSX(source, 'SubmitButton.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template).toBeDefined()
      expect(template.content).toContain("'Submitting...'")
      expect(template.content).toContain("'Submit'")
    })

    test('reactive ternary preserves string quotes (TestAdapter)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function SubmitButton() {
          const [isSubmitting, setIsSubmitting] = createSignal(false)
          return <button>{isSubmitting() ? 'Submitting...' : 'Submit'}</button>
        }
      `

      const result = compileJSX(source, 'SubmitButton.tsx', { adapter })
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

      const result = compileJSX(source, 'SubmitButton.tsx', { adapter: honoAdapter })
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
        import { createSignal } from '@barefootjs/client'

        export function SubmitButton() {
          const [isSubmitting, setIsSubmitting] = createSignal(false)
          return <button>{isSubmitting() ? 'Submitting...' : 'Submit'}</button>
        }
      `

      const result = compileJSX(source, 'SubmitButton.tsx', { adapter: honoAdapter })
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
        import { createSignal } from '@barefootjs/client'

        export const REGEXP_ONLY_DIGITS = '^\\\\d+$'

        export function OTPInput(props: { pattern?: string }) {
          const [value, setValue] = createSignal('')
          return <input pattern={props.pattern ?? REGEXP_ONLY_DIGITS} />
        }
      `
      const result = compileJSX(source, 'OTPInput.tsx', { adapter })
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

    test('non-exported module const stays at module scope, without export', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        const INTERNAL_VALUE = 'secret'

        export function MyComponent() {
          const [count, setCount] = createSignal(0)
          return <div>{INTERNAL_VALUE}</div>
        }
      `
      const result = compileJSX(source, 'MyComponent.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      const content = template.content

      // Non-exported const should NOT appear as 'export const' at module level
      expect(content).not.toContain('export const INTERNAL_VALUE')

      // Since #2570, the emitted module preserves the source module's shape:
      // a module-scope const stays at module scope (a module-scope type
      // could reference it via `typeof`), BEFORE the component — it is just
      // not exported. Previously it was localised into the component body.
      const funcStart = content.indexOf('export function MyComponent')
      const constIndex = content.indexOf("const INTERNAL_VALUE = 'secret'")
      expect(constIndex).toBeGreaterThanOrEqual(0)
      expect(constIndex).toBeLessThan(funcStart)
    })

    test('exported non-component function at module level', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function helperFn(x: number) { return x * 2 }

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div>{helperFn(count())}</div>
        }
      `
      const result = compileJSX(source, 'Counter.tsx', { adapter })
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
        import { createSignal } from '@barefootjs/client'

        export const PATTERN = /^[0-9]+$/

        export function InputField() {
          const [val, setVal] = createSignal('')
          return <input />
        }
      `
      const result = compileJSX(source, 'InputField.tsx', { adapter: honoAdapter })
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
        import { createSignal } from '@barefootjs/client'

        export function Calendar(props) {
          const [mode, setMode] = createSignal(props.mode ?? 'single')
          const isRangeMode = () => mode() === 'range'
          return <div>{isRangeMode() ? 'range' : 'single'}</div>
        }
      `

      const result = compileJSX(source, 'Calendar.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template).toBeDefined()
      expect(template.content).toContain("const isRangeMode = () => mode() === 'range'")
    })

    test('parameterized arrow function body is preserved in markedTemplate', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function MyComponent(props) {
          const normalize = (val) => val == null ? '' : String(val)
          const [value, setValue] = createSignal(normalize(props.defaultValue))
          return <input value={value()} />
        }
      `

      const result = compileJSX(source, 'MyComponent.tsx', { adapter: honoAdapter })
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
        import { createSignal } from '@barefootjs/client'

        export const formatDate = (d) => d.toISOString().split('T')[0]

        export function DatePicker() {
          const [date, setDate] = createSignal(new Date())
          return <span>{formatDate(date())}</span>
        }
      `

      const result = compileJSX(source, 'DatePicker.tsx', { adapter: honoAdapter })
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
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>Count: {count()}</button>
        }
      `
      const result = compileJSX(source, 'Counter.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // Unused setter (only used in event handler) should be omitted entirely
      expect(template.content).not.toContain('setCount')
    })

    test('signal setter accepts arguments in generated SSR template (TestAdapter)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>Count: {count()}</button>
        }
      `
      const result = compileJSX(source, 'Counter.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // Unused setter (only used in event handler) should be omitted entirely
      expect(template.content).not.toContain('setCount')
    })

    test('local function parameters preserve type annotations', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        function formatNum(n: number): string { return n.toFixed(2) }

        export function Display() {
          const [val, setVal] = createSignal(0)
          return <span>{formatNum(val())}</span>
        }
      `
      const result = compileJSX(source, 'Display.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template.content).toContain('function formatNum(n: number)')
    })

    test('exported function parameters preserve type annotations in module exports', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function helperFn(x: number, label: string) { return label + x }

        export function MyComponent() {
          const [val, setVal] = createSignal(0)
          return <div>{helperFn(val(), 'value: ')}</div>
        }
      `
      const result = compileJSX(source, 'MyComponent.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template.content).toContain('export function helperFn(x: number, label: string)')
    })

    test('SolidJS-style props do not generate unused PropsWithHydration type', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        interface CounterProps { initial?: number }

        export function Counter(props: CounterProps) {
          const [count, setCount] = createSignal(props.initial ?? 0)
          return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
        }
      `
      const result = compileJSX(source, 'Counter.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // SolidJS-style uses inline type, should not generate PropsWithHydration
      expect(template.content).not.toContain('CounterPropsWithHydration')
    })

    test('unused signal setter is omitted when only used in event handlers', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>Count: {count()}</button>
        }
      `
      const result = compileJSX(source, 'Counter.tsx', { adapter: honoAdapter })
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
        import { createSignal } from '@barefootjs/client'

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
      const result = compileJSX(source, 'MembersPanel.tsx', { adapter: honoAdapter })
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
        import { createSignal } from '@barefootjs/client'

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
      const result = compileJSX(source, 'Display.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // formatVal is used in JSX body, must be preserved
      expect(template.content).toContain('function formatVal(n: number)')
    })

    test('unused hydration params get _ prefix (Hono interactive component)', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
        }
      `
      const result = compileJSX(source, 'Counter.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // Hono interactive components don't use __bfScope in their scopeId generation
      // so it should be aliased with _ prefix
      expect(template.content).toContain('__bfScope: _bfScope')
      // __bfParentProps should also be aliased (no props to serialize)
      expect(template.content).toContain('__bfParentProps: _bfParentProps')
    })
  })

  describe('unused imports and type inference (#782)', () => {
    test('static component omits bfComment/bfText/bfTextEnd imports', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        export function Logo() {
          return <div class="logo">BarefootJS</div>
        }
      `
      const result = compileJSX(source, 'Logo.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template.content).not.toContain("from '@barefootjs/hono/utils'")
    })

    test('interactive component only imports used hono utilities', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>Count: {count()}</button>
        }
      `
      const result = compileJSX(source, 'Counter.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // Should have bfComment (for hydration markers) but only the ones actually used
      const importLine = template.content.split('\n').find(l => l.includes("from '@barefootjs/hono/utils'"))
      if (importLine) {
        // Each imported name should actually appear in the component body
        const importedNames = importLine.match(/\b(bfComment|bfText|bfTextEnd)\b/g) ?? []
        const componentBody = template.content.slice(template.content.indexOf('export function'))
        for (const name of importedNames) {
          expect(componentBody).toContain(name)
        }
      }
    })

    test('@barefootjs/client imports are skipped in SSR output', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
        }
      `
      const result = compileJSX(source, 'Counter.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      expect(template.content).not.toContain("from '@barefootjs/client'")
      expect(template.content).not.toContain("from '@barefootjs/client/runtime'")
    })

    test('signal with generic type parameter emits type assertion in SSR getter', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function TodoList() {
          const [items, setItems] = createSignal<string[]>([])
          return <span>{items().length}</span>
        }
      `
      const result = compileJSX(source, 'TodoList.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // Should emit typed assertion: [] as string[] instead of bare []
      expect(template.content).toMatch(/items\s*=\s*\(\)\s*=>\s*\[\]\s+as\s+string\[\]/)
    })

    test('signal with inline type annotation preserves it without duplication', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Panel() {
          const [ids, setIds] = createSignal([] as string[])
          return <span>{ids().length}</span>
        }
      `
      const result = compileJSX(source, 'Panel.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // Should preserve the inline annotation, not add a duplicate
      expect(template.content).toContain('[] as string[]')
      // Should NOT have double assertion: [] as string[] as string[]
      expect(template.content).not.toContain('as string[] as string[]')
    })

    test('signal with primitive type does not emit redundant assertion', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
        }
      `
      const result = compileJSX(source, 'Counter.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      // Primitive initial value should NOT have redundant `as number`
      expect(template.content).not.toMatch(/\b0\s+as\s+number\b/)
    })
  })

  // The no-arg props default (`= {}`) makes a JSX-returning arrow hoisted from
  // an object-literal value renderable at SSR (#1663). `hasRequiredProps`
  // treats a prop with a destructuring default as non-required, but the
  // declared props type may still mark that field required — so a bare `= {}`
  // would fail `tsc` ("Property 'x' is missing in type '{}'..."). The default
  // must be asserted to the param's annotated type (`{} as T`).
  describe('no-arg props default is type-safe for typed required props (#1663 follow-up)', () => {
    const cases = [
      ['TestAdapter', () => new TestAdapter()],
      ['HonoAdapter', () => new HonoAdapter()],
    ] as const

    for (const [label, make] of cases) {
      test(`typed required prop with a default emits \`= {} as T\` (${label})`, () => {
        // `label` is required in the type but carries a destructuring default,
        // the exact shape that made a bare `= {}` fail tsc.
        const source = `
          export function Badge({ label = 'x' }: { label: string }) {
            return <span>{label}</span>
          }
        `
        const result = compileJSX(source, 'Badge.tsx', { adapter: make() })
        expect(result.errors).toHaveLength(0)

        const template = result.files.find(f => f.type === 'markedTemplate')!
        const sig = template.content.split('\n').find(l => l.includes('function Badge'))!
        // Asserted to the generated props type, never a bare `= {}`.
        expect(sig).toContain('= {} as BadgePropsWithHydration')
        expect(sig).not.toMatch(/=\s*\{\}\s*\)/)
      })
    }

    test('untyped props still default to a bare `= {} as <hydration type>` (TestAdapter)', () => {
      const source = `
        export function Plain() {
          return <span>hi</span>
        }
      `
      const result = compileJSX(source, 'Plain.tsx', { adapter: new TestAdapter() })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!
      const sig = template.content.split('\n').find(l => l.includes('function Plain'))!
      // No declared props type → default asserted to the hydration-only type.
      expect(sig).toContain('= {} as {')
      expect(sig).toContain('__instanceId')
    })
  })
})
