/**
 * Literal-locale `toLocaleDateString` sugar (#2324 slice 2). Covers the
 * build-time pattern derivation's structural gate, the matcher's
 * accept/decline table (only the explicit-input literal shape lowers; every
 * implicit-environment or runtime-value shape declines to BF021), the
 * BF021-exemption round trip through the real registry, and the client-JS
 * rewrite to `formatDate(recv, pattern, tz)` (mirrors
 * `date-lowering.test.ts`'s #2292 section).
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '../index'
import { TestAdapter } from '../adapters/test-adapter'
import { parseExpression, type ParsedExpr } from '../expression-parser'
import {
  resolveLocaleDatePattern,
  matchToLocaleDateStringCall,
  toLocaleDatePlugin,
} from '../to-locale-date-lowering'
import { ErrorCodes } from '../errors'

function compile(src: string) {
  return compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter(), outputIR: true })
}

function metadata(src: string): ComponentIR['metadata'] {
  const result = compile(src)
  const ir = JSON.parse(result.files.find((f) => f.type === 'ir')!.content) as ComponentIR
  return ir.metadata
}

function callParts(expr: string): { callee: ParsedExpr; args: ParsedExpr[] } {
  const parsed = parseExpression(expr)
  if (parsed.kind !== 'call') throw new Error(`expected a call expression, got ${parsed.kind}`)
  return { callee: parsed.callee, args: parsed.args }
}

const DATE_PROP_SRC = `
export function Foo({ createdAt }: { createdAt: Date }) {
  return <div>{createdAt.toLocaleDateString('en-US', { timeZone: 'UTC' })}</div>
}
`

describe('resolveLocaleDatePattern (build-time derivation)', () => {
  test('derives numeric default patterns per locale', () => {
    expect(resolveLocaleDatePattern('en-US')).toBe('M/D/YYYY')
    expect(resolveLocaleDatePattern('ja-JP')).toBe('YYYY/M/D')
    expect(resolveLocaleDatePattern('en-GB')).toBe('DD/MM/YYYY')
  })

  test('declines non-gregorian / non-latin-digit defaults (ar-SA) and invalid tags', () => {
    expect(resolveLocaleDatePattern('ar-SA')).toBeNull()
    expect(resolveLocaleDatePattern('not a locale !!')).toBeNull()
  })
})

describe('matchToLocaleDateStringCall accept/decline table', () => {
  const md = metadata(DATE_PROP_SRC)

  function match(expr: string) {
    const { callee, args } = callParts(expr)
    return matchToLocaleDateStringCall(callee, args, md)
  }

  test('literal locale + literal UTC timeZone lowers to format_date with the frozen pattern', () => {
    const node = match(`createdAt.toLocaleDateString('en-US', { timeZone: 'UTC' })`)
    expect(node).toEqual({
      kind: 'helper-call',
      helper: 'format_date',
      args: [
        { kind: 'identifier', name: 'createdAt' },
        { kind: 'literal', value: 'M/D/YYYY', literalType: 'string' },
        { kind: 'literal', value: 'UTC', literalType: 'string' },
      ],
    })
  })

  test('a fixed ±HH:MM offset timeZone is admitted', () => {
    const node = match(`createdAt.toLocaleDateString('ja-JP', { timeZone: '+09:00' })`)
    expect(node).toMatchObject({
      helper: 'format_date',
      args: [
        { kind: 'identifier', name: 'createdAt' },
        { kind: 'literal', value: 'YYYY/M/D' },
        { kind: 'literal', value: '+09:00' },
      ],
    })
  })

  test('implicit-environment and runtime-value shapes all decline', () => {
    // zero-arg / locale-only: reads host locale and/or timezone
    expect(match(`createdAt.toLocaleDateString()`)).toBeNull()
    expect(match(`createdAt.toLocaleDateString('ja-JP')`)).toBeNull()
    // non-literal locale: no build-time CLDR resolution
    expect(match(`createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })`)).toBeNull()
    // IANA zone name: host-tzdata coupling
    expect(match(`createdAt.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })`)).toBeNull()
    // non-literal timeZone
    expect(match(`createdAt.toLocaleDateString('ja-JP', { timeZone: tz })`)).toBeNull()
    // out-of-range fixed offsets: real toLocaleDateString throws RangeError
    // on these, so lowering them would diverge from JS semantics
    expect(match(`createdAt.toLocaleDateString('ja-JP', { timeZone: '+25:00' })`)).toBeNull()
    expect(match(`createdAt.toLocaleDateString('ja-JP', { timeZone: '+99:99' })`)).toBeNull()
    expect(match(`createdAt.toLocaleDateString('ja-JP', { timeZone: '-12:60' })`)).toBeNull()
    // options beyond timeZone: the name-table stage, not this slice
    expect(match(`createdAt.toLocaleDateString('ja-JP', { timeZone: 'UTC', month: 'long' })`)).toBeNull()
    expect(match(`createdAt.toLocaleDateString('ja-JP', { dateStyle: 'long' })`)).toBeNull()
    // unrepresentable locale default
    expect(match(`createdAt.toLocaleDateString('ar-SA', { timeZone: 'UTC' })`)).toBeNull()
  })

  test('a non-Date receiver never activates the plugin', () => {
    const stringMd = metadata(`
      export function Foo({ label }: { label: string }) {
        return <div>{label}</div>
      }
    `)
    expect(toLocaleDatePlugin.prepare(stringMd)).toBeNull()
  })
})

describe('BF021 exemption round trip (#2273 seam)', () => {
  test('the claimed literal shape compiles clean; the runtime-locale shape still fires BF021', () => {
    const clean = compile(DATE_PROP_SRC)
    expect(clean.errors.filter((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)).toEqual([])

    const refused = compile(`
      export function Foo({ createdAt, locale }: { createdAt: Date; locale: string }) {
        return <div>{createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })}</div>
      }
    `)
    const bf021 = refused.errors.filter((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021.length).toBeGreaterThan(0)
    // the refusal now points at the explicit-input forms
    expect(bf021[0].suggestion?.message).toContain('formatDate')
  })

  test('the zero-arg form (date-method-uncatalogued shape) still fires BF021', () => {
    const refused = compile(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{createdAt.toLocaleDateString()}</div>
      }
    `)
    expect(refused.errors.some((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)).toBe(true)
  })
})

describe('client-JS rewrite (#2292-style parity)', () => {
  function clientJs(src: string): string {
    const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter() })
    return result.files.find((f) => f.type === 'clientJs')!.content
  }

  test('rewrites the literal shape to formatDate with the frozen pattern and auto-imports it', () => {
    const js = clientJs(DATE_PROP_SRC)
    expect(js).toContain('formatDate(_p.createdAt, "M/D/YYYY", "UTC")')
    expect(js).toMatch(/import\s*\{[^}]*\bformatDate\b[^}]*\}\s*from\s*'@barefootjs\/client\/runtime'/)
  })

  test('rewrites inside a reactive effect for a signal-conditioned expression', () => {
    const js = clientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Foo({ createdAt }: { createdAt: Date }) {
        const [suffix, setSuffix] = createSignal('')
        return <div onClick={() => setSuffix('!')}>{createdAt.toLocaleDateString('ja-JP', { timeZone: '+09:00' }) + suffix()}</div>
      }
    `)
    expect(js).toContain('formatDate(_p.createdAt, "YYYY/M/D", "+09:00")')
    expect(js).not.toContain('toLocaleDateString')
  })

  test('leaves the declined runtime-locale shape raw', () => {
    const js = clientJs(`
      export function Foo({ createdAt, locale }: { createdAt: Date; locale: string }) {
        return <div>{/* @client */ createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })}</div>
      }
    `)
    expect(js).toContain('toLocaleDateString(')
    expect(js).not.toContain('formatDate(')
  })
})
