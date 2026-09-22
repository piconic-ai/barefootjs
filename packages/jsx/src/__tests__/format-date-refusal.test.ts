/**
 * Authored `formatDate` call refusal (BF056, #3089).
 *
 * `formatDate` is compiler ABI — the lowering target of the
 * `.toLocaleDateString(locale, { timeZone, ... })` sugar — never an
 * authored API. `checkAuthoredFormatDateCalls` (format-date-refusal.ts) is
 * wired into `compileJSX`, so these tests go through it directly, same as
 * `rich-type-method-refusal.test.ts`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { ErrorCodes } from '../errors'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function bf056(source: string, filePath = 'Test.tsx') {
  const result = compileJSX(source, filePath, { adapter })
  return result.errors.filter((e) => e.code === ErrorCodes.FORMAT_DATE_AUTHORED_CALL)
}

describe('authored formatDate call refusal — fires (BF056)', () => {
  test('text-position call', () => {
    const errors = bf056(`
      import { formatDate } from '@barefootjs/client'
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{formatDate(createdAt, 'YYYY-MM-DD')}</div>
      }
    `)
    expect(errors.length).toBe(1)
  })

  test('attribute-position call', () => {
    const errors = bf056(`
      import { formatDate } from '@barefootjs/client'
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div title={formatDate(createdAt, 'YYYY-MM-DD')} />
      }
    `)
    expect(errors.length).toBe(1)
  })

  test('ternary-consequent inside a structured template attribute', () => {
    const errors = bf056(`
      import { formatDate } from '@barefootjs/client'
      export function Foo({ ok, createdAt }: { ok: boolean; createdAt: Date }) {
        return <div title={ok ? formatDate(createdAt, 'YYYY-MM-DD') : 'n/a'} />
      }
    `)
    expect(errors.length).toBe(1)
  })

  test('imported via the /runtime subpath', () => {
    const errors = bf056(`
      import { formatDate } from '@barefootjs/client/runtime'
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{formatDate(createdAt, 'YYYY-MM-DD')}</div>
      }
    `)
    expect(errors.length).toBe(1)
  })

  test('aliased import', () => {
    const errors = bf056(`
      import { formatDate as fd } from '@barefootjs/client'
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{fd(createdAt, 'YYYY-MM-DD')}</div>
      }
    `)
    expect(errors.length).toBe(1)
  })

  test('nested inside a loop row', () => {
    const errors = bf056(`
      import { formatDate } from '@barefootjs/client'
      export function Foo({ items }: { items: Date[] }) {
        return <ul>{items.map((d, i) => <li key={i}>{formatDate(d, 'YYYY-MM-DD')}</li>)}</ul>
      }
    `)
    expect(errors.length).toBe(1)
  })

  test('two distinct call sites both fire (dedup is per-location, not per-file)', () => {
    const errors = bf056(`
      import { formatDate } from '@barefootjs/client'
      export function Foo({ a, b }: { a: Date; b: Date }) {
        return <div>{formatDate(a, 'YYYY-MM-DD')}{formatDate(b, 'YYYY-MM-DD')}</div>
      }
    `)
    expect(errors.length).toBe(2)
  })
})

describe('authored formatDate call refusal — silent (no BF056)', () => {
  test('/* @client */ defers the read', () => {
    const errors = bf056(`
      'use client'
      import { formatDate } from '@barefootjs/client'
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{/* @client */ formatDate(createdAt, 'YYYY-MM-DD')}</div>
      }
    `)
    expect(errors.length).toBe(0)
  })

  test('a same-named local helper NOT imported from @barefootjs/client is untouched', () => {
    const errors = bf056(`
      function formatDate(d: Date, p: string) { return d.toISOString() }
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{formatDate(createdAt, 'YYYY-MM-DD')}</div>
      }
    `)
    expect(errors.length).toBe(0)
  })

  test('the sanctioned toLocaleDateString sugar is untouched', () => {
    const errors = bf056(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{createdAt.toLocaleDateString('en-US', { timeZone: 'UTC' })}</div>
      }
    `)
    expect(errors.length).toBe(0)
  })

  test('no formatDate import at all', () => {
    const errors = bf056(`
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <div>{createdAt.toISOString()}</div>
      }
    `)
    expect(errors.length).toBe(0)
  })
})
