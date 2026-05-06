/**
 * Pins #1187 phase 3: HonoAdapter declares `acceptsTemplateCall: () => true`
 * (the runtime is JavaScript, so any synchronous call qualifies). The
 * compiler pipeline threads this through to relocate, and a chained-const
 * whose value is a regular JS call escapes the bridged-arg / zero-arg
 * rejection that previously forced a silent `undefined` fallback in the
 * template.
 *
 * Each test compiles a tiny component with HonoAdapter and inspects the
 * generated client JS:
 *   - "no fallback" = the template inlines the actual call
 *   - "fallback" = the template substitutes the `(undefined)` sentinel
 *     (UNSAFE_TEMPLATE_EXPR from `html-template.ts`)
 *
 * Direct JSX expressions (`<div data-x={JSON.stringify(props.x)}>` without
 * an intervening const) go through a different path (`transformExpr` →
 * `unsafeLocalNames`) and aren't affected by phase 3. Phase 3's
 * contribution is the const-chain classification done by
 * `compute-inlinability`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../../../jsx/src/compiler'
import { HonoAdapter } from '../adapter/hono-adapter'

function compile(source: string) {
  const result = compileJSX(source, 'Test.tsx', { adapter: new HonoAdapter() })
  const clientJs = result.files.find((f) => f.type === 'clientJs')?.content ?? ''
  return { clientJs, errors: result.errors }
}

const FALLBACK_SENTINEL = '(undefined)'

describe('Hono acceptsTemplateCall — chained const escapes silent fallback (#1187 phase 3)', () => {
  test('JSON.stringify(props.x) via const inlines into template', () => {
    const source = `
      'use client'
      export function Foo(props: { config: object }) {
        const json = JSON.stringify(props.config)
        return <div data-config={json}>hi</div>
      }
    `
    const { clientJs } = compile(source)

    expect(clientJs).not.toContain(FALLBACK_SENTINEL)
    expect(clientJs).toContain('JSON.stringify(_p.config)')
  })

  test('Math.floor(props.score) via const inlines into template', () => {
    const source = `
      'use client'
      export function Foo(props: { score: number }) {
        const rounded = Math.floor(props.score)
        return <div data-rounded={rounded}>hi</div>
      }
    `
    const { clientJs } = compile(source)

    expect(clientJs).not.toContain(FALLBACK_SENTINEL)
    expect(clientJs).toContain('Math.floor(_p.score)')
  })

  test('user-imported function via const inlines into template', () => {
    // With `acceptsTemplateCall: () => true`, an arbitrary module-import
    // call is also accepted. Hono's SSR runtime is JS, so calling
    // `customSerialize` at SSR is fine — assuming the function is itself
    // SSR-safe, which is the user's contract.
    const source = `
      'use client'
      import { customSerialize } from './lib'
      export function Foo(props: { config: object }) {
        const serialized = customSerialize(props.config)
        return <div data-config={serialized}>hi</div>
      }
    `
    const { clientJs } = compile(source)

    expect(clientJs).not.toContain(FALLBACK_SENTINEL)
    // The previously-latent `_p._p.config` double-rewrite is fixed at
    // relocate's lift-to-prop site — the props *object* lifts to bare
    // `_p` instead of `_p.props`. Single rewrite, correct shape.
    expect(clientJs).toContain('customSerialize(_p.config)')
    expect(clientJs).not.toContain('_p._p')
  })

  test('the prior `_p._p.X` double-rewrite regression is gone', () => {
    // Pre-relocate-fix, lifting the props object name produced
    // `customSerialize(_p.props.config)`, then html-template's
    // `props. → _p.` regex re-rewrote it into `_p._p.config`. With the
    // props-object-name special case in `decideAction`, the lift goes
    // straight to bare `_p`, so the second rewrite has nothing to match.
    //
    // Shadow-guard semantics for component-internal bindings (signals,
    // memos, init-locals) are pinned at the relocate unit level
    // (`packages/jsx/src/__tests__/staged-ir/11-template-primitive-registry.test.ts`).
    const source = `
      'use client'
      import { customSerialize } from './lib'
      export function Foo(props: { a: number; b: number }) {
        const json = customSerialize({ a: props.a, b: props.b })
        return <div data-config={json}>hi</div>
      }
    `
    const { clientJs } = compile(source)

    expect(clientJs).not.toContain('_p._p')
    expect(clientJs).toContain('_p.a')
    expect(clientJs).toContain('_p.b')
  })
})
