/**
 * Regression test for #1131: inline `type` aliases and `interface`
 * declarations placed inside an arrow function body (or any nested
 * function body) must be stripped from the emitted client JS.
 *
 * At the top level the analyzer collects `type X = ...` and
 * `interface X { ... }` via dedicated handlers and never includes the
 * statement text in `getJS()` output. But when those declarations appear
 * inside a function body, the body itself is reproduced verbatim via
 * `ctx.getJS(node.body)` and the AST-driven type-stripper had no rule
 * for `TypeAliasDeclaration` / `InterfaceDeclaration` — so the
 * TS-only statements survived into the emitted client JS and produced
 * a runtime SyntaxError.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('inline type / interface declarations inside function bodies (#1131)', () => {
  test('strips an inline `type` alias inside an arrow function body', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Issue {
        id: string
      }

      interface Props {
        org: string
      }

      export function DeskCanvas(props: Props) {
        const [count, setCount] = createSignal(0)
        const fetchItems = async (forceRefresh = false) => {
          type ItemsResponse = {
            items: Issue[]
          }
          let data: ItemsResponse | null = null
          data = null
          return data
        }
        return <div onClick={() => fetchItems().then(() => setCount(count() + 1))}>{count()}</div>
      }
    `

    const result = compileJSXSync(source, 'DeskCanvas.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''

    // The TS-only `type ItemsResponse = { ... }` declaration must be gone.
    expect(content).not.toMatch(/type\s+ItemsResponse\b/)
    // The surrounding real code must survive — note the `: ItemsResponse | null`
    // type annotation should also be stripped, leaving `let data = null`.
    expect(content).toMatch(/let\s+data\s*=\s*null/)
  })

  test('strips a nested `interface` declaration inside a regular function body', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Page() {
        const [count, setCount] = createSignal(0)
        function compute() {
          interface InnerShape {
            value: number
          }
          let snapshot: InnerShape | null = null
          snapshot = null
          return snapshot
        }
        return <button onClick={() => { compute(); setCount(count() + 1) }}>{count()}</button>
      }
    `

    const result = compileJSXSync(source, 'Page.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''

    // The inline `interface InnerShape { ... }` must be erased.
    expect(content).not.toMatch(/interface\s+InnerShape\b/)
    // The surrounding code (with type annotation stripped) must survive.
    expect(content).toMatch(/let\s+snapshot\s*=\s*null/)
  })

  test('strips a deeply nested `type` alias (arrow inside arrow)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Nested() {
        const [count, setCount] = createSignal(0)
        const outer = async () => {
          const inner = async () => {
            type DeepResponse = {
              ok: boolean
            }
            let result: DeepResponse | null = null
            result = null
            return result
          }
          return inner()
        }
        return <div onClick={() => outer().then(() => setCount(count() + 1))}>{count()}</div>
      }
    `

    const result = compileJSXSync(source, 'Nested.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''

    expect(content).not.toMatch(/type\s+DeepResponse\b/)
    expect(content).toMatch(/let\s+result\s*=\s*null/)
  })
})
