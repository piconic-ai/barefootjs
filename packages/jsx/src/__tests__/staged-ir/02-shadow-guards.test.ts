/**
 * Pins the **scope shadow contract**: when an init-scope name (signal getter,
 * memo, earlier local const, nested-arrow param) shadows a prop name, the
 * bare reference resolves to the local — NOT to `_p.X`.
 *
 * Today's compiler reconstructs this rule out-of-band in `prop-rewrite.ts`
 * and the analyzer's localConstants pass. The staged-IR refactor moves it
 * to a single `relocate()` pass that consults each Scope's visibility set
 * before lifting `name` to `_p.name`.
 *
 * Covers issue shape #1132 and the nested-arrow regression.
 */

import { describe, test, expect } from 'bun:test'
import { compile } from './helpers'

describe('Shadow guards: bare names that shadow props are NOT rewritten to _p.X', () => {
  test('signal getter shadowing prop name', () => {
    // `count` is the signal getter, NOT props.count.
    // Compiling to `_p.count() * 2` would throw `_p.count is not a function`.
    const { initBody, errors } = compile(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props { count?: number }

      export function Foo(props: Props) {
        const [count, setCount] = createSignal(0)
        const doubled = count() * 2
        return <span>{doubled}</span>
      }
    `)

    expect(errors).toEqual([])
    // The local must use the signal getter, not _p.count.
    expect(initBody).toMatch(/doubled\s*=\s*count\(\)\s*\*\s*2/)
    expect(initBody).not.toMatch(/_p\.count\(\)/)
  })

  // #2934: `label` here is a PURE alias of the `label` prop (the analyzer's
  // IR can't distinguish `const label = props.label ?? 'fallback'` from a
  // destructure default), not a genuinely distinct local shadowing an
  // unrelated prop of the same name — so it is NOT a shadow-guard case
  // after all. `resolveBodyPropAliases` now recognizes it, deletes its own
  // extraction, and rewrites every reference (including from `upper`'s own
  // initializer) to a live `_p.label` read, same as the parameter-
  // destructured form. `upper` itself stays an ordinary once-evaluated
  // local — `.toUpperCase()` is a real computation, not a passthrough.
  test('a plain member-access prop alias is rewritten live, including from a dependent local', () => {
    const { initBody, errors } = compile(`
      'use client'

      interface Props { label?: string }

      export function Foo(props: Props) {
        const label = props.label ?? 'fallback'
        const upper = label.toUpperCase()
        return <span>{upper}</span>
      }
    `)

    expect(errors).toEqual([])
    expect(initBody).not.toMatch(/const\s+label\s*=/)
    expect(initBody).toMatch(/upper\s*=\s*\(_p\.label\s*\?\?\s*'fallback'\)\.toUpperCase\(\)/)
  })

  test('nested arrow param shadowing prop name', () => {
    // The `value` param of the inner arrow shadows props.value (if any).
    const { initBody, errors } = compile(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props { value?: number }

      export function Foo(props: Props) {
        const [n, setN] = createSignal(0)
        const handler = (value: number) => setN(value + 1)
        return <button onClick={() => handler(n())}>{n()}</button>
      }
    `)

    expect(errors).toEqual([])
    // Inside the inner arrow, `value` must remain bare (it's the param).
    expect(initBody).toMatch(/\(value\)\s*=>\s*setN\(value\s*\+\s*1\)/)
    expect(initBody).not.toMatch(/setN\(_p\.value\s*\+\s*1\)/)
  })

  test('pure alias survives: const { name } = props is a stage transport', () => {
    // The exception #1132 documents: a pure destructure-from-props local
    // IS rewriteable, because using it from template scope is equivalent
    // to using `_p.name` directly. No shadow of meaning, just a renaming.
    const { templateBody, errors } = compile(`
      'use client'

      interface Props { name: string }

      export function Foo(props: Props) {
        const { name } = props
        return <span data-name={name}>{name}</span>
      }
    `)

    expect(errors).toEqual([])
    // Template scope can reach _p.name through the alias.
    expect(templateBody).toMatch(/_p\.name/)
  })
})
