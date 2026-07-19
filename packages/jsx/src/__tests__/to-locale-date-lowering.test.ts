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
        { kind: 'array-literal', elements: [], raw: '[]' },
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
        { kind: 'array-literal', elements: [] },
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
    // an options bag WITHOUT timeZone still declines (host-TZ read)
    expect(match(`createdAt.toLocaleDateString('ja-JP', { dateStyle: 'long' })`)).toBeNull()
    // a non-literal option value declines (unprobeable)
    expect(match(`createdAt.toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: style })`)).toBeNull()
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

describe('name tokens via the options bag (#2334)', () => {
  const md = metadata(DATE_PROP_SRC)

  function match(expr: string) {
    const { callee, args } = callParts(expr)
    return matchToLocaleDateStringCall(callee, args, md)
  }

  test('dateStyle long resolves a named pattern plus the 38-slot table', () => {
    const node = match(`createdAt.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' })`)
    expect(node).toMatchObject({
      helper: 'format_date',
      args: [
        { kind: 'identifier', name: 'createdAt' },
        { kind: 'literal', value: 'MMMM D, YYYY' },
        { kind: 'literal', value: 'UTC' },
        { kind: 'array-literal' },
      ],
    })
    const names = (node as { args: ParsedExpr[] }).args[3] as Extract<ParsedExpr, { kind: 'array-literal' }>
    expect(names.elements).toHaveLength(38)
    expect(names.elements[2]).toEqual({ kind: 'literal', value: 'March', literalType: 'string' })
    expect(names.elements[24]).toEqual({ kind: 'literal', value: 'Sunday', literalType: 'string' })
  })

  test('dateStyle full adds the weekday token; medium picks abbreviated names', () => {
    expect(match(`createdAt.toLocaleDateString('en-US', { dateStyle: 'full', timeZone: 'UTC' })`)).toMatchObject({
      args: [expect.anything(), { kind: 'literal', value: 'dddd, MMMM D, YYYY' }, expect.anything(), expect.anything()],
    })
    expect(match(`createdAt.toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' })`)).toMatchObject({
      args: [expect.anything(), { kind: 'literal', value: 'MMM D, YYYY' }, expect.anything(), expect.anything()],
    })
  })

  test("ja-JP's long form is numeric — the probe ships no table", () => {
    expect(match(`createdAt.toLocaleDateString('ja-JP', { dateStyle: 'long', timeZone: 'UTC' })`)).toMatchObject({
      args: [
        expect.anything(),
        { kind: 'literal', value: 'YYYY年M月D日' },
        { kind: 'literal', value: 'UTC' },
        { kind: 'array-literal', elements: [] },
      ],
    })
  })

  test('unreproducible forms decline loudly: 2-digit year, era', () => {
    expect(match(`createdAt.toLocaleDateString('en-US', { dateStyle: 'short', timeZone: 'UTC' })`)).toBeNull()
    expect(match(`createdAt.toLocaleDateString('en-US', { era: 'short', year: 'numeric', timeZone: 'UTC' })`)).toBeNull()
  })

  test('client rewrite carries the names table', () => {
    const result = compile(`
export function Foo({ createdAt }: { createdAt: Date }) {
  return <div>{createdAt.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' })}</div>
}
`)
    expect(result.errors.filter((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)).toEqual([])
    const js = result.files.find((f) => f.type === 'clientJs')!.content
    expect(js).toContain('formatDate(_p.createdAt, "MMMM D, YYYY", "UTC", ["January","February"')
    expect(js).not.toContain('toLocaleDateString')
  })
})

describe('union-typed locale (#2324 union stage)', () => {
  const UNION_SRC = `
function Foo({ createdAt, locale }: { createdAt: Date; locale: 'en-US' | 'ja-JP' }) {
  return <div>{createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })}</div>
}
export { Foo }
`

  test('a required closed string-literal union lowers to a ternary pattern', () => {
    const md = metadata(UNION_SRC)
    const { callee, args } = callParts(`createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })`)
    expect(matchToLocaleDateStringCall(callee, args, md)).toEqual({
      kind: 'helper-call',
      helper: 'format_date',
      args: [
        { kind: 'identifier', name: 'createdAt' },
        {
          kind: 'conditional',
          test: {
            kind: 'binary',
            op: '===',
            left: { kind: 'identifier', name: 'locale' },
            right: { kind: 'literal', value: 'en-US', literalType: 'string' },
          },
          consequent: { kind: 'literal', value: 'M/D/YYYY', literalType: 'string' },
          alternate: { kind: 'literal', value: 'YYYY/M/D', literalType: 'string' },
        },
        { kind: 'literal', value: 'UTC', literalType: 'string' },
        // both members are numeric-only, so the names tables are equal ([])
        // and collapse to a single empty leaf
        { kind: 'array-literal', elements: [], raw: '[]' },
      ],
    })
  })

  test('members sharing one pattern collapse the ternary to a literal', () => {
    const md = metadata(`
function Foo({ createdAt, locale }: { createdAt: Date; locale: 'en-US' | 'en' }) {
  return <div>{createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })}</div>
}
export { Foo }
`)
    const { callee, args } = callParts(`createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })`)
    expect(matchToLocaleDateStringCall(callee, args, md)).toMatchObject({
      helper: 'format_date',
      args: [
        { kind: 'identifier', name: 'createdAt' },
        { kind: 'literal', value: 'M/D/YYYY' },
        { kind: 'literal', value: 'UTC' },
        { kind: 'array-literal', elements: [] },
      ],
    })
  })

  test('object-props mode: accepts props.<name>, declines a bare identifier (never a prop there)', () => {
    const md = metadata(`
export function Foo(props: { createdAt: Date; locale: 'en-US' | 'ja-JP' }) {
  return <div>{props.createdAt.toLocaleDateString(props.locale, { timeZone: 'UTC' })}</div>
}
`)
    const member = callParts(`props.createdAt.toLocaleDateString(props.locale, { timeZone: 'UTC' })`)
    expect(matchToLocaleDateStringCall(member.callee, member.args, md)).toMatchObject({
      helper: 'format_date',
      args: [
        expect.anything(),
        { kind: 'conditional' },
        { kind: 'literal', value: 'UTC' },
        { kind: 'array-literal', elements: [] },
      ],
    })
    // A bare `locale` identifier in object-props mode is a LOCAL binding,
    // not the prop — even when a same-named prop exists (Copilot, #2331).
    const bare = callParts(`props.createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })`)
    expect(matchToLocaleDateStringCall(bare.callee, bare.args, md)).toBeNull()
  })

  test('destructured mode: declines a props.<name> member (no props object exists)', () => {
    const md = metadata(UNION_SRC)
    const { callee, args } = callParts(`createdAt.toLocaleDateString(props.locale, { timeZone: 'UTC' })`)
    expect(matchToLocaleDateStringCall(callee, args, md)).toBeNull()
  })

  test('declines an OPTIONAL union prop (undefined would read the host locale)', () => {
    const md = metadata(`
function Foo({ createdAt, locale }: { createdAt: Date; locale?: 'en-US' | 'ja-JP' }) {
  return <div>{/* @client */ createdAt.toLocaleDateString(locale ?? 'en-US', { timeZone: 'UTC' })}</div>
}
export { Foo }
`)
    const { callee, args } = callParts(`createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })`)
    expect(matchToLocaleDateStringCall(callee, args, md)).toBeNull()
  })

  test('declines a union containing an unrepresentable member', () => {
    const md = metadata(`
function Foo({ createdAt, locale }: { createdAt: Date; locale: 'en-US' | 'ar-SA' }) {
  return <div>{/* @client */ createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })}</div>
}
export { Foo }
`)
    const { callee, args } = callParts(`createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })`)
    expect(matchToLocaleDateStringCall(callee, args, md)).toBeNull()
  })

  test('compiles clean (no BF021) and rewrites client JS to a ternary formatDate', () => {
    const result = compile(UNION_SRC)
    expect(result.errors.filter((e) => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)).toEqual([])
    const js = result.files.find((f) => f.type === 'clientJs')!.content
    expect(js).toContain(
      'formatDate(_p.createdAt, _p.locale === "en-US" ? "M/D/YYYY" : "YYYY/M/D", "UTC")',
    )
    expect(js).not.toContain('toLocaleDateString')
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
