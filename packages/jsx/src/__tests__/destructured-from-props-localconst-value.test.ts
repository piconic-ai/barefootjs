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
import { compileJSX } from '../compiler'
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

    const result = compileJSX(source, 'Page.tsx', { adapter })
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

    const result = compileJSX(source, 'Foo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''

    // `count` is the signal getter — must stay as `count()`, not `_p.count()`
    expect(content).toMatch(/const\s+doubled\s*=\s*count\(\)\s*\*\s*2/)
    expect(content).not.toMatch(/const\s+doubled\s*=\s*_p\.count\(\)/)
  })

  // #2934: `const label = props.label ?? 'fallback'` is a PURE single-prop
  // alias — the analyzer's IR can't distinguish it from a destructure
  // (`const { label = 'fallback' } = props`), and `resolveBodyPropAliases`
  // deliberately treats both identically (see its docstring). So `label`'s
  // own declaration is now removed and every reference to it — including
  // from a DEPENDENT local's own initializer, `upper` here — becomes a
  // live `_p.label` read. This used to be named a "shadow guard" test, back
  // when `label` was expected to stay a captured-once local distinct from
  // the prop; that framing no longer applies now that a same-named pure
  // alias IS made live rather than left as its own local.
  test('a plain member-access prop alias is rewritten live, including from a dependent local', () => {
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

    const result = compileJSX(source, 'Foo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''

    // `label`'s own extraction is gone — it was a pure alias, not a real
    // computation of its own.
    expect(content).not.toMatch(/const\s+label\s*=/)
    // `upper` (still a real once-evaluated local — `.toUpperCase()` is a
    // computation) now sources its value directly from the live prop read.
    expect(content).toMatch(/const\s+upper\s*=\s*\(_p\.label\s*\?\?\s*'fallback'\)\.toUpperCase\(\)/)
  })
})
