/**
 * Regression tests for bug #930/bug-2: bare imperative statements at the
 * top level of a `"use client"` component body must be emitted into the
 * component's init function, not silently dropped.
 *
 * Prior to the fix, anything that wasn't a recognized reactive primitive
 * (createSignal, createEffect, createMemo, onMount, onCleanup, ...) or a JSX
 * return disappeared from the emitted client JS. The only symptom at runtime
 * was "the listener I set up never runs" — a classic silent-data-loss bug.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('Component-body top-level imperative statements (#930, bug-2)', () => {
  test('preserves a top-level `if` guard with a side-effecting call', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Badge() {
        const [count, setCount] = createSignal(0)
        if (typeof window !== 'undefined') {
          window.addEventListener('custom-event', () => setCount(42))
        }
        return <span>{count()}</span>
      }
    `

    const result = compileJSXSync(source, 'Badge.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // The entire statement survives verbatim
    expect(clientJs!.content).toContain("typeof window !== 'undefined'")
    expect(clientJs!.content).toContain("window.addEventListener('custom-event'")
  })

  test('preserves multiple top-level statements in source order', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Widget() {
        const [value, setValue] = createSignal(0)
        if (typeof window !== 'undefined') {
          window.addEventListener('first', () => setValue(1))
        }
        if (typeof window !== 'undefined') {
          window.addEventListener('second', () => setValue(2))
        }
        return <span>{value()}</span>
      }
    `

    const result = compileJSXSync(source, 'Widget.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    const firstIdx = clientJs.indexOf("'first'")
    const secondIdx = clientJs.indexOf("'second'")
    expect(firstIdx).toBeGreaterThan(-1)
    expect(secondIdx).toBeGreaterThan(-1)
    expect(firstIdx).toBeLessThan(secondIdx)
  })

  test('top-level statements can reference signal setters', () => {
    // The statement runs inside init(), so it shares the same scope as
    // the signal declarations and can legally call setCount.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Live() {
        const [n, setN] = createSignal(0)
        if (typeof window !== 'undefined') {
          window.addEventListener('bump', () => setN(n() + 1))
        }
        return <span>{n()}</span>
      }
    `

    const result = compileJSXSync(source, 'Live.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    // The statement is inside init (signals exist) and references setN / n.
    expect(clientJs).toContain('setN')
    expect(clientJs).toContain("'bump'")
    // And it must appear AFTER the signal declaration, not before it.
    const signalIdx = clientJs.indexOf('createSignal')
    const listenerIdx = clientJs.indexOf("'bump'")
    expect(signalIdx).toBeLessThan(listenerIdx)
  })

  test('bare expression statements (no if guard) are preserved', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Logger() {
        const [v, setV] = createSignal(0)
        console.log('init-time log')
        return <span>{v()}</span>
      }
    `

    const result = compileJSXSync(source, 'Logger.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain("console.log('init-time log')")
  })

  test('try/catch blocks at top level are preserved', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Safe() {
        const [s, setS] = createSignal('')
        try {
          setS(localStorage.getItem('k') || '')
        } catch (e) {
          setS('')
        }
        return <span>{s()}</span>
      }
    `

    const result = compileJSXSync(source, 'Safe.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain('try')
    expect(clientJs).toContain("localStorage.getItem('k')")
    expect(clientJs).toContain('catch')
  })
})

describe('Init statements referencing module-scope declarations (#933)', () => {
  test('module-level `let` written by an init statement is hoisted into client JS', () => {
    // Regression: the bug-2 fix preserved `currentScopeId = props.scopeId`
    // but dropped the `let currentScopeId` declaration. Writing to an
    // undeclared identifier in ESM strict mode throws ReferenceError and
    // breaks hydration.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      let currentScopeId: string | undefined = undefined

      export function Scoped(props: { scopeId?: string }) {
        currentScopeId = props.scopeId
        const [n, setN] = createSignal(0)
        return <span>{n()}</span>
      }
    `

    const result = compileJSXSync(source, 'Scoped.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    // Declaration must exist at module scope before the init function so
    // the subsequent assignment `currentScopeId = ...` resolves.
    expect(clientJs).toContain('currentScopeId')
    const declIdx = clientJs.search(/var\s+currentScopeId/)
    const initFnIdx = clientJs.indexOf('export function initScoped')
    expect(declIdx).toBeGreaterThan(-1)
    expect(initFnIdx).toBeGreaterThan(-1)
    expect(declIdx).toBeLessThan(initFnIdx)
  })

  test('module-level `const` read by an init statement is preserved', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      const STORAGE_KEY = 'my-app:v1'

      export function Persisted() {
        const [v, setV] = createSignal('')
        try {
          setV(localStorage.getItem(STORAGE_KEY) || '')
        } catch (e) {}
        return <span>{v()}</span>
      }
    `

    const result = compileJSXSync(source, 'Persisted.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain('STORAGE_KEY')
    const declIdx = clientJs.search(/var\s+STORAGE_KEY/)
    expect(declIdx).toBeGreaterThan(-1)
  })

  test('init statement touching only locally-declared names does not hoist anything new', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Local() {
        const [n, setN] = createSignal(0)
        if (typeof window !== 'undefined') {
          window.addEventListener('x', () => setN(1))
        }
        return <span>{n()}</span>
      }
    `

    const result = compileJSXSync(source, 'Local.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    // No stray module-level var hoisting for builtins / component-local names.
    expect(clientJs).not.toMatch(/var\s+window\s*=/)
    expect(clientJs).not.toMatch(/var\s+setN\s*=/)
  })

  test('unresolved free identifier in an init statement emits BF052', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Broken(props: { v?: string }) {
        unknownGlobal = props.v
        const [n, setN] = createSignal(0)
        return <span>{n()}</span>
      }
    `

    const result = compileJSXSync(source, 'Broken.tsx', { adapter })
    const bf052 = result.errors.find(e => e.code === 'BF052')
    expect(bf052).toBeDefined()
    expect(bf052!.severity).toBe('error')
    expect(bf052!.message.toLowerCase()).toContain('unknownglobal')
  })
})
