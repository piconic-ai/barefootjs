/**
 * BF115 / BF116 (#3159): `createSignal`/`createMemo` called with a
 * destructure arity or argument count the primitive doesn't support.
 *
 * Context: `validateReactiveFactoryCalls` (BF110) exists to diagnose a
 * destructure of an UNRECOGNISED callee — it unconditionally `continue`s
 * past `createSignal`/`createMemo`, so a RECOGNISED callee used with a bad
 * shape fell through with no diagnostic:
 *
 *   - `const [user, setUser, extra] = createSignal(props.user)` — a
 *     3-element destructure of `createSignal` (which returns a 2-element
 *     `[getter, setter]` tuple) was not recognised as a signal at all.
 *     `user` fell through to the "same-name prop" fallback and silently
 *     became the raw prop accessor `_p.user()` instead of the signal
 *     getter — a real read/write split whose failure mode is "the UI just
 *     doesn't update," not a compile error.
 *   - `createSignal(props.user, { from: 'router' })` / `createMemo(fn, x)`
 *     — an extra argument was silently dropped from the emitted client JS.
 *
 * Both are now loud, per CLAUDE.md's known-limitation policy (`silent` →
 * `refusal`/compile error).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('BF115: createSignal/createMemo tuple-destructure arity (#3159)', () => {
  test('a 3-element destructure of createSignal is a compile error, not a silent prop fallback', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Profile({ user }: { user: string }) {
        const [user2, setUser, extra] = createSignal(user)
        return <button onClick={() => setUser('x')}>{user2()}</button>
      }
    `
    const result = compileJSX(source, 'Profile.tsx', { adapter })
    const bf115 = result.errors.find(e => e.code === 'BF115')
    expect(bf115).toBeDefined()
    expect(bf115!.severity).toBe('error')
    expect(bf115!.message).toContain('createSignal')
  })

  test('the exact same-name-prop collision shape from the issue is caught', () => {
    // `user` names both a prop AND the over-arity destructure's first
    // binding — the shape that silently mis-seeds `user` as `_p.user()`.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Profile({ user }: { user: string }) {
        const [user, setUser, extra] = createSignal(user)
        return <button onClick={() => setUser('x')}>{user()}</button>
      }
    `
    const result = compileJSX(source, 'Profile.tsx', { adapter })
    const bf115 = result.errors.find(e => e.code === 'BF115')
    expect(bf115).toBeDefined()
  })

  test('a 1-element destructure (getter-only) is still valid — no BF115', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const [count] = createSignal(0)
        return <span>{count()}</span>
      }
    `
    const result = compileJSX(source, 'Counter.tsx', { adapter })
    expect(result.errors.find(e => e.code === 'BF115')).toBeUndefined()
  })

  test('a normal 2-element destructure is still valid — no BF115', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `
    const result = compileJSX(source, 'Counter.tsx', { adapter })
    expect(result.errors.find(e => e.code === 'BF115')).toBeUndefined()
  })

  test('an array-pattern destructure of createMemo (which returns a single getter) is BF115', () => {
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'

      export function Doubled() {
        const [count, setCount] = createSignal(1)
        const [doubled] = createMemo(() => count() * 2)
        return <span onClick={() => setCount(2)}>{doubled()}</span>
      }
    `
    const result = compileJSX(source, 'Doubled.tsx', { adapter })
    const bf115 = result.errors.find(e => e.code === 'BF115')
    expect(bf115).toBeDefined()
    expect(bf115!.message).toContain('createMemo')
  })

  test('the getter-elided form `const [, setActive]` is still valid — no BF115', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Toggle() {
        const [, setActive] = createSignal(false)
        return <button onClick={() => setActive(true)}>Go</button>
      }
    `
    const result = compileJSX(source, 'Toggle.tsx', { adapter })
    expect(result.errors.find(e => e.code === 'BF115')).toBeUndefined()
  })

  // Alias resolution itself (`import { createSignal as sig }`) is covered by
  // `primitive-resolver-alias.test.ts`, which requires a real `ts.Program`
  // to exercise the TypeChecker-backed slow path. This check delegates to
  // the same `resolvePrimitiveKind` those tests pin, rather than a bespoke
  // bare-text match — see the doc comment on `validateReactiveFactoryArity`.
})

describe('BF116: createSignal/createMemo extra call arguments (#3159)', () => {
  test('an extra argument to createSignal is a compile error, not a silent drop', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Profile({ user }: { user: string }) {
        const [value, setValue] = createSignal(user, { from: 'router' })
        return <button onClick={() => setValue('x')}>{value()}</button>
      }
    `
    const result = compileJSX(source, 'Profile.tsx', { adapter })
    const bf116 = result.errors.find(e => e.code === 'BF116')
    expect(bf116).toBeDefined()
    expect(bf116!.severity).toBe('error')
    expect(bf116!.message).toContain('createSignal')
  })

  test('an extra argument to createMemo is a compile error', () => {
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'

      export function Doubled() {
        const [count, setCount] = createSignal(1)
        const doubled = createMemo(() => count() * 2, { deep: true })
        return <span onClick={() => setCount(2)}>{doubled()}</span>
      }
    `
    const result = compileJSX(source, 'Doubled.tsx', { adapter })
    const bf116 = result.errors.find(e => e.code === 'BF116')
    expect(bf116).toBeDefined()
    expect(bf116!.message).toContain('createMemo')
  })

  test('createSignal with zero arguments is still valid — no BF116', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const [count, setCount] = createSignal<number>()
        return <button onClick={() => setCount(1)}>{count()}</button>
      }
    `
    const result = compileJSX(source, 'Counter.tsx', { adapter })
    expect(result.errors.find(e => e.code === 'BF116')).toBeUndefined()
  })

  test('createSignal with exactly one argument is still valid — no BF116', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `
    const result = compileJSX(source, 'Counter.tsx', { adapter })
    expect(result.errors.find(e => e.code === 'BF116')).toBeUndefined()
  })
})
