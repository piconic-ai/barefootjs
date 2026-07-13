/**
 * CSR/client-JS codegen vs loop-param shadowing (#2222).
 *
 * Two related bugs in the `hydrate(...)` `template:` lambda (a
 * module-scope arrow, sibling to `initXxx` — NOT a closure over init's
 * destructured locals):
 *
 * 1. When the loop's array source is a destructured prop, the lambda
 *    referenced the bare destructured name (`values.map(...)`) instead of
 *    `_p.values` — `ReferenceError: values is not defined` at runtime.
 *    Root cause: `transformMapCall`'s plain-`.map()` fallback and the
 *    simple-`filter().map()` path bypassed `setArray`, so
 *    `IRLoop.templateArray` (the `_p.`-rewritten form the chained paths
 *    already produce) stayed `undefined`.
 *
 * 2. Inside a loop callback body in that same lambda, prop/const
 *    substitution was scope-blind: an outer destructured prop
 *    (`_p.label`) or an inlinable const's literal got substituted at an
 *    occurrence that is actually the loop's own shadowing parameter.
 *    Same bug class as #2221, different code paths:
 *      - prop-shadow: `rewriteBarePropRefs` (IR build) collected prop
 *        refs from the expression node alone, never seeing the enclosing
 *        loop binding. Fixed scope-accurately via `ctx.loopParams` — the
 *        transform position's live loop-param set (includes destructured
 *        binding names and the index param).
 *      - const-shadow: `irToComponentTemplateWithOpts`'s `transformExpr`
 *        regex-inlined `inlinableConstants` across the whole expression
 *        text. Fixed by threading the enclosing loops' bound names
 *        through `TemplateOptions` and skipping those names.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

function templateLambda(content: string): string {
  const line = content.split('\n').find(l => l.includes('hydrate('))
  expect(line).toBeDefined()
  return line!
}

describe('hydrate template: destructured-prop loop array source (#2222 bug 1)', () => {
  test('plain .map() over a destructured prop references _p.<name>', () => {
    const tpl = templateLambda(clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget({ values }: { values: number[] }) {
        const [n, setN] = createSignal(0)
        return (
          <ul data-n={n()} onClick={() => setN(n() + 1)}>
            {values.map((v) => (
              <li key={v}>{v * 2}</li>
            ))}
          </ul>
        )
      }
    `))

    expect(tpl).toContain('_p.values.map((v)')
    expect(tpl).not.toContain('{values.map')
  })

  test('simple filter().map() over a destructured prop references _p.<name>', () => {
    const tpl = templateLambda(clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget({ values }: { values: number[] }) {
        const [n, setN] = createSignal(0)
        return (
          <ul data-n={n()} onClick={() => setN(n() + 1)}>
            {values.filter((v) => v > 0).map((v) => (
              <li key={v}>{v * 2}</li>
            ))}
          </ul>
        )
      }
    `))

    expect(tpl).toContain('_p.values')
    expect(tpl).not.toMatch(/[^.]\bvalues\.filter/)
  })
})

describe('hydrate template: loop param shadowing an outer name (#2222 bug 2)', () => {
  test('prop-shadow: the loop body uses the param, not _p.<name>; outside the loop keeps _p.<name>', () => {
    const tpl = templateLambda(clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget2({ label, values }: { label: string; values: number[] }) {
        const [n, setN] = createSignal(0)
        return (
          <div data-n={n()} onClick={() => setN(n() + 1)}>
            <p>{label}</p>
            <ul>
              {values.map((label) => (
                <li key={label}>{1 + label}</li>
              ))}
            </ul>
          </div>
        )
      }
    `))

    // Outside the loop: the prop rewrite applies.
    expect(tpl).toContain('escapeText(_p.label)')
    // Inside the loop: the shadowing param must survive untouched.
    expect(tpl).toContain('escapeText(1 + label)')
    expect(tpl).not.toContain('1 + _p.label')
    expect(tpl).not.toContain('data-key="${_p.label}"')
  })

  test('const-shadow: the loop body uses the param, not the inlined literal; outside the loop keeps the inline', () => {
    const tpl = templateLambda(clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget3({ values }: { values: number[] }) {
        const label: string = 'x'
        const [n, setN] = createSignal(0)
        return (
          <div data-n={n()} onClick={() => setN(n() + 1)}>
            <p>{label}</p>
            <ul>
              {values.map((label) => (
                <li key={label}>{1 + label}</li>
              ))}
            </ul>
          </div>
        )
      }
    `))

    // Outside the loop: const inlining still applies.
    expect(tpl).toContain("${('x')}")
    // Inside the loop: the shadowing param must survive untouched.
    expect(tpl).toContain('escapeText(1 + label)')
    expect(tpl).not.toContain("1 + ('x')")
    expect(tpl).not.toContain('data-key="${`x`}"')
  })

  test('destructured loop param shadowing a prop is guarded via paramBindings names', () => {
    const tpl = templateLambda(clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget4({ name, rows }: { name: string; rows: { name: number }[] }) {
        const [n, setN] = createSignal(0)
        return (
          <ul data-n={n()} onClick={() => setN(n() + 1)}>
            {rows.map(({ name }) => (
              <li key={name}>{1 + name}</li>
            ))}
          </ul>
        )
      }
    `))

    expect(tpl).not.toContain('1 + _p.name')
  })

  test('a Unicode loop param shadowing a const is still guarded (#2238 Copilot review)', () => {
    const tpl = templateLambda(clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget6({ values }: { values: number[] }) {
        const \u03c0: string = 'x'
        const [n, setN] = createSignal(0)
        return (
          <div data-n={n()} onClick={() => setN(n() + 1)}>
            <p>{\u03c0}</p>
            <ul>
              {values.map((\u03c0) => (
                <li key={\u03c0}>{1 + \u03c0}</li>
              ))}
            </ul>
          </div>
        )
      }
    `))

    // The Unicode param must be recognised as a bare identifier (not a
    // destructure pattern), so the const never substitutes in the body.
    expect(tpl).toContain('1 + \u03c0')
    expect(tpl).not.toContain("1 + ('x')")
  })

  test('a non-shadowing prop used inside the loop still rewrites to _p.<name>', () => {
    const tpl = templateLambda(clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget5({ prefix, values }: { prefix: string; values: number[] }) {
        const [n, setN] = createSignal(0)
        return (
          <ul data-n={n()} onClick={() => setN(n() + 1)}>
            {values.map((v) => (
              <li key={v}>{prefix + v}</li>
            ))}
          </ul>
        )
      }
    `))

    // A prop NOT shadowed by the loop param keeps its rewrite inside the body.
    expect(tpl).toContain('_p.prefix + v')
  })
})
