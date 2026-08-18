/**
 * #2654 — the CSR `template:` lambda must declare its own env-signal
 * getter (`createSearchParams()`, #2057) before referencing it, instead
 * of relying on `init`'s `const [<getter>] = createSearchParams()`
 * closure — the template lambda runs at module scope and has no access
 * to that init-local binding, so the bare call ReferenceErrors at
 * template-evaluation time.
 *
 * See `buildTemplateDefPart` in `../ir-to-client-js/emit-registration.ts`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compileClient(source: string, fileName: string): string {
  const result = compileJSX(source, fileName, { adapter })
  expect(result.errors).toHaveLength(0)
  const clientJs = result.files.find((f) => f.type === 'clientJs')
  return clientJs?.content ?? ''
}

describe('#2654 — env-signal getter self-declared in the template lambda', () => {
  test('default getter name (`searchParams`): template lambda declares its own copy', () => {
    const source = `
      import { createSearchParams } from '@barefootjs/client'
      export function SortLabel() {
        const [searchParams] = createSearchParams()
        return <p>{searchParams().get('sort') ?? 'none'}</p>
      }
    `
    const clientJs = compileClient(source, 'SortLabel.tsx')

    // The template lambda gets a block body with its own prelude
    // declaration ahead of the returned template literal.
    expect(clientJs).toMatch(
      /template:\s*\(_p\)\s*=>\s*\{\s*const \[searchParams\] = createSearchParams\(\);\s*return\s*`/,
    )
    // The getter call inside the template body is untouched (still a
    // real call — csr-substitute.ts deliberately leaves env-signal
    // getters as live calls, not baked initial values).
    expect(clientJs).toMatch(/\$\{escapeText\(searchParams\(\)\.get\('sort'\) \?\? 'none'\)\}/)
    // `init` keeps its own independent destructure — unaffected by the
    // template-lambda prelude.
    expect(clientJs).toMatch(/export function initSortLabel[\s\S]*const \[searchParams\] = createSearchParams\(\)/)
  })

  test('aliased getter name (`sp`): prelude uses the destructured alias, not the canonical name', () => {
    const source = `
      'use client'
      import { createMemo, createSearchParams } from '@barefootjs/client'
      export function SortStatus() {
        const [sp] = createSearchParams()
        const sort = createMemo(() => sp().get('sort') ?? 'date')
        return <p>sort: {sort()}</p>
      }
    `
    const clientJs = compileClient(source, 'SortStatus.tsx')

    expect(clientJs).toMatch(
      /template:\s*\(_p\)\s*=>\s*\{\s*const \[sp\] = createSearchParams\(\);\s*return\s*`/,
    )
    // The memo body substitution inlines the memo's computation, still
    // calling the self-declared `sp()` getter — no bare, undeclared
    // reference reaches the module-scope lambda.
    expect(clientJs).toMatch(/sp\(\)\.get\('sort'\) \?\? 'date'/)
  })

  test('component with no env signal keeps the plain expression-body template (no prelude leak)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Counter() {
        const [count] = createSignal(0)
        return <p>{count()}</p>
      }
    `
    const clientJs = compileClient(source, 'Counter.tsx')

    // Plain expression-body form — unconditional prelude emission must
    // not leak into components that hold no env signal.
    expect(clientJs).toMatch(/template:\s*\(_p\)\s*=>\s*`/)
    expect(clientJs).not.toMatch(/template:\s*\(_p\)\s*=>\s*\{/)
  })
})
