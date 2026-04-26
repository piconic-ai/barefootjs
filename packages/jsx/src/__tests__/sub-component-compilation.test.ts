/**
 * BarefootJS Compiler - Sub-component compilation (#786)
 *
 * Verifies that non-exported function components (sub-components) defined
 * in the same file as the main exported component have their JSX properly
 * compiled to template literals + bindEvents, not raw jsxDEV calls.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { listComponentFunctions } from '../analyzer'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

const adapter = new TestAdapter()

describe('sub-component compilation (#786)', () => {
  // ==========================================================================
  // Pattern 1: Top-level non-exported PascalCase function component
  // ==========================================================================
  describe('top-level non-exported function component', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Item { id: string; name: string }

      function ItemRow({ item, onDelete }: { item: Item; onDelete: (id: string) => void }) {
        return (
          <div className="row">
            <span>{item.name}</span>
            <button onClick={() => onDelete(item.id)}>Delete</button>
          </div>
        )
      }

      export function ItemList(props: { items: Item[] }) {
        const [items, setItems] = createSignal<Item[]>(props.items)
        const handleDelete = (id: string) => {
          setItems(items().filter((i: Item) => i.id !== id))
        }
        return (
          <div>
            {items().map((item: Item) => (
              <ItemRow key={item.id} item={item} onDelete={handleDelete} />
            ))}
          </div>
        )
      }
    `

    test('listComponentFunctions returns both exported and non-exported components', () => {
      const names = listComponentFunctions(source, 'ItemList.tsx')
      expect(names).toContain('ItemRow')
      expect(names).toContain('ItemList')
    })

    test('client JS has no raw jsxDEV calls', () => {
      const result = compileJSXSync(source, 'ItemList.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).not.toMatch(/jsxDEV/)
      expect(clientJs!.content).not.toMatch(/jsx\(/)
      expect(clientJs!.content).toContain('initItemRow')
      expect(clientJs!.content).toContain('initItemList')
    })

    test('non-exported component should not have export keyword in Hono template', () => {
      const honoAdapter = new HonoAdapter()
      const result = compileJSXSync(source, 'ItemList.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()

      // ItemRow should NOT be exported
      expect(template!.content).not.toMatch(/export function ItemRow/)
      expect(template!.content).toMatch(/^function ItemRow/m)
      // ItemList SHOULD be exported
      expect(template!.content).toMatch(/export function ItemList/)
    })

    test('non-exported component should not have export keyword in test template', () => {
      const result = compileJSXSync(source, 'ItemList.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()

      expect(template!.content).not.toMatch(/export function ItemRow/)
      expect(template!.content).toMatch(/export function ItemList/)
    })
  })

  // ==========================================================================
  // Pattern 2: Top-level non-exported arrow function component
  // ==========================================================================
  describe('top-level non-exported arrow function component', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      const Badge = ({ text }: { text: string }) => (
        <span className="badge" onClick={() => alert(text)}>{text}</span>
      )

      export function Counter(props: { label: string }) {
        const [count, setCount] = createSignal(0)
        return (
          <div>
            <Badge text={props.label} />
            <button onClick={() => setCount(n => n + 1)}>{count()}</button>
          </div>
        )
      }
    `

    test('listComponentFunctions returns both components', () => {
      const names = listComponentFunctions(source, 'Counter.tsx')
      expect(names).toContain('Badge')
      expect(names).toContain('Counter')
    })

    test('client JS has no raw jsxDEV calls', () => {
      const result = compileJSXSync(source, 'Counter.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).not.toMatch(/jsxDEV/)
      expect(clientJs!.content).toContain('initBadge')
      expect(clientJs!.content).toContain('initCounter')
    })
  })

  // ==========================================================================
  // Pattern 3: Non-exported stateless component (no events, no signals)
  // ==========================================================================
  describe('non-exported stateless component', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function Label({ text }: { text: string }) {
        return <span className="label">{text}</span>
      }

      export function Counter(props: { label: string }) {
        const [count, setCount] = createSignal(0)
        return (
          <div>
            <Label text={props.label} />
            <button onClick={() => setCount(n => n + 1)}>{count()}</button>
          </div>
        )
      }
    `

    test('client JS has no raw jsxDEV calls', () => {
      const result = compileJSXSync(source, 'Counter.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).not.toMatch(/jsxDEV/)
    })
  })

  // ==========================================================================
  // Pattern 4: Non-PascalCase helper with multiple JSX returns (BF045 warning)
  // ==========================================================================
  describe('non-PascalCase helper with conditional JSX returns', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function renderStatus(status: string) {
        if (status === 'error') {
          return <span className="error">Error</span>
        }
        return <span className="ok">OK</span>
      }

      export function StatusDisplay(props: { status: string }) {
        const [status, setStatus] = createSignal(props.status)
        return (
          <div>
            {renderStatus(status())}
            <button onClick={() => setStatus('error')}>Set Error</button>
          </div>
        )
      }
    `

    test('compiles without errors', () => {
      const result = compileJSXSync(source, 'StatusDisplay.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).not.toMatch(/jsxDEV/)
    })
  })

  // ==========================================================================
  // Pattern 5: export { SubComponent } re-export pattern
  // ==========================================================================
  describe('re-exported sub-component via export { Name }', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function Badge({ text }: { text: string }) {
        return <span className="badge" onClick={() => alert(text)}>{text}</span>
      }

      function Counter(props: { label: string }) {
        const [count, setCount] = createSignal(0)
        return (
          <div>
            <Badge text={props.label} />
            <button onClick={() => setCount(n => n + 1)}>{count()}</button>
          </div>
        )
      }

      export { Counter, Badge }
    `

    test('re-exported components have export keyword, non-exported do not', () => {
      const honoAdapter = new HonoAdapter()
      const result = compileJSXSync(source, 'Counter.tsx', { adapter: honoAdapter })

      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()

      // Both should be exported via export { Name }
      expect(template!.content).toMatch(/export function Counter/)
      expect(template!.content).toMatch(/export function Badge/)
    })
  })
})
