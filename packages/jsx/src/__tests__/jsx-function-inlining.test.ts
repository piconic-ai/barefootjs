/**
 * BarefootJS Compiler - JSX Function Inlining Tests (#569)
 *
 * When a local function returns JSX (e.g., renderMonthGrid()),
 * calling it multiple times should produce separate IR subtrees
 * with unique slot IDs, not opaque expression nodes.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('JSX function inlining (#569)', () => {
  describe('analyzer', () => {
    test('stores JSX function info for function declarations', () => {
      const source = `
        'use client'

        export function MyComponent() {
          function renderItem(label: string) {
            return <li>{label}</li>
          }
          return <ul>{renderItem("a")}</ul>
        }
      `

      const ctx = analyzeComponent(source, 'MyComponent.tsx')

      expect(ctx.jsxFunctions.has('renderItem')).toBe(true)
      const info = ctx.jsxFunctions.get('renderItem')!
      expect(info.params).toEqual(['label'])
    })

    test('stores JSX function info for arrow function constants', () => {
      const source = `
        'use client'

        export function MyComponent() {
          const renderItem = (label: string) => <li>{label}</li>
          return <ul>{renderItem("a")}</ul>
        }
      `

      const ctx = analyzeComponent(source, 'MyComponent.tsx')

      expect(ctx.jsxFunctions.has('renderItem')).toBe(true)
      const info = ctx.jsxFunctions.get('renderItem')!
      expect(info.params).toEqual(['label'])
    })

    test('stores JSX function info for arrow functions with block body', () => {
      const source = `
        'use client'

        export function MyComponent() {
          const renderItem = (label: string) => {
            return <li>{label}</li>
          }
          return <ul>{renderItem("a")}</ul>
        }
      `

      const ctx = analyzeComponent(source, 'MyComponent.tsx')

      expect(ctx.jsxFunctions.has('renderItem')).toBe(true)
    })

    test('sets isJsxFunction flag on arrow function constants', () => {
      const source = `
        'use client'

        export function MyComponent() {
          const renderItem = (label: string) => <li>{label}</li>
          return <ul>{renderItem("a")}</ul>
        }
      `

      const ctx = analyzeComponent(source, 'MyComponent.tsx')
      const constant = ctx.localConstants.find(c => c.name === 'renderItem')

      expect(constant).toBeDefined()
      expect(constant!.isJsxFunction).toBe(true)
    })

    test('sets isJsxFunction flag on function declarations', () => {
      const source = `
        'use client'

        export function MyComponent() {
          function renderItem(label: string) {
            return <li>{label}</li>
          }
          return <ul>{renderItem("a")}</ul>
        }
      `

      const ctx = analyzeComponent(source, 'MyComponent.tsx')
      const fn = ctx.localFunctions.find(f => f.name === 'renderItem')

      expect(fn).toBeDefined()
      expect(fn!.isJsxFunction).toBe(true)
    })

    test('multi-return function is stored in jsxMultiReturnFunctions (not jsxFunctions)', () => {
      const source = `
        'use client'

        export function MyComponent() {
          function renderItem(active: boolean) {
            if (active) return <li className="active">Active</li>
            return <li>Inactive</li>
          }
          return <ul>{renderItem(true)}</ul>
        }
      `

      const ctx = analyzeComponent(source, 'MyComponent.tsx')

      expect(ctx.jsxFunctions.has('renderItem')).toBe(false)
      expect(ctx.jsxMultiReturnFunctions.has('renderItem')).toBe(true)
      const info = ctx.jsxMultiReturnFunctions.get('renderItem')!
      expect(info.params).toEqual(['active'])
      expect(info.branches).toHaveLength(1)
      expect(info.fallback).not.toBeNull()
    })

    test('does not set isJsxFunction for non-JSX returning functions', () => {
      const source = `
        'use client'

        export function MyComponent() {
          function formatLabel(text: string) {
            return text.toUpperCase()
          }
          return <div>{formatLabel("hello")}</div>
        }
      `

      const ctx = analyzeComponent(source, 'MyComponent.tsx')

      expect(ctx.jsxFunctions.has('formatLabel')).toBe(false)
    })
  })

  describe('IR transformation', () => {
    test('single call inlines to element IR node (not expression)', () => {
      const source = `
        'use client'

        export function MyComponent() {
          function renderItem(label: string) {
            return <li>{label}</li>
          }
          return <ul>{renderItem("hello")}</ul>
        }
      `

      const ctx = analyzeComponent(source, 'MyComponent.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      if (ir!.type === 'element') {
        // Should have an inlined <li>, not an expression node
        const liChild = ir!.children.find(
          (c: any) => c.type === 'element' && c.tag === 'li'
        )
        expect(liChild).toBeDefined()

        // Should NOT have an expression node referencing the function call
        const exprChild = ir!.children.find(
          (c: any) => c.type === 'expression' && c.expr.includes('renderItem')
        )
        expect(exprChild).toBeUndefined()
      }
    })

    test('two calls produce separate IR subtrees with unique slot IDs', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function MyComponent() {
          const [count, setCount] = createSignal(0)
          function renderCounter(label: string) {
            return <span>{label}: {count()}</span>
          }
          return <div>{renderCounter("A")}{renderCounter("B")}</div>
        }
      `

      const ctx = analyzeComponent(source, 'MyComponent.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      if (ir!.type === 'element') {
        const spans = ir!.children.filter(
          (c: any) => c.type === 'element' && c.tag === 'span'
        )
        expect(spans).toHaveLength(2)

        // Collect all slot IDs from both subtrees
        const slotIds = new Set<string>()
        function collectSlotIds(node: any): void {
          if (node.slotId) slotIds.add(node.slotId)
          if (node.children) node.children.forEach(collectSlotIds)
        }
        spans.forEach(collectSlotIds)

        // Each reactive expression should have a unique slot ID
        expect(slotIds.size).toBeGreaterThanOrEqual(2)
      }
    })

    test('function call with loop (.map) produces loop IR node', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function MyComponent() {
          const [items, setItems] = createSignal([{ name: 'a' }, { name: 'b' }])
          function renderList(data: any[]) {
            return <ul>{data.map((item, i) => <li key={i}>{item.name}</li>)}</ul>
          }
          return <div>{renderList(items())}</div>
        }
      `

      const ctx = analyzeComponent(source, 'MyComponent.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()

      // Walk the IR tree to find the loop node
      function findLoopNode(node: any): any {
        if (node.type === 'loop') return node
        if (node.children) {
          for (const child of node.children) {
            const found = findLoopNode(child)
            if (found) return found
          }
        }
        return null
      }

      const loopNode = findLoopNode(ir)
      expect(loopNode).not.toBeNull()
      expect(loopNode.type).toBe('loop')
    })

    test('parameter substitution in generated JS', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function MyComponent() {
          const [items, setItems] = createSignal(["a", "b"])
          function renderList(data: string[]) {
            return <ul>{data.map((item, i) => <li key={i}>{item}</li>)}</ul>
          }
          return <div>{renderList(items())}</div>
        }
      `

      const ctx = analyzeComponent(source, 'MyComponent.tsx')
      const ir = jsxToIR(ctx)

      // Find the loop node and verify the array expression was substituted
      function findLoopNode(node: any): any {
        if (node.type === 'loop') return node
        if (node.children) {
          for (const child of node.children) {
            const found = findLoopNode(child)
            if (found) return found
          }
        }
        return null
      }

      const loopNode = findLoopNode(ir)
      expect(loopNode).not.toBeNull()
      // 'data' parameter should be substituted with 'items()'
      expect(loopNode.array).toContain('items()')
    })

    test('function call in conditional branch is inlined', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function MyComponent() {
          const [show, setShow] = createSignal(true)
          function renderContent() {
            return <p>Hello</p>
          }
          return <div>{show() ? renderContent() : <span>Hidden</span>}</div>
        }
      `

      const ctx = analyzeComponent(source, 'MyComponent.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()

      // Find the conditional node
      function findConditional(node: any): any {
        if (node.type === 'conditional') return node
        if (node.children) {
          for (const child of node.children) {
            const found = findConditional(child)
            if (found) return found
          }
        }
        return null
      }

      const cond = findConditional(ir)
      expect(cond).not.toBeNull()
      // whenTrue should be an element (inlined <p>), not an expression
      expect(cond.whenTrue.type).toBe('element')
      expect(cond.whenTrue.tag).toBe('p')
    })
  })

  describe('client JS output', () => {
    test('does not emit inlined function declaration in client JS', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function MyComponent() {
          const [count, setCount] = createSignal(0)
          function renderCount() {
            return <span>{count()}</span>
          }
          return <div onClick={() => setCount(n => n + 1)}>{renderCount()}</div>
        }
      `

      const result = compileJSX(source, 'MyComponent.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // The function 'renderCount' should not appear in client JS
      expect(clientJs!.content).not.toMatch(/\bfunction renderCount\b/)
    })

    test('does not emit inlined arrow function constant in client JS', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function MyComponent() {
          const [count, setCount] = createSignal(0)
          const renderCount = () => <span>{count()}</span>
          return <div onClick={() => setCount(n => n + 1)}>{renderCount()}</div>
        }
      `

      const result = compileJSX(source, 'MyComponent.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()

      // The constant 'renderCount' should not appear in client JS
      expect(clientJs!.content).not.toMatch(/\bconst renderCount\b/)
    })

    test('end-to-end: calendar-style pattern compiles correctly', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        type Week = { days: { date: number; label: string }[] }

        export function Calendar() {
          const [month, setMonth] = createSignal(0)
          const [weeks0] = createSignal<Week[]>([])
          const [weeks1] = createSignal<Week[]>([])

          function renderMonthGrid(weeks: Week[]) {
            return (
              <table>
                <tbody>
                  {weeks.map((week, wi) => (
                    <tr key={wi}>
                      {week.days.map((day, di) => (
                        <td key={di}>{day.label}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }

          return (
            <div>
              <span>Month: {month()}</span>
              {renderMonthGrid(weeks0())}
              {renderMonthGrid(weeks1())}
            </div>
          )
        }
      `

      const result = compileJSX(source, 'Calendar.tsx', { adapter })

      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Inlined function should not appear in client JS
      expect(clientJs!.content).not.toMatch(/\bfunction renderMonthGrid\b/)

      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()
      // Both table instances should appear in the template
      expect(template!.content).toContain('table')
    })
  })

  describe('multi-return JSX function inlining', () => {
    test('if/else helper is inlined as conditional IR', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function StatusDisplay() {
          const [status, setStatus] = createSignal('ok')

          function renderBadge(s: string) {
            if (s === 'error') return <span class="error">Error</span>
            return <span class="ok">OK</span>
          }

          return <div>{renderBadge(status())}</div>
        }
      `

      const ctx = analyzeComponent(source, 'StatusDisplay.tsx')
      expect(ctx.jsxMultiReturnFunctions.has('renderBadge')).toBe(true)

      const ir = jsxToIR(ctx)
      expect(ir).not.toBeNull()

      // Verify IR contains a conditional node (not an opaque expression)
      function findConditional(node: any): any {
        if (node?.type === 'conditional') return node
        for (const child of node?.children ?? []) {
          const found = findConditional(child)
          if (found) return found
        }
        return null
      }
      const cond = findConditional(ir)
      expect(cond).not.toBeNull()
      expect(cond.type).toBe('conditional')

      const result = compileJSX(source, 'StatusDisplay.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!.content
      expect(template).toContain('error')
      expect(template).toContain('OK')
      // Helper function should NOT appear verbatim — it's inlined
      expect(template).not.toMatch(/function renderBadge/)

      // Client JS should not contain the raw helper function with JSX
      const clientJs = result.files.find(f => f.type === 'clientJs')
      if (clientJs) {
        expect(clientJs.content).not.toMatch(/function renderBadge/)
      }
    })

    test('if/else if/else chain inlines to nested conditionals', () => {
      const source = `
        'use client'

        export function Display(props: { level: string }) {
          function renderLevel(lvl: string) {
            if (lvl === 'high') return <span class="high">High</span>
            if (lvl === 'mid') return <span class="mid">Mid</span>
            return <span class="low">Low</span>
          }

          return <div>{renderLevel(props.level)}</div>
        }
      `

      const result = compileJSX(source, 'Display.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!.content
      expect(template).toContain('High')
      expect(template).toContain('Mid')
      expect(template).toContain('Low')
      expect(template).not.toMatch(/function renderLevel/)
    })

    test('guard clause (early return null) is handled', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [show, setShow] = createSignal(true)

          function renderOptional(visible: boolean) {
            if (!visible) return null
            return <strong>Visible</strong>
          }

          return <div>{renderOptional(show())}</div>
        }
      `

      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!.content
      expect(template).toContain('Visible')
      expect(template).not.toMatch(/function renderOptional/)
    })

    test('arrow function with multi-return is inlined', () => {
      const source = `
        'use client'

        export function App(props: { type: string }) {
          const renderIcon = (t: string) => {
            if (t === 'star') return <span>★</span>
            return <span>○</span>
          }

          return <div>{renderIcon(props.type)}</div>
        }
      `

      const ctx = analyzeComponent(source, 'App.tsx')
      expect(ctx.jsxMultiReturnFunctions.has('renderIcon')).toBe(true)

      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!.content
      expect(template).toContain('★')
      expect(template).toContain('○')
    })

    test('param substitution works in both condition and branches', () => {
      const source = `
        'use client'

        export function App(props: { name: string }) {
          function greet(who: string) {
            if (who === 'world') return <span>Hello World!</span>
            return <span>Hi {who}!</span>
          }

          return <div>{greet(props.name)}</div>
        }
      `

      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!.content
      // The param 'who' should be replaced with 'props.name' in the condition
      expect(template).toContain('props.name')
      expect(template).not.toMatch(/\bwho\b/)
    })

    test('switch/case helper is inlined as nested conditional', () => {
      const source = `
        'use client'

        export function App(props: { icon: string }) {
          function renderIcon(name: string) {
            switch (name) {
              case 'home': return <span>🏠</span>
              case 'star': return <span>⭐</span>
              default: return <span>?</span>
            }
          }

          return <div>{renderIcon(props.icon)}</div>
        }
      `

      const ctx = analyzeComponent(source, 'App.tsx')
      expect(ctx.jsxMultiReturnFunctions.has('renderIcon')).toBe(true)
      const info = ctx.jsxMultiReturnFunctions.get('renderIcon')!
      expect(info.branches).toHaveLength(2)
      expect(info.fallback).not.toBeNull()
      expect(info.switchDiscriminant).toBeDefined()

      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!.content
      expect(template).toContain('🏠')
      expect(template).toContain('⭐')
      expect(template).toContain('?')
      expect(template).not.toMatch(/function renderIcon/)
    })

    test('switch with null default is handled', () => {
      const source = `
        'use client'

        export function App(props: { status: string }) {
          function renderStatus(s: string) {
            switch (s) {
              case 'ok': return <span class="ok">OK</span>
              default: return null
            }
          }

          return <div>{renderStatus(props.status)}</div>
        }
      `

      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')!.content
      expect(template).toContain('OK')
      expect(template).not.toMatch(/function renderStatus/)
    })

    test('switch with side-effect discriminant is NOT inlined', () => {
      const source = `
        'use client'

        export function App() {
          function getValue(): string { return 'a' }
          function renderByValue(v: string) {
            switch (getValue()) {
              case 'a': return <span>A</span>
              default: return <span>B</span>
            }
          }

          return <div>{renderByValue('x')}</div>
        }
      `

      const ctx = analyzeComponent(source, 'App.tsx')
      // Should NOT be registered because discriminant is a call expression
      expect(ctx.jsxMultiReturnFunctions.has('renderByValue')).toBe(false)
    })
  })
})
