/**
 * Pins the rewrite of bare prop references inside `localConstants`
 * values for `(props)`-arg components that destructure inside the body.
 *
 * Without the rewrite, a dependant const like
 *   `const cacheKey = \`desk-\${org}-\${projectNumber}\``
 * would keep bare `${org}` / `${projectNumber}` in the emitted init body
 * and throw `ReferenceError` (TDZ) once the minifier collapses the
 * declarations into a single comma-separated `const` chain.
 *
 * Includes a shadow-guard test: a signal / memo / earlier local that
 * happens to share a name with a prop must NOT be rewritten — bare refs
 * to it target the local binding, not `_p.X`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('destructured-from-props-object → localConstants value rewrite', () => {
  test('bare prop refs inside a dependant local const are rewritten to `_p.X` in init body', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props {
        org: string
        projectNumber: number
      }

      export function Page(props: Props) {
        const { org, projectNumber } = props
        // Reference inside a side-effect closure so the const isn't
        // statically inlined into the template.
        const cacheKey = \`desk-\${org}-\${projectNumber}\`
        const [count, setCount] = createSignal(0)
        return (
          <div onClick={() => setCount(count() + cacheKey.length)}>
            {count()}
          </div>
        )
      }
    `

    const result = compileJSXSync(source, 'Page.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''

    expect(content).toMatch(/cacheKey\s*=\s*`desk-\$\{_p\.org\}-\$\{_p\.projectNumber\}`/)
    // The bare `${org}` / `${projectNumber}` form must NOT appear in the
    // const initializer — the minifier would TDZ on it later when it
    // collapses the function-scope `const`s into a single comma chain.
    expect(content).not.toMatch(/cacheKey\s*=\s*`desk-\$\{org\}/)
  })

  test('shadow guard: signal getter that shadows a prop is NOT rewritten', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props {
        count?: number
      }

      export function Foo(props: Props) {
        const [count, setCount] = createSignal(0)
        const doubled = count() * 2
        return <span>{doubled}</span>
      }
    `

    const result = compileJSXSync(source, 'Foo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''

    // `count` is the signal getter — must stay as `count()`, not `_p.count()`
    expect(content).toMatch(/const\s+doubled\s*=\s*count\(\)\s*\*\s*2/)
    expect(content).not.toMatch(/const\s+doubled\s*=\s*_p\.count\(\)/)
  })

  test('shadow guard: earlier local that shadows a prop is NOT rewritten', () => {
    const source = `
      'use client'

      interface Props {
        label?: string
      }

      export function Foo(props: Props) {
        const label = props.label ?? 'fallback'
        const upper = label.toUpperCase()
        return <span>{upper}</span>
      }
    `

    const result = compileJSXSync(source, 'Foo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''

    // `label` here is the local const (shadowing the prop). The init body
    // emits `const label = _p.label ?? 'fallback'` (late-stage rename),
    // and `upper` should reference the LOCAL `label`, not `_p.label`.
    expect(content).toMatch(/const\s+upper\s*=\s*label\.toUpperCase\(\)/)
    expect(content).not.toMatch(/const\s+upper\s*=\s*_p\.label\.toUpperCase\(\)/)
  })
})
