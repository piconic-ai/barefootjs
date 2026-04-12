import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { analyzeClientNeeds } from '../ir-to-client-js'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../../packages/hono/src/adapter/hono-adapter'

const adapter = new TestAdapter()

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
        isExported: ctx.isExported,
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
        templateImports: ctx.imports.filter((imp: any) => !['@barefootjs/client-runtime', '@barefootjs/dom', '@barefootjs/client'].includes(imp.source)),
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
      import { createSignal } from '@barefootjs/client-runtime'

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
      import { createSignal } from '@barefootjs/client-runtime'

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
