/**
 * #2924 — a BARE (uncalled) reference to a `call`-kind `CsrSubstitution`
 * entry (a signal/memo getter) must substitute as a thunk over the
 * accessor's value, not the value itself.
 *
 * `buildSignalMemoEnv` registers signal getters and memos as `kind: 'call'`
 * entries: the CALL SITE `count()` substitutes to the accessor's value
 * directly (`(5)`), because calling the accessor IS reading the value. A
 * BARE reference to the same name (`count`, uncalled — e.g. passed as a
 * component prop, `<Display value={count} />`) is not a read: it's the
 * accessor itself, which only exists as a real closure inside `initXxx`'s
 * function scope. Before this fix, `csrSubstituteOnce`'s bare-identifier
 * and shorthand-property branches only matched `kind === 'identifier'`, so
 * a bare `count` fell through untouched and leaked into the module-scope
 * `template` lambda as a genuine free identifier — a guaranteed
 * `ReferenceError` on CSR-fresh-mount.
 *
 * The fix: a bare reference to a `call`-kind entry now substitutes to
 * `(() => (value))` — a thunk over the same value the call form produces.
 * This mirrors the reference adapter's (Hono's) SSR shim for the same
 * shape (`const count = () => 5`), so the CSR template and SSR markup
 * agree on what a bare accessor prop evaluates to.
 *
 * Direct unit coverage of `csrSubstitute` itself; `csr-template-scope-
 * soundness.test.ts`'s case D exercises the same fix through the full
 * compile pipeline.
 */

import { describe, test, expect } from 'bun:test'
import { csrSubstitute, type CsrEnv } from '../ir-to-client-js/csr-substitute.ts'
import { BindingScope } from '../scope/binding-scope.ts'

function callEnv(name: string, replacement: string): CsrEnv {
  return {
    substitutions: new Map([[name, { kind: 'call', replacement, freeIdentifiers: new Set() }]]),
    propsObjectName: null,
  }
}

describe('csrSubstitute: bare reference to a call-kind entry (#2924)', () => {
  test('a called reference still substitutes to the plain value', () => {
    const { rewritten, freeIdentifiers } = csrSubstitute('count()', callEnv('count', '5'))
    expect(rewritten).toBe('(5)')
    expect(freeIdentifiers.size).toBe(0)
  })

  test('a bare reference substitutes to a thunk over the same value', () => {
    const { rewritten, freeIdentifiers } = csrSubstitute('count', callEnv('count', '5'))
    expect(rewritten).toBe('(() => (5))')
    expect(freeIdentifiers.size).toBe(0)
  })

  test('a bare reference nested in an object literal value position substitutes to a thunk', () => {
    const { rewritten } = csrSubstitute('{ v: count }', callEnv('count', '5'))
    expect(rewritten).toBe('{ v: (() => (5)) }')
  })

  test('a bare reference in shorthand-property position substitutes to a thunk, keyed correctly', () => {
    const { rewritten } = csrSubstitute('{ count }', callEnv('count', '5'))
    expect(rewritten).toBe('{ count: (() => (5)) }')
  })

  test('member access on the bare name is untouched (structural protection, #1100)', () => {
    const { rewritten, freeIdentifiers } = csrSubstitute('ctx.count', callEnv('count', '5'))
    expect(rewritten).toBe('ctx.count')
    expect(freeIdentifiers.has('ctx')).toBe(true)
    expect(freeIdentifiers.has('count')).toBe(false)
  })

  test('a getter call INSIDE a memo body thunk still substitutes (fixed-point loop)', () => {
    const env: CsrEnv = {
      substitutions: new Map([
        ['count', { kind: 'call', replacement: '5', freeIdentifiers: new Set() }],
        ['doubled', { kind: 'call', replacement: 'count() * 2', freeIdentifiers: new Set(['count']) }],
      ]),
      propsObjectName: null,
    }
    const { rewritten, freeIdentifiers } = csrSubstitute('doubled', env)
    expect(rewritten).toBe('(() => ((5) * 2))')
    expect(freeIdentifiers.size).toBe(0)
  })

  test('a .map() row parameter shadowing the getter name is not substituted', () => {
    const scope = BindingScope.EMPTY.enterLoopRow({ param: 'count' })
    const { rewritten } = csrSubstitute('count', callEnv('count', '5'), scope)
    expect(rewritten).toBe('count')
  })

  test('an identifier-kind entry (inlinable const) is unaffected by the thunk rule', () => {
    const env: CsrEnv = {
      substitutions: new Map([['label', { kind: 'identifier', replacement: "'hi'", freeIdentifiers: new Set() }]]),
      propsObjectName: null,
    }
    const { rewritten } = csrSubstitute('label', env)
    expect(rewritten).toBe("('hi')")
  })
})
