import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

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
    expect(clientJs!.content).toContain('_p.initial ?? 0')
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
