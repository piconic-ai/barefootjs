/**
 * Tests for BF023 (MISSING_KEY_IN_LIST) and BF024 (MISSING_KEY_IN_NESTED_LIST).
 *
 * BF023 covers three cases for outer .map() callbacks:
 *   a-1: key prop entirely absent
 *   a-2: key prop present but literal null / undefined
 *   a-3: key prop present but its static type may be null / undefined
 *
 * BF024 fires with the same logic for .map() inside another .map().
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { ErrorCodes } from '../errors'

const adapter = new TestAdapter()

function compile(source: string, filename = 'Test.tsx') {
  return compileJSX(source, filename, { adapter })
}

function errorsFor(code: string, source: string) {
  const result = compile(source)
  return result.errors.filter((e) => e.code === code)
}

// ---------------------------------------------------------------------------
// BF023 — outer map, missing or invalid key
// ---------------------------------------------------------------------------

describe('BF023 — MISSING_KEY_IN_LIST', () => {
  test('a-1: key prop absent raises BF023', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function List() {
        const [items] = createSignal<string[]>([])
        return <ul>{items().map(item => <li>{item}</li>)}</ul>
      }
    `
    const errs = errorsFor(ErrorCodes.MISSING_KEY_IN_LIST, source)
    expect(errs).toHaveLength(1)
    expect(errs[0].severity).toBe('error')
    expect(errs[0].suggestion?.message).toContain('key prop')
  })

  test('a-1: key absent on component root raises BF023', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Item({ label }: { label: string }) { return <li>{label}</li> }
      export function List() {
        const [items] = createSignal<string[]>([])
        return <ul>{items().map(item => <Item label={item} />)}</ul>
      }
    `
    const errs = errorsFor(ErrorCodes.MISSING_KEY_IN_LIST, source)
    expect(errs).toHaveLength(1)
    expect(errs[0].severity).toBe('error')
  })

  // The literal `null` / `undefined` cases used to raise BF023 with a
  // generic "missing key" message. Per #1244 catalog "key={0}, key={false},
  // key={null}" the user-explicit literal value is now accepted —
  // `mapArray`'s `String()` coercion produces `"null"` / `"undefined"`
  // as the per-item key, matching React's runtime-warn-only stance.
  // The `nullable-type` check below (test a-3) is preserved for
  // INFERRED nullability (`item.id` where `id?: string`).
  test('a-2: key={undefined} literal compiles without BF023', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function List() {
        const [items] = createSignal<string[]>([])
        return <ul>{items().map(item => <li key={undefined}>{item}</li>)}</ul>
      }
    `
    const errs = errorsFor(ErrorCodes.MISSING_KEY_IN_LIST, source)
    expect(errs).toHaveLength(0)
  })

  test('a-2: key={null} literal compiles without BF023', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function List() {
        const [items] = createSignal<string[]>([])
        return <ul>{items().map(item => <li key={null}>{item}</li>)}</ul>
      }
    `
    const errs = errorsFor(ErrorCodes.MISSING_KEY_IN_LIST, source)
    expect(errs).toHaveLength(0)
  })

  test('a-3: key with inferred-nullable type inside a ternary still raises BF023', () => {
    // Regression guard for #1244: the original "accept literal null/undefined"
    // PR (#1358) skipped the type-based nullable check for ALL ConditionalExpression
    // keys, which silently dropped legitimate inferred-nullable diagnostics
    // on ternary branches. The bypass must trigger ONLY when at least one
    // branch is an explicit `null` / `undefined` literal — i.e. the user
    // deliberately opted into a null key. Otherwise the type-driven check
    // still applies.
    const source = `
      interface Item { id: string; fallback?: string; cond: boolean }
      export function List({ items }: { items: Item[] }) {
        return <ul>{items.map(item => <li key={item.cond ? item.id : item.fallback}>{item.id}</li>)}</ul>
      }
    `
    const errs = errorsFor(ErrorCodes.MISSING_KEY_IN_LIST, source)
    expect(errs).toHaveLength(1)
    expect(errs[0].suggestion?.message).toContain('non-null assertion')
  })

  test('a-3: key type includes undefined raises BF023', () => {
    // Use a plain prop-typed component so @barefootjs/client is not needed.
    // The checker resolves item.id as `string | undefined` from the interface.
    const source = `
      interface Item { id?: string; label: string }
      export function List({ items }: { items: Item[] }) {
        return <ul>{items.map(item => <li key={item.id}>{item.label}</li>)}</ul>
      }
    `
    const errs = errorsFor(ErrorCodes.MISSING_KEY_IN_LIST, source)
    expect(errs).toHaveLength(1)
    expect(errs[0].severity).toBe('error')
    expect(errs[0].suggestion?.message).toContain('non-null assertion')
  })

  test('valid: key is a non-nullable string field — no error', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function List() {
        const [items] = createSignal<{ id: string; label: string }[]>([])
        return <ul>{items().map(item => <li key={item.id}>{item.label}</li>)}</ul>
      }
    `
    const result = compile(source)
    const errs = result.errors.filter(
      (e) => e.code === ErrorCodes.MISSING_KEY_IN_LIST || e.code === ErrorCodes.MISSING_KEY_IN_NESTED_LIST,
    )
    expect(errs).toHaveLength(0)
  })

  test('valid: key is a number index — no error', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function List() {
        const [items] = createSignal<string[]>([])
        return <ul>{items().map((item, i) => <li key={i}>{item}</li>)}</ul>
      }
    `
    const result = compile(source)
    const errs = result.errors.filter(
      (e) => e.code === ErrorCodes.MISSING_KEY_IN_LIST || e.code === ErrorCodes.MISSING_KEY_IN_NESTED_LIST,
    )
    expect(errs).toHaveLength(0)
  })

  test('valid: key is a string literal — no error', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function List() {
        const [items] = createSignal<string[]>([])
        return <ul>{items().map(item => <li key="static">{item}</li>)}</ul>
      }
    `
    const result = compile(source)
    const errs = result.errors.filter(
      (e) => e.code === ErrorCodes.MISSING_KEY_IN_LIST || e.code === ErrorCodes.MISSING_KEY_IN_NESTED_LIST,
    )
    expect(errs).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// BF023 — ternary body
// ---------------------------------------------------------------------------

describe('BF023 — ternary .map() callback', () => {
  test('missing key on one ternary branch raises BF023', () => {
    const source = `
      interface Item { done: boolean; id: string }
      export function List({ items }: { items: Item[] }) {
        return (
          <ul>
            {items.map(item =>
              item.done
                ? <li key={item.id} class="done">{item.id}</li>
                : <li>{item.id}</li>
            )}
          </ul>
        )
      }
    `
    const errs = errorsFor(ErrorCodes.MISSING_KEY_IN_LIST, source)
    expect(errs).toHaveLength(1)
    expect(errs[0].severity).toBe('error')
  })

  test('both ternary branches have key — no error', () => {
    const source = `
      interface Item { done: boolean; id: string }
      export function List({ items }: { items: Item[] }) {
        return (
          <ul>
            {items.map(item =>
              item.done
                ? <li key={item.id} class="done">{item.id}</li>
                : <li key={item.id}>{item.id}</li>
            )}
          </ul>
        )
      }
    `
    const result = compile(source)
    const errs = result.errors.filter(
      (e) => e.code === ErrorCodes.MISSING_KEY_IN_LIST || e.code === ErrorCodes.MISSING_KEY_IN_NESTED_LIST,
    )
    expect(errs).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// BF024 — nested map
// ---------------------------------------------------------------------------

describe('BF024 — MISSING_KEY_IN_NESTED_LIST', () => {
  test('inner map without key raises BF024', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Grid() {
        const [rows] = createSignal<{ id: string; cells: string[] }[]>([])
        return (
          <table>
            {rows().map(row => (
              <tr key={row.id}>
                {row.cells.map(cell => <td>{cell}</td>)}
              </tr>
            ))}
          </table>
        )
      }
    `
    const errs = errorsFor(ErrorCodes.MISSING_KEY_IN_NESTED_LIST, source)
    expect(errs).toHaveLength(1)
    expect(errs[0].severity).toBe('error')
    // Outer map is keyed — no BF023
    const outerErrs = errorsFor(ErrorCodes.MISSING_KEY_IN_LIST, source)
    expect(outerErrs).toHaveLength(0)
  })

  test('both outer and inner unkeyed: outer BF023, inner BF024', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Grid() {
        const [rows] = createSignal<{ cells: string[] }[]>([])
        return (
          <table>
            {rows().map(row => (
              <tr>
                {row.cells.map(cell => <td>{cell}</td>)}
              </tr>
            ))}
          </table>
        )
      }
    `
    const outerErrs = errorsFor(ErrorCodes.MISSING_KEY_IN_LIST, source)
    expect(outerErrs).toHaveLength(1)
    const innerErrs = errorsFor(ErrorCodes.MISSING_KEY_IN_NESTED_LIST, source)
    expect(innerErrs).toHaveLength(1)
  })

  test('nested map with valid key on both levels — no error', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Grid() {
        const [rows] = createSignal<{ id: string; cells: string[] }[]>([])
        return (
          <table>
            {rows().map(row => (
              <tr key={row.id}>
                {row.cells.map((cell, i) => <td key={i}>{cell}</td>)}
              </tr>
            ))}
          </table>
        )
      }
    `
    const result = compile(source)
    const errs = result.errors.filter(
      (e) => e.code === ErrorCodes.MISSING_KEY_IN_LIST || e.code === ErrorCodes.MISSING_KEY_IN_NESTED_LIST,
    )
    expect(errs).toHaveLength(0)
  })
})
