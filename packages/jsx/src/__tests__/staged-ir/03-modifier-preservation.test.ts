/**
 * Pins the **declaration modifier contract**: when the compiler rewrites
 * a declaration form (e.g. `function` → `const arrow`), every modifier
 * that affects runtime semantics MUST be preserved.
 *
 * Today's emit reconstructs declarations by stringifying-and-stitching,
 * which silently dropped `async` (#1130). The staged-IR refactor stores
 * modifiers as IR fields, so emit reads them rather than re-deriving.
 *
 * Covers issue shape #1130. Also asserts the emitted JS PARSES — a syntax
 * regression here is the proximate failure mode.
 */

import { describe, test, expect } from 'bun:test'
import { compile, expectValidJs } from './helpers'

describe('Modifier preservation: async / generator / etc. survive form rewrites', () => {
  test('async function declared in init body keeps async modifier', () => {
    const { clientJs, initBody, errors } = compile(`
      'use client'

      interface Props { roomId: string }

      export function DeskCanvas(props: Props) {
        async function fetchItems(forceRefresh = false) {
          const res = await fetch('/api?id=' + props.roomId)
          return res.json()
        }
        fetchItems()
        return <div data-room={props.roomId}>hi</div>
      }
    `)

    expect(errors).toEqual([])
    // Either `async function fetchItems` or `const fetchItems = async (...) =>`
    // is acceptable — what's NOT acceptable is `const fetchItems = (...) =>`
    // with `await` inside, which is a SyntaxError.
    const hasAsync = /async\s+function\s+fetchItems/.test(initBody) ||
                     /const\s+fetchItems\s*=\s*async\s*\(/.test(initBody)
    expect(hasAsync).toBe(true)
    expectValidJs(clientJs)
  })

  test('async arrow in init body keeps async modifier', () => {
    const { clientJs, initBody, errors } = compile(`
      'use client'

      export function Foo(props: { url: string }) {
        const fetchData = async () => {
          const res = await fetch(props.url)
          return res.json()
        }
        fetchData()
        return <div>hi</div>
      }
    `)

    expect(errors).toEqual([])
    expect(initBody).toMatch(/async\s*\(\s*\)\s*=>/)
    expectValidJs(clientJs)
  })

  test('await inside async function body is preserved', () => {
    const { clientJs, errors } = compile(`
      'use client'

      export function Foo(props: { url: string }) {
        async function load() {
          const r = await fetch(props.url)
          const j = await r.json()
          return j
        }
        load()
        return <div>hi</div>
      }
    `)

    expect(errors).toEqual([])
    expect(clientJs).toMatch(/await\s+fetch/)
    expect(clientJs).toMatch(/await\s+r\.json/)
    expectValidJs(clientJs)
  })
})
