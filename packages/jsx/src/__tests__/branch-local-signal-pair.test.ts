/**
 * Regression tests for #1414 cell #8: a `createSignal(...)` destructured
 * pair declared inside an early-return `if`-block silently vanishes from
 * the emitted client JS. Sibling closures, event handlers, and template
 * scopes that reference the pair then hit
 * `ReferenceError: getter is not defined` at runtime, with no compiler
 * diagnostic.
 *
 * The earlier #1414 fixes (#1410 / #1412 / #1415 / #1417) all relied on
 * **text substitution** — inlining the local's initializer per use site.
 * That approach can't represent a signal pair, because the pair has
 * identity: the setter must mutate state observed by the getter, so
 * duplicating `createSignal(...)` per call site would create disconnected
 * signals.
 *
 * Fix: **hoist** the signal-pair declaration to outer init scope, guarded
 * by the if-condition. Closures, event handlers, and template references
 * then resolve at their natural scope without code reshuffle.
 *
 * Emitted shape after fix (conceptual):
 *
 *     let X, setX
 *     if (cond) [X, setX] = createSignal(initial)
 *     // …closures and handlers see X / setX from this outer scope…
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compile(source: string) {
  const result = compileJSX(source, 'BranchSignalPair.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  const clientJs = result.files.find(f => f.type === 'clientJs')
  if (!clientJs) throw new Error('no client JS emitted')
  return { code: clientJs.content }
}

describe('createSignal pair declared inside an early-return if-block (#1414 cell #8)', () => {
  test('signal pair + closure getter + event-handler setter — all references resolve', () => {
    const { code } = compile(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props { kind: 'a' | 'b' }

      export function BranchSignalPair(props: Props) {
        if (props.kind === 'a') {
          const [hovered, setHovered] = createSignal(false)

          function attachBar(bar: HTMLElement) {
            if (hovered()) bar.style.background = 'red'
          }

          return (
            <div
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
            >
              <div ref={attachBar}>A</div>
            </div>
          )
        }
        return <div>B</div>
      }
    `)

    // 1. The signal-pair declaration is preserved somewhere in the
    //    emitted file. The exact shape (top-of-init `let` + branch-guarded
    //    assignment, vs another representation) is left to the
    //    implementation, but the createSignal call must survive.
    expect(code).toContain('createSignal(false)')

    // 2. Both the getter and setter names appear in the init body.
    //    Without the fix today the entire destructuring statement is
    //    dropped — neither name is declared.
    expect(code).toMatch(/\bhovered\b/)
    expect(code).toMatch(/\bsetHovered\b/)

    // 3. The setter calls inside event handlers reach a declared binding.
    //    Accepted forms:
    //    - `let hovered, setHovered` (cell-#8 hoist shape)
    //    - `const [hovered, setHovered] = createSignal(...)` (legacy)
    //    - any other declaration that puts `setHovered` in scope
    //    What we reject is the bare `setHovered(true)` call appearing in
    //    the body without any declaration anywhere — the original bug.
    const declRe = /(let|const|var)\s+([\w,\s]*\bsetHovered\b|\[[^\]]*setHovered[^\]]*\])/
    expect(code).toMatch(declRe)
  })

  test('sibling branches with independent signal pairs do not cross-pollute', () => {
    const { code } = compile(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props { kind: 'a' | 'b' | 'c' }

      export function SiblingPairs(props: Props) {
        if (props.kind === 'a') {
          const [aSig, setASig] = createSignal('a-initial')
          return (
            <div onClick={() => setASig('a-clicked')}>{aSig()}</div>
          )
        }
        if (props.kind === 'b') {
          const [bSig, setBSig] = createSignal('b-initial')
          return (
            <div onClick={() => setBSig('b-clicked')}>{bSig()}</div>
          )
        }
        return <div>C</div>
      }
    `)

    // Both pairs survive
    expect(code).toContain("createSignal('a-initial')")
    expect(code).toContain("createSignal('b-initial')")
    // Both getters / setters referenced in event handlers + template
    expect(code).toMatch(/\baSig\b/)
    expect(code).toMatch(/\bsetASig\b/)
    expect(code).toMatch(/\bbSig\b/)
    expect(code).toMatch(/\bsetBSig\b/)
  })

  test('setter passed as function argument to an imported helper resolves', () => {
    // The Phase 6 file uses `attachHoverTracking(w, setCompactHovered, …)`
    // where the imported helper takes the setter as a function arg.
    // Verify that consumer position resolves the same as call-site
    // setters in event handlers.
    const { code } = compile(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { wire } from './helpers'

      interface Props { kind: 'a' | 'b' }

      export function HelperArgSetter(props: Props) {
        if (props.kind === 'a') {
          const [hovered, setHovered] = createSignal(false)
          function attachBar(bar: HTMLElement) {
            wire(bar, setHovered)
            if (hovered()) bar.style.color = 'red'
          }
          return <div ref={attachBar}>A</div>
        }
        return <div>B</div>
      }
    `)

    expect(code).toContain('createSignal(false)')
    expect(code).toMatch(/\bhovered\b/)
    expect(code).toMatch(/\bsetHovered\b/)
    // Setter passed as a value — bare identifier reference must survive
    expect(code).toMatch(/wire\([^,]+,\s*setHovered\)/)
  })
})
