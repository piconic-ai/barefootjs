/**
 * Pins the **TS-only construct erasure contract**: type aliases, interfaces,
 * `as` casts, satisfies, non-null assertions — none of these are valid at
 * runtime. They MUST be erased at every nesting depth, not just at module
 * top-level.
 *
 * Today's `strip-types.ts` walked only top-level (#1131 surfaced this when
 * an inline `type` survived inside an arrow body). The staged-IR refactor
 * folds erasure into the same AST walk that builds IR, so depth is
 * structural, not policy-driven.
 *
 * Covers issue shape #1131.
 */

import { describe, test, expect } from 'bun:test'
import { compile, expectValidJs } from './helpers'

describe('Type stripping: TS-only constructs erased at all nesting depths', () => {
  test('inline type alias inside an arrow body is erased', () => {
    const { clientJs, errors } = compile(`
      'use client'

      interface Issue { id: string; title: string }
      interface Props { url: string }

      export function DeskCanvas(props: Props) {
        const fetchItems = async (forceRefresh = false) => {
          type ItemsResponse = {
            items: Issue[]
            cursor: string | null
          }
          let data: ItemsResponse | null = null
          const res = await fetch(props.url)
          data = await res.json()
          return data
        }
        fetchItems()
        return <div>hi</div>
      }
    `)

    expect(errors).toEqual([])
    expect(clientJs).not.toMatch(/type\s+ItemsResponse/)
    expectValidJs(clientJs)
  })

  test('interface declaration inside a function body is erased', () => {
    const { clientJs, errors } = compile(`
      'use client'

      export function Foo() {
        function build() {
          interface LocalShape { x: number }
          const value: LocalShape = { x: 1 }
          return value
        }
        build()
        return <div>hi</div>
      }
    `)

    expect(errors).toEqual([])
    expect(clientJs).not.toMatch(/interface\s+LocalShape/)
    expectValidJs(clientJs)
  })

  test('nested type aliases at depth ≥ 3 are erased', () => {
    const { clientJs, errors } = compile(`
      'use client'

      export function Foo() {
        const outer = () => {
          const middle = () => {
            const inner = () => {
              type Deep = { v: number }
              const d: Deep = { v: 1 }
              return d.v
            }
            return inner()
          }
          return middle()
        }
        outer()
        return <div>hi</div>
      }
    `)

    expect(errors).toEqual([])
    expect(clientJs).not.toMatch(/type\s+Deep/)
    expectValidJs(clientJs)
  })

  test('type-only annotations on locals are stripped (but values kept)', () => {
    const { clientJs, errors } = compile(`
      'use client'

      export function Foo() {
        const handle = () => {
          const n: number = 1
          const s: string = 'x'
          const obj: { a: number } = { a: 2 }
          return [n, s, obj.a]
        }
        handle()
        return <div>hi</div>
      }
    `)

    expect(errors).toEqual([])
    // Type annotations gone, values preserved.
    expect(clientJs).not.toMatch(/:\s*number\b/)
    expect(clientJs).toMatch(/const\s+n\s*=\s*1/)
    expectValidJs(clientJs)
  })
})
