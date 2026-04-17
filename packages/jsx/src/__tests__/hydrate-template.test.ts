import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('hydrate() template generation for signal-bearing components', () => {
  test('Counter: gets CSR fallback template for cross-file conditional use', () => {
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client-runtime'
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

    // All components get CSR fallback templates for cross-file conditional use
    expect(content).toMatch(/hydrate\('Counter',.*template:/)
  })

  test('ItemList: gets CSR fallback template for cross-file conditional use', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'
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

    // All components get CSR fallback templates for cross-file conditional use
    expect(clientJs!.content).toMatch(/hydrate\('ItemList',.*template:/)
  })

  test('child stateless component gets template, parent also gets CSR fallback', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

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

    // Parent also gets CSR fallback template for cross-file conditional use
    expect(content).toMatch(/hydrate\('Parent',.*template:/)
  })

  test('component used as child gets CSR fallback template', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

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

    // Dashboard also gets CSR fallback template for cross-file conditional use
    expect(content).toMatch(/hydrate\('Dashboard',.*template:/)
  })

  test('client-only expression: gets CSR fallback template for cross-file conditional use', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'
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

    // All components get CSR fallback templates for cross-file conditional use
    expect(clientJs!.content).toMatch(/hydrate\('Filtered',.*template:/)
  })

  test('string literals in CSS classes are not corrupted by constant inlining', () => {
    // Use a parent+child scenario so the child (Icon) gets a CSR fallback template,
    // which exercises the transformExpr() string-literal protection path.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'
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

  test('block-body memo with local decls: wraps body in IIFE instead of dropping decls', () => {
    // Regression for a bug surfaced by the Dashboard Builder block:
    // createMemo(() => { const i = sig(); return i < 0 ? 'a' : items()[i] ? items()[i].label : 'a' })
    // used to emit only the trailing return expression into the SSR template,
    // leaving `i` unbound at runtime. The fix keeps the whole body in scope
    // by wrapping block bodies with local decls in an IIFE.
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client-runtime'
      interface Props { initialBars: { label: string; value: number }[] }
      export function ChartWidget(props: Props) {
        const [bars] = createSignal(props.initialBars)
        const [selectedIndex] = createSignal(-1)
        const selectedLabel = createMemo(() => {
          const i = selectedIndex()
          if (i < 0) return 'Total'
          const b = bars()[i]
          return b ? b.label : 'Total'
        })
        return <div className="chart-selected-label">{selectedLabel()}</div>
      }
    `
    const result = compileJSXSync(source, 'ChartWidget.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // The hydrate template for ChartWidget must contain the full IIFE-wrapped
    // memo body, not just the trailing `return` expression. Looking for the
    // `const b =` decl inside the template literal is the strongest signal
    // that local bindings survived inlining.
    const templateMatch = content.match(/hydrate\('ChartWidget',\s*\{[^`]*template:[^`]*`([\s\S]*?)`\s*\}/)
    expect(templateMatch).toBeTruthy()
    const template = templateMatch![1]
    expect(template).toContain('const i =')
    expect(template).toContain('const b =')
    // Must be wrapped in an IIFE form so bindings stay in scope at template eval time
    expect(template).toMatch(/\(\(\)\s*=>\s*\{[\s\S]*const b =/)
  })
})
