/**
 * Diagnostic tests for BF047 (#1414 cell 5).
 *
 * A JSX-typed `const X = <jsx/>` declared inside an early-return
 * `if`-block cannot be referenced from a callback body (ref / event
 * handler). Substituting the JSX literal into the raw-captured
 * callback body would produce TS JSX inside a JS string (invalid);
 * leaving the bare identifier produces a runtime ReferenceError at
 * hydrate. Fail loud at compile time and point at the
 * children-position workaround.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { ErrorCodes } from '../errors'

const adapter = new TestAdapter()

function findBF047(errors: ReturnType<typeof compileJSX>['errors']) {
  return errors.filter(e => e.code === ErrorCodes.JSX_BRANCH_LOCAL_IN_CALLBACK)
}

describe('BF047 — JSX-typed branch local referenced inside a callback body', () => {
  test('fires for ref={(el) => use(local)} where `local` is a JSX literal in if-block', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function JsxInRef(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = <span>x</span>
          return <div ref={(el) => { el.appendChild(local) }}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'JsxInRef.tsx', { adapter })
    const matches = findBF047(result.errors)
    expect(matches).toHaveLength(1)
    expect(matches[0].severity).toBe('error')
    expect(matches[0].message).toContain("'local'")
    // Workaround pointer in the message.
    expect(matches[0].message).toContain('{local}')
  })

  test('fires for event-handler body that references a JSX branch local', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function JsxInClick(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = <span>x</span>
          return <div onClick={() => { document.body.appendChild(local) }}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'JsxInClick.tsx', { adapter })
    expect(findBF047(result.errors)).toHaveLength(1)
  })

  test('fires for ternary-JSX initializer too (the #1412 shape)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TernaryJsxInRef(props: { kind: 'a' | 'b'; show: boolean }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = props.show ? <span>x</span> : null
          return <div ref={(el) => { if (local) el.appendChild(local as any) }}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'TernaryJsxInRef.tsx', { adapter })
    expect(findBF047(result.errors)).toHaveLength(1)
  })

  test('does NOT fire for scalar branch local in ref callback (#1417 handles it)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ScalarInRef(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const label = 'highlighted'
          return <div ref={(el) => { el.dataset.flag = label }}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'ScalarInRef.tsx', { adapter })
    expect(findBF047(result.errors)).toHaveLength(0)
  })

  test('does NOT fire when the JSX branch local is used only as a child (#1410 inlines it)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function JsxAsChild(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = <span>x</span>
          return <div ref={(el) => el.focus()}>{local} A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'JsxAsChild.tsx', { adapter })
    expect(findBF047(result.errors)).toHaveLength(0)
  })

  test('sibling branches do not cross-pollute the JSX-local name set', () => {
    // Each branch installs its own `_jsxBranchLocalNames`; a JSX
    // local in branch A must not flag a same-named scalar local in
    // branch B's callback.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Siblings(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = <span>x</span>
          return <div>{local} A: {count()}</div>
        }
        const local = 'hello'
        return <div ref={(el) => { el.title = local }}>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'Siblings.tsx', { adapter })
    expect(findBF047(result.errors)).toHaveLength(0)
  })
})
