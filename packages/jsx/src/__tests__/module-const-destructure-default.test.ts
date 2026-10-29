/**
 * A destructured prop's client read is `_p.m ?? <default>`, so a module
 * declaration the default names (`{ m = DEFAULT }`) is a client read even
 * when nothing else in the component names it. The reference graph used to
 * miss it, and the emitted client module read an undeclared name — a
 * `ReferenceError` whenever the prop was absent (a client-side mount).
 *
 * Declarations are read from the emitted client JS with the TypeScript AST.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

function clientJs(source: string): string {
  const result = compileJSX(source, 'C.tsx', { adapter: new TestAdapter() })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  return result.files.find(f => f.type === 'clientJs')!.content
}

/** Every name the client module declares (variables and functions, any depth), in order. */
function declarations(js: string): string[] {
  const sf = ts.createSourceFile('c.js', js, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const names: string[] = []
  const visit = (node: ts.Node): void => {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      names.push(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return names
}

const declaredNames = (js: string): Set<string> => new Set(declarations(js))
const declarationCount = (js: string, name: string): number => declarations(js).filter(n => n === name).length

describe('module declarations read only by a destructure default are emitted', () => {
  test('a module const default read as text', () => {
    const js = clientJs(`'use client'
const DEFAULT = 'm'
export function C({ m = DEFAULT }: { m?: string }) {
  return <p>{m}</p>
}`)
    expect(declaredNames(js).has('DEFAULT')).toBe(true)
  })

  test('a chain: the later prop reads the earlier one, whose default reads the const', () => {
    const js = clientJs(`'use client'
const DEFAULT = 'm'
export function C({ a = DEFAULT, b = a }: { a?: string; b?: string }) {
  return <p>{b}</p>
}`)
    expect(declaredNames(js).has('DEFAULT')).toBe(true)
  })

  test('a member read of a module object const', () => {
    const js = clientJs(`'use client'
const D = { label: 'm' }
export function C({ m = D.label }: { m?: string }) {
  return <p title={m}>{m}</p>
}`)
    expect(declaredNames(js).has('D')).toBe(true)
  })

  test('a module helper function called by the default', () => {
    const js = clientJs(`'use client'
function fmt(s: string) { return s + '!' }
export function C({ m = fmt('x') }: { m?: string }) {
  return <p>{m}</p>
}`)
    expect(declaredNames(js).has('fmt')).toBe(true)
  })

  test('a signal seeded from the defaulted prop', () => {
    const js = clientJs(`'use client'
import { createSignal } from '@barefootjs/client'
const START = 2
export function C({ start = START }: { start?: number }) {
  const [c, setC] = createSignal(start)
  return <button onClick={() => setC(c() + 1)}>{c()}</button>
}`)
    expect(declaredNames(js).has('START')).toBe(true)
  })

  test('a body local of the same name does not get a second declaration', () => {
    const js = clientJs(`'use client'
const LABEL = 'a'
export function C({ m = LABEL }: { m?: string }) {
  const LABEL = 'b'
  return <p title={LABEL}>{m}</p>
}`)
    // Two `const LABEL` in one init body would be a SyntaxError for the module.
    expect(declarationCount(js, 'LABEL')).toBeLessThanOrEqual(1)
  })

  test('the default of a prop the client never reads adds nothing', () => {
    const js = clientJs(`'use client'
import { createSignal } from '@barefootjs/client'
const UNUSED = 'u'
export function C({ m = UNUSED }: { m?: string }) {
  const [c, setC] = createSignal(0)
  return <button onClick={() => setC(c() + 1)}>{c()}</button>
}`)
    expect(declaredNames(js).has('UNUSED')).toBe(false)
  })
})
