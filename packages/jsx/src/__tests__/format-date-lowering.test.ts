/**
 * `formatDatePlugin` (#2324) — recognises the `formatDate` import from
 * `@barefootjs/client` (incl. aliases and the runtime re-export) and lowers a
 * `formatDate(date, pattern[, timeZone])` call to the backend-neutral
 * `helper-call` on the `format_date` helper, normalizing the omitted
 * `timeZone` to the `'UTC'` literal (fixed helper arity of 3).
 */
import { describe, expect, test } from 'bun:test'
import { compileJSX, type ComponentIR } from '../index'
import { formatDateLocalNames } from '../adapters/env-signal'
import { matchFormatDateCall, formatDatePlugin } from '../format-date-lowering'
import type { ParsedExpr } from '../expression-parser'
import { TestAdapter } from '../adapters/test-adapter'

function metadata(src: string): ComponentIR['metadata'] {
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter(), outputIR: true })
  const ir = JSON.parse(result.files.find(f => f.type === 'ir')!.content) as ComponentIR
  return ir.metadata
}

const CALLEE: ParsedExpr = { kind: 'identifier', name: 'formatDate' }
const DATE_ARG: ParsedExpr = { kind: 'identifier', name: 'createdAt' }
const PATTERN_ARG: ParsedExpr = { kind: 'literal', value: 'YYYY/M/D', literalType: 'string' }
const TZ_ARG: ParsedExpr = { kind: 'literal', value: '+09:00', literalType: 'string' }
const LOCALS = new Set(['formatDate'])

describe('formatDateLocalNames (#2324)', () => {
  test('recognises the import, aliases, and the runtime entry', () => {
    const md = metadata(`
'use client'
import { formatDate } from '@barefootjs/client'
export function P(props: { createdAt: Date }) {
  return <time>{formatDate(props.createdAt, 'YYYY/M/D')}</time>
}
`)
    expect([...formatDateLocalNames(md)]).toEqual(['formatDate'])

    const aliased = metadata(`
'use client'
import { formatDate as fd } from '@barefootjs/client/runtime'
export function P(props: { createdAt: Date }) {
  return <time>{fd(props.createdAt, 'YYYY/M/D')}</time>
}
`)
    expect([...formatDateLocalNames(aliased)]).toEqual(['fd'])
  })

  test('is empty when not imported', () => {
    const md = metadata(`
'use client'
export function P() { return <time>x</time> }
`)
    expect(formatDateLocalNames(md).size).toBe(0)
  })
})

const EMPTY_NAMES = { kind: 'array-literal', elements: [], raw: '[]' }

describe('matchFormatDateCall (#2324/#2334)', () => {
  test('normalizes a 3-arg call to canonical arity 4 (empty names table)', () => {
    expect(matchFormatDateCall(CALLEE, [DATE_ARG, PATTERN_ARG, TZ_ARG], LOCALS)).toEqual({
      kind: 'helper-call',
      helper: 'format_date',
      args: [DATE_ARG, PATTERN_ARG, TZ_ARG, EMPTY_NAMES as ParsedExpr],
    })
  })

  test('normalizes a 2-arg call by supplying the UTC literal and empty names', () => {
    const node = matchFormatDateCall(CALLEE, [DATE_ARG, PATTERN_ARG], LOCALS)
    expect(node).toEqual({
      kind: 'helper-call',
      helper: 'format_date',
      args: [
        DATE_ARG,
        PATTERN_ARG,
        { kind: 'literal', value: 'UTC', literalType: 'string' },
        EMPTY_NAMES as ParsedExpr,
      ],
    })
  })

  test('a caller-supplied 4th (names) argument passes through', () => {
    const namesArg: ParsedExpr = { kind: 'identifier', name: 'names' }
    expect(matchFormatDateCall(CALLEE, [DATE_ARG, PATTERN_ARG, TZ_ARG, namesArg], LOCALS)).toEqual({
      kind: 'helper-call',
      helper: 'format_date',
      args: [DATE_ARG, PATTERN_ARG, TZ_ARG, namesArg],
    })
  })

  test('declines wrong callees and arities', () => {
    expect(matchFormatDateCall({ kind: 'identifier', name: 'other' }, [DATE_ARG, PATTERN_ARG], LOCALS)).toBeNull()
    expect(
      matchFormatDateCall(
        { kind: 'member', object: DATE_ARG, property: 'formatDate', computed: false } as ParsedExpr,
        [DATE_ARG, PATTERN_ARG],
        LOCALS,
      ),
    ).toBeNull()
    expect(matchFormatDateCall(CALLEE, [DATE_ARG], LOCALS)).toBeNull()
    expect(matchFormatDateCall(CALLEE, [DATE_ARG, PATTERN_ARG, TZ_ARG, TZ_ARG, TZ_ARG], LOCALS)).toBeNull()
  })

  test('the plugin prepares only for components that import formatDate', () => {
    const withImport = metadata(`
'use client'
import { formatDate } from '@barefootjs/client'
export function P(props: { createdAt: Date }) {
  return <time>{formatDate(props.createdAt, 'YYYY/M/D')}</time>
}
`)
    const matcher = formatDatePlugin.prepare(withImport)
    expect(matcher).not.toBeNull()
    expect(matcher!(CALLEE, [DATE_ARG, PATTERN_ARG, TZ_ARG])).toMatchObject({
      kind: 'helper-call',
      helper: 'format_date',
    })

    const without = metadata(`
'use client'
export function P() { return <time>x</time> }
`)
    expect(formatDatePlugin.prepare(without)).toBeNull()
  })
})
