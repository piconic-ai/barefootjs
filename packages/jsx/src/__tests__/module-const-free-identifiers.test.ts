/**
 * A module const's dependencies are the free identifiers of its initializer's
 * AST, not the identifier tokens of its value text. An object key, a member
 * name or a callback parameter inside the value is no read, so an unrelated
 * declaration of the same name must stay out of the client module (here one
 * reading `process`, which the browser lacks: a `ReferenceError` at hydrate).
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { extractFreeIdentifiersFromNode } from '../analyzer'

function clientJs(source: string): string {
  const result = compileJSX(source, 'C.tsx', { adapter: new TestAdapter() })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  return result.files.find(f => f.type === 'clientJs')!.content
}

function freeOf(expr: string): string[] {
  const sf = ts.createSourceFile('x.ts', `(${expr})`, ts.ScriptTarget.Latest, true)
  const stmt = sf.statements[0] as ts.ExpressionStatement
  return [...extractFreeIdentifiersFromNode(stmt.expression)].sort()
}

// The component reads the const through a signal-free event handler so the
// const is reachable from the client module whichever way it is used.
const component = (consts: string, read: string) => `'use client'
import { createSignal } from '@barefootjs/client'
const label = process.env.SERVER_ONLY
${consts}
export function C() {
  const [c, setC] = createSignal(0)
  return <button onClick={() => setC(c() + String(${read}).length)}>{c()}</button>
}`

describe('module const dependencies come from the initializer AST', () => {
  test('an object key and a member name of another module const', () => {
    const js = clientJs(component(`const D = { label: 'm' }\nconst L = D.label`, 'L'))
    expect(js).not.toContain('process')
    expect(js).toContain('const D =')
  })

  test('an arrow callback parameter', () => {
    const js = clientJs(component(`const NAMES = ['n'].map(label => label.toUpperCase())`, 'NAMES'))
    expect(js).not.toContain('process')
  })

  test('a function expression parameter', () => {
    const js = clientJs(component(`const NAMES = ['n'].map(function (label) { return label + '!' })`, 'NAMES'))
    expect(js).not.toContain('process')
  })

  test('an object method named like the declaration', () => {
    const js = clientJs(component(`const O = { label() { return 'm' } }\nconst S = O.label()`, 'S'))
    expect(js).not.toContain('process')
  })

  test('a genuine read beside a colliding key is still declared', () => {
    const js = clientJs(component(`const base = 'b'\nconst D = { label: base }`, 'D'))
    expect(js).toContain(`const base = 'b'`)
    expect(js).not.toContain('process')
  })

  test('a computed method name keeps the declaration its own parameter shadows', () => {
    const js = clientJs(component(`const key = 'run'\nconst O = { [key](key: number) { return key + 1 } }`, 'O'))
    expect(js).toContain(`const key = 'run'`)
  })

  test('a real read of the same name is still declared', () => {
    const js = clientJs(component(`const D = { v: label }`, 'D.v'))
    expect(js).toContain('process.env.SERVER_ONLY')
  })
})

describe('extractFreeIdentifiersFromNode binds function parameters', () => {
  test('a function expression parameter is bound', () => {
    expect(freeOf(`function (label) { return label + other }`)).toEqual(['other'])
  })

  test('a method parameter and a method name', () => {
    expect(freeOf(`{ label(x) { return x + y } }`)).toEqual(['y'])
  })

  test('a destructured parameter is bound', () => {
    expect(freeOf(`function ({ a, b: [c] }) { return a + c + d }`)).toEqual(['d'])
  })

  test('a destructuring key is no read, its binding is', () => {
    expect(freeOf(`(({ label: x }) => x)(obj)`)).toEqual(['obj'])
  })

  test('a name bound by an outer function stays bound after an inner one ends', () => {
    expect(freeOf(`function (a) { [1].map(function (a) { return a }); return a }`)).toEqual([])
  })

  test('a computed method name is read in the enclosing scope, not the method\'s', () => {
    expect(freeOf(`{ [key](key) { return key + 1 } }`)).toEqual(['key'])
  })

  test('a computed accessor name is read in the enclosing scope', () => {
    expect(freeOf(`{ get [key]() { return 1 }, set [k2](k2) {} }`)).toEqual(['k2', 'key'])
  })

  test('a computed property name is a read', () => {
    expect(freeOf(`{ [key]: 1 }`)).toEqual(['key'])
  })

  test('parameters still shadow inside the method body', () => {
    expect(freeOf(`{ [key](a) { return a + b } }`)).toEqual(['b', 'key'])
  })

  test('a parameter binds only inside its own function', () => {
    expect(freeOf(`[function (a) { return a }, a]`)).toEqual(['a'])
  })
})
