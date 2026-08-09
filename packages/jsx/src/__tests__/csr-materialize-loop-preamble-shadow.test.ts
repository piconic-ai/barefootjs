/**
 * #2482 Stage 1b — `generateCsrTemplateWithOpts`'s (`html-template.ts`)
 * CSR "materialize" template lambda (the `hydrate(..., { template })`
 * function used to render a loop's rows client-side with no SSR markup to
 * hydrate against) const-folded a `.map()` callback preamble local (#2447)
 * into an outer, same-named module-level const, instead of leaving the
 * row-local binding unresolved.
 *
 * Root cause: the `loop` case's `opts.loopBoundNames` — a flat
 * `Set<string>` re-unioned per recursion level — only ever accumulated
 * the loop's item / index / destructured-binding names, never the
 * callback's preamble-declared locals (#2447 postdates the original
 * `loopBoundNames` shadow fix, #2222). Migrating onto `BindingScope`'s
 * `enterLoopRow` (which binds item ∪ index ∪ destructure ∪ preamble
 * `declaredNames` uniformly) closes the gap.
 *
 * Observable failure mode before the fix: every row's branch condition
 * evaluated the constant's fixed truthiness instead of the row's own
 * preamble-computed value — e.g. every `<li>` rendered its "true" branch
 * regardless of the actual per-item condition.
 *
 * Modeled on `csr-template-loop-shadowing.test.ts` (the pre-#2447
 * item/index/destructured-param shadowing pins for this same template
 * lambda) and `binding-scope-preamble-shadowing.test.ts` (the IR-level
 * preamble-shadowing analogue this test is the CSR-codegen-level sibling
 * of).
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

describe('CSR materialize template vs .map() preamble-local shadowing a module const (#2482)', () => {
  test('a preamble local shadowing a module const stays row-local in the hydrate template lambda', () => {
    const tpl = templateLambda(clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget({ items }: { items: { name: string; active: boolean }[] }) {
        const label = 'MODULE_CONST'
        const [on, setOn] = createSignal(true)
        return (
          <div onClick={() => setOn(false)}>
            <ul>
              {items.map((item) => {
                const label = item.active && on()
                return <li key={item.name}>{label ? <span>yes</span> : <span>no</span>}</li>
              })}
            </ul>
          </div>
        )
      }
    `))

    // The row-local `label` (the preamble's OWN computed value) must
    // drive the branch — never the outer module const's literal.
    //
    // The branch also carries a `bf-c="s0"` slot marker on both arms
    // (#2596 follow-up): `label`'s initializer reads the real signal `on()`,
    // so `markPreambleConditionalReactivity` now grants this conditional a
    // slot id and the `reactive` flag it lacked before — the SAME
    // observable-failure-mode class this file's docstring describes
    // ("every row's branch condition evaluated the constant's fixed
    // truthiness"), just for the signal dimension instead of the shadowing
    // one. Nothing else about this fixture's shape changed.
    expect(tpl).toContain('label ? `<span bf-c="s0">yes</span>` : `<span bf-c="s0">no</span>`')
    expect(tpl).not.toContain("('MODULE_CONST')")
    expect(tpl).not.toContain('MODULE_CONST')
  })
})
