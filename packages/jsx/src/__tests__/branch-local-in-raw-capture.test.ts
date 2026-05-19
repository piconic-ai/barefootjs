/**
 * Regression tests for the remaining #1414 cells. #1415 covered the
 * element-attribute position (`style={local}`, `className={local}`,
 * generic `attr={local}`) by short-circuiting bare-identifier
 * attribute values to their initializer AST before the
 * attribute-shape probes. Two cells remained where the branch local
 * was reached through a path that doesn't visit a bare-identifier
 * substitution site:
 *
 *   - **Cell 5b** — `ref={(el) => use(local)}` — the ref callback's
 *     body is captured verbatim via `ctx.getJS`, so the local
 *     identifier appears unchanged in the emitted init function.
 *   - **Cell 7** — `{local()}` — the JSX expression's root is a
 *     CallExpression, not an Identifier, so
 *     `transformExpressionInner`'s identifier check passes through
 *     and the scalar fallback emits the raw `local()` text into
 *     both the template lambda and the init `createEffect`.
 *
 * Fix: in `buildIfStatementChain`, around each branch's
 * `transformNode` call, override `ctx.getJS` so every raw-text
 * capture substitutes branch-local identifiers with their
 * initializer text. JSX-bearing initializers are skipped (text
 * substitution into raw JS would emit JSX as TypeScript syntax —
 * invalid); those are still handled by the existing JSX-child
 * identifier-substitution route from #1410.
 *
 * Trade-off: text-level substitution duplicates the initializer per
 * use site. A local read with side effects evaluates at every use,
 * not once at declaration. Same trade-off as #547 / #1410 / #1412
 * — users who need single-evaluation semantics hoist the local to
 * outer init scope.
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

describe('branch-local references inside raw-captured JS (#1414 follow-ups)', () => {
  test('cell 7: call-typed branch local at `{local()}` child position', () => {
    // Pre-fix: emitted `${local()}` in the template lambda and
    // `const __val = local()` in the init createEffect, both with
    // `local` undeclared at outer scope. Post-fix: the arrow
    // initializer is substituted at every use site so the value
    // evaluates correctly.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function fmt(v: number) { return 'v=' + v }

      export function CallTyped(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = () => fmt(count())
          return <div>A: {local()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'CallTyped.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const content = clientJsContent(result)
    expect(content).not.toMatch(/\blocal\b/)
    // The call's arrow body lands at both the template substitution
    // (count() bridged to its initial value at template scope) and
    // the init createEffect (count() runs reactively).
    expect(hydrateLine(result)).toContain('fmt((0))')
    expect(content).toContain('fmt(count())')
  })

  test('cell 7b: scalar-returning function-valued branch local', () => {
    // Same shape, simpler initializer — guards that the substitution
    // doesn't depend on the body containing a signal read.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ScalarFunc(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = () => 42
          return <div>A: {local()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'ScalarFunc.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const content = clientJsContent(result)
    expect(content).not.toMatch(/\blocal\b/)
    expect(hydrateLine(result)).toContain('(() => 42)()')
  })

  test('cell 5b: scalar branch local referenced inside a `ref` callback body', () => {
    // The ref callback's body is captured as raw text. Pre-fix the
    // identifier appeared unchanged in `(el) => { el.dataset.flag =
    // local }` at outer init scope. Post-fix the scalar initializer
    // text replaces every reference.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function RefCallback(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const label = 'highlighted'
          return <div ref={(el) => { el.dataset.flag = label }}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'RefCallback.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const content = clientJsContent(result)
    expect(content).not.toMatch(/\blabel\b/)
    expect(content).toContain("'highlighted'")
  })

  test('cell 5b variant: branch local referenced inside an event handler body', () => {
    // Same raw-text-capture surface as ref callbacks. Event handlers
    // ride through `ctx.getJS(attr.initializer.expression)` and
    // would otherwise leak the same way.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function EventHandler(props: { kind: 'a' | 'b' }) {
        const [count, setCount] = createSignal(0)
        if (props.kind === 'a') {
          const inc = 7
          return <button onClick={() => setCount(count() + inc)}>A: {count()}</button>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'EventHandler.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const content = clientJsContent(result)
    expect(content).not.toMatch(/\binc\b/)
    expect(content).toContain('count() + (7)')
  })

  test('sibling branches: substitution overlay does not leak to other branches', () => {
    // Each branch installs its own `getJS` override, restored
    // before the next branch starts.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Siblings(props: { kind: 'a' | 'b' | 'c' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = () => 'A-only'
          return <div>A: {local()} {count()}</div>
        }
        if (props.kind === 'b') {
          const local = () => 'B-only'
          return <div>B: {local()} {count()}</div>
        }
        return <div>C: {count()}</div>
      }
    `
    const result = compileJSX(source, 'Siblings.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const hydrate = hydrateLine(result)
    expect(hydrate).toContain('A-only')
    expect(hydrate).toContain('B-only')
    // C branch must not see either sibling's local.
    expect(hydrate).not.toMatch(/\blocal\b/)
  })
})
