/**
 * BarefootJS Compiler - Signal index-access and late-extraction patterns.
 *
 * Verifies that the analyzer + codegen recognise these alternatives to the
 * canonical `const [getter, setter] = createSignal(init)` destructuring:
 *
 *   A) Direct access:    const count = createSignal(0)[0]
 *   B) Getter-only:      const [count]  = createSignal(0)   (already covered
 *                         by signal-partial-destructure.test.ts but retested
 *                         here for completeness)
 *   C) Late extraction:  const s = createSignal(0); const v = s[0]
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('signal index-access — pattern A (direct)', () => {
  test('getter-only direct index access compiles cleanly', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const count = createSignal(42)[0]
        return <div>{count()}</div>
      }
    `
    const result = compileJSXSync(source, 'Counter.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Client JS must emit the canonical destructuring form so the
    // runtime sees a real signal, not a leftover `createSignal(...)[0]`
    // call.
    expect(clientJs!.content).toContain('[count] = createSignal(')
    expect(clientJs!.content).not.toContain('createSignal(42)[0]')
  })

  test('setter-only direct index access synthesizes an unused getter', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const setCount = createSignal(0)[1]
        return <button onClick={() => setCount(1)}>bump</button>
      }
    `
    const result = compileJSXSync(source, 'Counter.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Both getter and setter must be bound — the synthesized getter name
    // is visible in the client JS but unused in user code.
    expect(clientJs!.content).toMatch(/\[__bf_unused_getter_\d+, setCount\] = createSignal\(/)
  })

  test('SSR template inlines the initial value', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Display() {
        const label = createSignal('hi')[0]
        return <span>{label()}</span>
      }
    `
    const result = compileJSXSync(source, 'Display.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find((f) => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    expect(template!.content).toContain('hi')
    expect(template!.content).not.toContain('createSignal')
  })
})

describe('signal index-access — pattern C (late extraction)', () => {
  test('getter-only late extraction compiles to canonical form', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const s = createSignal(7)
        const count = s[0]
        return <div>{count()}</div>
      }
    `
    const result = compileJSXSync(source, 'Counter.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('[count] = createSignal(7)')
    // The bridge identifier `s` must not leak into the output — its job
    // ends once we know where getter/setter live.
    expect(clientJs!.content).not.toContain('const s = createSignal')
    expect(clientJs!.content).not.toContain('const count = s[0]')
  })

  test('both accessors resolved independently', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const s = createSignal(0)
        const count = s[0]
        const setCount = s[1]
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `
    const result = compileJSXSync(source, 'Counter.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('[count, setCount] = createSignal(0)')
  })

  test('accessors declared in reverse order (setter first) still pair correctly', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const s = createSignal(0)
        const setCount = s[1]
        const count = s[0]
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `
    const result = compileJSXSync(source, 'Counter.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('[count, setCount] = createSignal(0)')
  })

  test('unrelated tuple-like access is not captured as a signal', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Things() {
        const [count] = createSignal(0)
        const items = [10, 20, 30]
        const first = items[0]
        return <div>{count()} {first}</div>
      }
    `
    const result = compileJSXSync(source, 'Things.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Only one signal (the canonical destructured one); `items` must
    // round-trip as an ordinary local array — no phantom signal.
    const signalCount = (clientJs!.content.match(/createSignal\(/g) ?? []).length
    expect(signalCount).toBe(1)
  })
})

describe('signal index-access — mixed patterns in one component', () => {
  test('canonical destructuring + direct index + late extraction coexist', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Mixed() {
        const [a, setA] = createSignal(1)
        const b = createSignal(2)[0]
        const pair = createSignal(3)
        const c = pair[0]
        return <div>{a()} {b()} {c()} <button onClick={() => setA(a() + 1)}>+</button></div>
      }
    `
    const result = compileJSXSync(source, 'Mixed.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content
    expect(js).toContain('[a, setA] = createSignal(1)')
    expect(js).toContain('[b] = createSignal(2)')
    expect(js).toContain('[c] = createSignal(3)')
  })
})
