// Unit tests for `parseComponent` — focuses on the `extractExportedNames`
// regression that left `bf gen test` emitting stub-only files for any
// component declared with `export function`/`export const` rather than
// the registry-style `export { Name }` form (#1403).

import { describe, test, expect } from 'bun:test'
import { parseComponent } from '../lib/parse-component'

describe('parseComponent — exportedNames', () => {
  test('registry-style: export { Foo }', () => {
    const src = `function Foo() {}\nexport { Foo }`
    expect(parseComponent(src).exportedNames).toEqual(['Foo'])
  })

  test('top-level page component: export function Foo()', () => {
    const src = `export function Counter() { return <div /> }`
    expect(parseComponent(src).exportedNames).toEqual(['Counter'])
  })

  test('arrow-function const: export const Foo = () => …', () => {
    const src = `export const Badge = (props) => <span>{props.children}</span>`
    expect(parseComponent(src).exportedNames).toEqual(['Badge'])
  })

  test('default function: export default function Foo()', () => {
    const src = `export default function Page() { return <main /> }`
    expect(parseComponent(src).exportedNames).toEqual(['Page'])
  })

  test('default identifier: export default Foo', () => {
    const src = `function Tile() {}\nexport default Tile`
    expect(parseComponent(src).exportedNames).toEqual(['Tile'])
  })

  test('skips `type` re-exports', () => {
    const src = `function Slot() {}\ninterface SlotProps {}\nexport { Slot }\nexport type { SlotProps }`
    expect(parseComponent(src).exportedNames).toEqual(['Slot'])
  })

  test('renames via `as`: export { Foo as Bar }', () => {
    const src = `function Internal() {}\nexport { Internal as Public }`
    expect(parseComponent(src).exportedNames).toEqual(['Public'])
  })

  test('multiple forms in one file (Counter + memo getter export)', () => {
    const src = `
      'use client'
      export function Counter() { return <div /> }
      export const useCount = () => 0
    `
    expect(parseComponent(src).exportedNames).toEqual(['Counter', 'useCount'])
  })

  test('no exports → empty list', () => {
    const src = `function Internal() {}\nexport type { X }`
    expect(parseComponent(src).exportedNames).toEqual([])
  })

  test('deduplicates when default re-states a function name', () => {
    const src = `export function Foo() {}\nexport default Foo`
    expect(parseComponent(src).exportedNames).toEqual(['Foo'])
  })
})
