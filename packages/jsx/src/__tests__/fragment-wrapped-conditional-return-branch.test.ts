/**
 * Diagnostic tests for BF029 (#3063).
 *
 * A `'use client'` component with an early-return branch whose OTHER
 * branch is wrapped in a bare fragment (`return <>…</>`) is never fully
 * hydrated: `ComponentDef`'s `comment` / `fragmentRoot` flags
 * (`emit-registration.ts`) are decided once per component from
 * `ir.root.type === 'if-statement'`, which can't say "branch A needs the
 * comment-scope boundary, branch B doesn't" — so hydration never claims
 * the fragment-wrapped branch's root (SSR and a fresh CSR mount are both
 * correct; only claiming existing SSR markup during hydrate misses it).
 * Fail loud at compile time instead of shipping a branch whose events
 * silently never bind, with a `/* @client *\/` escape for the case an author
 * accepts the known gap.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { ErrorCodes } from '../errors'

const adapter = new TestAdapter()

function findBF029(errors: ReturnType<typeof compileJSX>['errors']) {
  return errors.filter(e => e.code === ErrorCodes.FRAGMENT_WRAPPED_CONDITIONAL_RETURN_BRANCH)
}

describe('BF029 — fragment-wrapped branch of a conditional return', () => {
  test('fires when the final (else) branch is a bare fragment', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ConditionalReturnFragmentBranch(props: { x: boolean }) {
        const [count, setCount] = createSignal(0)
        if (props.x) return <a>link</a>
        return <><button onClick={() => setCount(count() + 1)}>button: {count()}</button></>
      }
    `
    const result = compileJSX(source, 'ConditionalReturnFragmentBranch.tsx', { adapter })
    const matches = findBF029(result.errors)
    expect(matches).toHaveLength(1)
    expect(matches[0].severity).toBe('error')
    expect(matches[0].message).toContain('/* @client */')
  })

  test('fires when a non-final (if) branch is a bare fragment', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function IfBranchFragment(props: { x: boolean }) {
        const [count, setCount] = createSignal(0)
        if (props.x) {
          return <><button onClick={() => setCount(count() + 1)}>button: {count()}</button></>
        }
        return <a>link</a>
      }
    `
    const result = compileJSX(source, 'IfBranchFragment.tsx', { adapter })
    expect(findBF029(result.errors)).toHaveLength(1)
  })

  test('does not fire when every branch is a bare element (no fragment)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function AllElements(props: { x: boolean }) {
        const [count, setCount] = createSignal(0)
        if (props.x) return <a>link</a>
        return <button onClick={() => setCount(count() + 1)}>button: {count()}</button>
      }
    `
    const result = compileJSX(source, 'AllElements.tsx', { adapter })
    expect(findBF029(result.errors)).toHaveLength(0)
  })

  test('does not fire for a non-"use client" component (never hydrates)', () => {
    const source = `
      export function StaticFragmentBranch(props: { x: boolean }) {
        if (props.x) return <a>link</a>
        return <><span>static</span></>
      }
    `
    const result = compileJSX(source, 'StaticFragmentBranch.tsx', { adapter })
    expect(findBF029(result.errors)).toHaveLength(0)
  })

  test('/* @client */ immediately before the fragment escapes the refusal', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function EscapedFragmentBranch(props: { x: boolean }) {
        const [count, setCount] = createSignal(0)
        if (props.x) return <a>link</a>
        return /* @client */ <><button onClick={() => setCount(count() + 1)}>button: {count()}</button></>
      }
    `
    const result = compileJSX(source, 'EscapedFragmentBranch.tsx', { adapter })
    expect(findBF029(result.errors)).toHaveLength(0)
  })
})
