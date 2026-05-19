/**
 * Regression tests for #1409: a JSX expression in an early-return
 * branch that referenced a `const` declared inside that same
 * `if`-block compiled to a `.client.js` whose `createEffect(() =>
 * updateClientMarker(__scope, 's*', localVar))` (or template
 * `${localVar}`) was emitted at outer init scope — where `localVar`
 * doesn't exist. Runtime then fired `ReferenceError: localVar is not
 * defined` and the component failed to mount.
 *
 * Fix: extend the IR-level JSX-const inlining (#547) to also inline
 * `const X = …` declared inside an early-return `if`-block. When a
 * JSX expression's identifier matches one of these branch-scope
 * variables, `transformExpressionInner` re-enters the dispatch chain
 * with the initializer expression in place of the identifier — JSX
 * literal → inline element, dynamic shape (ternary / `&&` / `??`) →
 * preserve `@client` and emit IRConditional, scalar → emit the
 * initializer text directly. The branch overlay is saved/restored
 * around each `transformNode(condReturn.jsxReturn)` call so sibling
 * branches don't see each other's locals.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsContent(result: ReturnType<typeof compileJSX>): string {
  return result.files.find(f => f.type === 'clientJs')!.content
}

function hydrateLine(result: ReturnType<typeof compileJSX>): string {
  const line = clientJsContent(result).split('\n').find(l => l.includes('hydrate('))
  if (!line) throw new Error('no hydrate() call in client JS')
  return line
}

describe('JSX expression referencing a local declared inside an early-return if-block (#1409)', () => {
  test("issue exact repro: `/* @client */` reference to a JSX-valued scope var inlines at use site", () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function EarlyReturnLocalRef(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)

        if (props.kind === 'a') {
          const aLocal = <span>(a local)</span>
          return (
            <div>
              <span>view A: {count()}</span>
              {/* @client */ aLocal}
            </div>
          )
        }
        return (
          <div>
            <span>view B: {count()}</span>
          </div>
        )
      }
    `
    const result = compileJSX(source, 'EarlyReturnLocalRef.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const content = clientJsContent(result)

    // Pre-fix: emitted `updateClientMarker(__scope, 's4', aLocal)` at
    // outer init scope — `aLocal` undefined. Post-fix: the JSX is
    // inlined directly into the template, so the createEffect /
    // updateClientMarker block is not needed at all for this static
    // shape.
    expect(content).not.toContain('updateClientMarker')
    expect(content).not.toMatch(/\baLocal\b/)

    const hydrate = hydrateLine(result)
    expect(hydrate).toContain('<span>(a local)</span>')
  })

  test('scalar (string literal) scope var substitutes into the @client emit', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function StringLocal(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const label = 'hello'
          return <div><span>view A: {count()}</span>{/* @client */ label}</div>
        }
        return <div><span>view B: {count()}</span></div>
      }
    `
    const result = compileJSX(source, 'StringLocal.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const content = clientJsContent(result)
    // The bare `label` identifier must not appear in the emitted init
    // function — it's resolved to its initializer value at IR-build
    // time.
    expect(content).not.toMatch(/updateClientMarker\([^)]*\blabel\b[^)]*\)/)
    expect(content).toContain("updateClientMarker(__scope, 's4', 'hello')")
  })

  test('ternary scope var (`readOnly ? null : <jsx/>`) routes to client-only conditional', () => {
    // Mirror of the user's real-world case from
    // piconic-ai/desk #86 Phase 6:
    //   `const compactResize = readOnly ? null : <div .../>`
    //   `{/* @client */ compactResize}`
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function CompactResize(props: { kind: 'a' | 'b'; readOnly: boolean }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const compactResize = props.readOnly ? null : <div class="handle">resize</div>
          return <div><span>view A: {count()}</span>{/* @client */ compactResize}</div>
        }
        return <div><span>view B: {count()}</span></div>
      }
    `
    const result = compileJSX(source, 'CompactResize.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const content = clientJsContent(result)
    // Pre-fix: `updateClientMarker(__scope, 's*', compactResize)`
    // referenced an undeclared name. Post-fix: the ternary becomes an
    // IRConditional with `clientOnly: true`, routed through `insert()`
    // — and `props.readOnly` is rewritten to `_p.readOnly`.
    expect(content).not.toMatch(/\bcompactResize\b/)
    expect(content).toContain('insert(__scope')
    expect(content).toMatch(/_p\.readOnly/)
  })

  test('non-`/* @client */` reference to a JSX-valued scope var also works (template emits inline)', () => {
    // The scope issue was symmetric: even without `@client`, the
    // template lambda referenced the undeclared name at module
    // scope — same `ReferenceError` surface at first render.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function NoClient(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const aLocal = <span>(a local)</span>
          return <div><span>view A: {count()}</span>{aLocal}</div>
        }
        return <div><span>view B: {count()}</span></div>
      }
    `
    const result = compileJSX(source, 'NoClient.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const content = clientJsContent(result)
    expect(content).not.toMatch(/\baLocal\b/)
    expect(hydrateLine(result)).toContain('<span>(a local)</span>')
  })

  test('sibling branches do not see each other\'s scope variables', () => {
    // Regression guard: the overlay is saved/restored per-branch.
    // If it leaked, branch B's reference to `branchALocal` would
    // resolve to branch A's initializer — wrong content.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Sibling(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const branchALocal = <span>only-A</span>
          return <div><span>view A: {count()}</span>{branchALocal}</div>
        }
        return <div><span>view B: {count()}</span></div>
      }
    `
    const result = compileJSX(source, 'Sibling.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const hydrate = hydrateLine(result)
    // Branch A's content includes "only-A". Branch B does not.
    expect(hydrate).toContain('only-A')
    // Branch B's template must not reference the leaked name.
    expect(hydrate).not.toMatch(/\bbranchALocal\b/)
  })
})
