/**
 * Regression tests for #1422: when the same identifier name is declared
 * as `const` inside multiple early-return `if`-blocks of a `'use client'`
 * component, barefoot's hoist pass kept only one declaration in outer
 * init scope — the last one encountered. Sibling branches' nested
 * function declarations ended up reading the wrong value at runtime.
 *
 * Distinct from #1414 (single-branch reference leakage). The bug here is
 * that nested function declarations inside a branch are captured by the
 * analyzer via the `collectFunction` path with their bodies as raw text.
 * The text references the branch-local `const`, but since multiple
 * branches declare the same name, only one survives as a top-level
 * binding — every branch's closure resolves to that one value.
 *
 * Fix: in `collectFunction`, walk the function's ancestor chain for any
 * enclosing conditional-return `if`-block and text-substitute its
 * `scopeVariables` references in the captured body. Mirrors the existing
 * `_branchScopeVars` route in `jsx-to-ir.ts` that handles JSX-return
 * raw-text capture (ref callbacks, event handlers, `{local()}` child
 * positions).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsContent(result: ReturnType<typeof compileJSX>): string {
  return result.files.find(f => f.type === 'clientJs')!.content
}

describe('same-name branch-local const referenced from nested function decl (#1422)', () => {
  test('two sibling branches with same-name const — each closure reads its branch value', () => {
    const source = `
      'use client'

      interface Props { mode: 'a' | 'b' }

      export function TwoBranches(props: Props) {
        if (props.mode === 'a') {
          const size = 'small'
          function attachA(el: HTMLElement) {
            el.dataset.size = size
          }
          return <div ref={attachA}>A</div>
        }
        const size = 'large'
        function attachB(el: HTMLElement) {
          el.dataset.size = size
        }
        return <div ref={attachB}>B</div>
      }
    `
    const result = compileJSX(source, 'TwoBranches.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const content = clientJsContent(result)

    // attachA's body must reference 'small', not 'large'.
    expect(content).toMatch(/attachA[\s\S]*?dataset\.size\s*=\s*\('small'\)/)
    // attachB stays as a top-level reference: `size` resolves to 'large' via the
    // outer init-scope const. Either form is acceptable as long as the value
    // observed at runtime is 'large'.
    const attachBBody = content.match(/attachB\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\}/)?.[0] ?? ''
    if (!attachBBody.includes("'large'")) {
      // If not inlined, the bare `size` reference must resolve to the only
      // outer-scope `const size = 'large'`.
      expect(content).toMatch(/const\s+size\s*=\s*'large'/)
      expect(attachBBody).toMatch(/\bsize\b/)
    }
  })

  test('three branches with same-name const (matches desk #86 phase 6 shape)', () => {
    const source = `
      'use client'

      interface Props { mode: 'a' | 'b' | 'c' }

      export function BranchLocalSameNameCollision(props: Props) {
        if (props.mode === 'a') {
          const size = 'small'
          function attachA(el: HTMLElement) {
            el.dataset.size = size
          }
          return <div ref={attachA}>A</div>
        }
        if (props.mode === 'b') {
          const size = 'medium'
          function attachB(el: HTMLElement) {
            el.dataset.size = size
          }
          return <div ref={attachB}>B</div>
        }
        const size = 'large'
        function attachC(el: HTMLElement) {
          el.dataset.size = size
        }
        return <div ref={attachC}>C</div>
      }
    `
    const result = compileJSX(source, 'ThreeBranches.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const content = clientJsContent(result)

    // Each branch closure reads its own branch's value.
    const attachABody = content.match(/attachA\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\}/)?.[0] ?? ''
    const attachBBody = content.match(/attachB\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\}/)?.[0] ?? ''

    expect(attachABody).toContain("'small'")
    expect(attachBBody).toContain("'medium'")

    // attachA must NOT read 'large' or 'medium'.
    expect(attachABody).not.toContain("'large'")
    expect(attachABody).not.toContain("'medium'")
    // attachB must NOT read 'large' or 'small'.
    expect(attachBBody).not.toContain("'large'")
    expect(attachBBody).not.toContain("'small'")
  })

  test('mixed initializer kinds (string vs number) under the same identifier', () => {
    const source = `
      'use client'

      interface Props { mode: 'a' | 'b' | 'c' }

      export function MixedKinds(props: Props) {
        if (props.mode === 'a') {
          const value = 'string-value'
          function attachA(el: HTMLElement) {
            el.dataset.value = String(value)
          }
          return <div ref={attachA}>A</div>
        }
        if (props.mode === 'b') {
          const value = 42
          function attachB(el: HTMLElement) {
            el.dataset.value = String(value)
          }
          return <div ref={attachB}>B</div>
        }
        const value = true
        function attachC(el: HTMLElement) {
          el.dataset.value = String(value)
        }
        return <div ref={attachC}>C</div>
      }
    `
    const result = compileJSX(source, 'MixedKinds.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const content = clientJsContent(result)

    const attachABody = content.match(/attachA\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\}/)?.[0] ?? ''
    const attachBBody = content.match(/attachB\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\}/)?.[0] ?? ''

    expect(attachABody).toContain("'string-value'")
    expect(attachBBody).toContain('42')

    expect(attachABody).not.toContain('42')
    expect(attachBBody).not.toContain("'string-value'")
  })

  test('destructured param shadows branch-local of the same name', () => {
    // Copilot review feedback: param-binding detection must recurse
    // into `ObjectBindingPattern` / `ArrayBindingPattern` so a
    // destructured param like `function f({ size }: { size: string })`
    // correctly shadows an outer branch-local `size`. Without the
    // recursive walk the substitution wrongly rewrites the param read
    // and the function body sees the wrong value.
    const source = `
      'use client'

      interface Props { mode: 'a' | 'b' }

      export function DestructuredParam(props: Props) {
        if (props.mode === 'a') {
          const size = 'small'
          function attach({ size }: { size: string }) {
            // Reads must reference the destructured param, NOT the
            // outer branch-local — text substitution must skip
            // identifiers shadowed by destructured params.
            return size
          }
          return <div ref={() => attach({ size: 'inner' })}>A</div>
        }
        return <div>B</div>
      }
    `
    const result = compileJSX(source, 'DestructuredParam.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const content = clientJsContent(result)
    const attachBody = content.match(/attach\s*=[^{]*\{[\s\S]*?\breturn\b[^}]*\}/)?.[0] ?? ''
    // The branch-local `('small')` literal must NOT be injected — the
    // param shadows it.
    expect(attachBody).not.toContain("'small'")
    // The `return size` reference must survive verbatim.
    expect(attachBody).toMatch(/return\s+size\b/)
  })

  test('branch-local identifier containing `$` substitutes correctly', () => {
    // Copilot review feedback: identifier-aware boundaries must allow
    // `$` as a name char (and escape it for regex use). Pre-fix the
    // `\\b` boundary treated `$` as a separator, and a name like
    // `wrapperHeight$0` would either fail to match or partial-match a
    // bare `wrapperHeight`.
    const source = `
      'use client'

      interface Props { kind: 'a' | 'b' }

      export function DollarIdent(props: Props) {
        if (props.kind === 'a') {
          const $size = '36px'
          function attach(el: HTMLElement) {
            el.style.minHeight = $size
          }
          return <div ref={attach}>A</div>
        }
        return <div>B</div>
      }
    `
    const result = compileJSX(source, 'DollarIdent.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const content = clientJsContent(result)
    // The branch-local should be substituted to its literal.
    expect(content).toContain("'36px'")
    // The bare `$size` reference must not survive (would ReferenceError at runtime).
    expect(content).not.toMatch(/=\s*\$size\b/)
  })

  test('chained branch-locals — substitution fixpoints across initializer references', () => {
    // Copilot review feedback: a branch-local initializer can itself
    // reference an earlier branch-local. A single replacement pass
    // would inline the second const but leave the first still bare in
    // the body. The fixpoint loop closes this.
    const source = `
      'use client'

      interface Props { kind: 'a' | 'b' }

      export function ChainedLocals(props: Props) {
        if (props.kind === 'a') {
          const a = 1
          const b = a + 1
          function attach(el: HTMLElement) {
            el.dataset.value = String(b)
          }
          return <div ref={attach}>A</div>
        }
        return <div>B</div>
      }
    `
    const result = compileJSX(source, 'ChainedLocals.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const content = clientJsContent(result)
    // After fixpoint substitution: `b` → `(a + 1)` → `((1) + 1)`.
    // Neither `a` nor `b` should survive as a bare identifier read in
    // the attach body.
    const attachBody = content.match(/attach\s*=[^{]*\{[\s\S]*?\}/)?.[0] ?? ''
    expect(attachBody).not.toMatch(/=\s*String\(b\)/)
    expect(attachBody).not.toMatch(/\(a\s*\+\s*1\)/)
    // The final inlined form preserves the numeric literal.
    expect(attachBody).toContain('1')
  })

  test('non-colliding branch-local — substitution still applies (covers prior single-branch shape)', () => {
    // Same fix path covers the prior single-branch case where a closure
    // references a branch-local without a same-name sibling. Without
    // substitution the bare `wrapperHeight` would leak to outer scope
    // and ReferenceError at runtime.
    const source = `
      'use client'

      interface Props { kind: 'a' | 'b' }

      export function SingleBranch(props: Props) {
        if (props.kind === 'a') {
          const wrapperHeight = '36px'
          function attachWrapper(w: HTMLElement) {
            w.style.minHeight = wrapperHeight
          }
          return <div ref={attachWrapper}>A</div>
        }
        return <div>B</div>
      }
    `
    const result = compileJSX(source, 'SingleBranch.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const content = clientJsContent(result)

    // The wrapperHeight identifier must NOT survive as a free reference;
    // it must be substituted with its literal value. The function body may
    // appear in arrow form (init scope) or `function (...) {...}` form
    // (module scope) depending on whether it still references any
    // init-required name after substitution.
    expect(content).toContain("'36px'")
    expect(content).not.toMatch(/=\s*wrapperHeight\b/)
  })
})
