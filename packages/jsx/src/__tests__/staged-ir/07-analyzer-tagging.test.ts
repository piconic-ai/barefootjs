/**
 * Pins the **analyzer scope-tagging contract**: every collected
 * declaration carries an `origin` field that records its authoring
 * Scope and Phase. relocate() (P3) consumes this rather than
 * re-inferring scope from textual hints.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../../analyzer'

describe('analyzer: collected declarations carry origin info', () => {
  test('module-level const → origin.scope = "module"', () => {
    const ctx = analyzeComponent(`
      const TIMEOUT = 5000
      export function Foo() {
        return <div data-t={TIMEOUT}>hi</div>
      }
    `, 'Foo.tsx')
    const c = ctx.localConstants.find(c => c.name === 'TIMEOUT')
    expect(c?.origin?.scope).toBe('module')
    expect(c?.origin?.phase).toBe('compile')
  })

  test('init-body const → origin.scope = "init"', () => {
    const ctx = analyzeComponent(`
      'use client'
      export function Foo() {
        const greeting = 'hello'
        return <div>{greeting}</div>
      }
    `, 'Foo.tsx')
    const c = ctx.localConstants.find(c => c.name === 'greeting')
    expect(c?.origin?.scope).toBe('init')
    expect(c?.origin?.phase).toBe('hydrate')
  })

  test('body-destructured-from-props → origin.scope = "init"', () => {
    const ctx = analyzeComponent(`
      'use client'
      interface Props { name: string; count: number }
      export function Foo(props: Props) {
        const { name, count } = props
        return <div data-n={name}>{count}</div>
      }
    `, 'Foo.tsx')
    const name = ctx.localConstants.find(c => c.name === 'name')
    const count = ctx.localConstants.find(c => c.name === 'count')
    expect(name?.origin?.scope).toBe('init')
    expect(count?.origin?.scope).toBe('init')
  })

  test('module-level function carries declarationKind = "function" + isModule', () => {
    const ctx = analyzeComponent(`
      function helper() { return 42 }
      export function Foo() {
        return <div data-h={helper()}>hi</div>
      }
    `, 'Foo.tsx')
    const f = ctx.localFunctions.find(f => f.name === 'helper')
    expect(f?.isModule).toBe(true)
    expect(f?.declarationKind).toBe('function')
  })

  test('async function declarations preserve isAsync + declarationKind', () => {
    // Crucial for #1130: when emit later rewrites this to a const arrow,
    // it MUST consult declarationKind from IR, not re-derive from text.
    const ctx = analyzeComponent(`
      'use client'
      export function Foo() {
        async function fetchItems() {
          return fetch('/x')
        }
        fetchItems()
        return <div>hi</div>
      }
    `, 'Foo.tsx')
    const f = ctx.localFunctions.find(f => f.name === 'fetchItems')
    expect(f?.declarationKind).toBe('function')
    expect(f?.isAsync).toBe(true)
  })

  test('init statements carry origin.scope = "init"', () => {
    const ctx = analyzeComponent(`
      'use client'
      export function Foo() {
        if (typeof window !== 'undefined') {
          console.log('hi')
        }
        return <div>hi</div>
      }
    `, 'Foo.tsx')
    expect(ctx.initStatements.length).toBeGreaterThan(0)
    expect(ctx.initStatements[0]?.origin?.scope).toBe('init')
  })
})
