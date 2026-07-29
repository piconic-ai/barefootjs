/**
 * Emission pin for the loop-branch-stale-text fix.
 *
 * `summarizeLoopChildBranch` (ir-to-client-js/collect-elements.ts) used to
 * collect NO `reactiveTexts` for ANY loop-row conditional branch whose whole
 * content is a bare `expression` (no wrapping element) — including a plain
 * property read like `row.label`, which can never construct a live DOM
 * node. That blanket skip meant a keyed row's branch text silently froze at
 * its mount-time value whenever the item changed without the conditional's
 * OWN condition flipping (`insert()`, runtime/insert.ts, correctly no-ops
 * when its condition is unchanged — branch-internal updates are the effect
 * system's job).
 *
 * The fix narrows the skip to `node.hasFunctionCalls` (jsx-to-ir.ts's
 * `exprHasFunctionCalls`, a recursive AST walk — catches a call nested
 * anywhere, not just a top-level one) — a call can return a live DOM node
 * (a hoisted `renderNode={(n) => <Pill/>}` callback lowered to a component
 * call, #1211/#1213, pinned by `nested-loop-conditional.test.ts`) and the
 * compiler cannot tell from syntax whether it does, so that shape must keep
 * the skip. Everything call-free is provably incapable of yielding a Node
 * and is now collected.
 *
 * The companion half of the fix lives in `transformConditionalBranch`
 * (jsx-to-ir.ts): a bare loop-item read like `row.label` previously got NO
 * `slotId` at all (`needsSlot` didn't consider a `render-item` free
 * reference), so even with the collect-elements.ts skip narrowed there was
 * nothing for the new effect — or the `<!--bf:sN-->` marker
 * `irToHtmlTemplate` emits for it — to attach to. Both are exercised here
 * together because neither half alone reproduces the fix.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(branchTrue: string): string {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    type Props = { format?: (s: string) => string }
    type Row = { id: number; label: string; done: boolean }
    export function C(_p: Props) {
      const [rows] = createSignal<Row[]>([])
      return <ul>{rows().map(row => <li key={row.id}>{row.done ? ${branchTrue} : 'pending'}</li>)}</ul>
    }
  `
  const result = compileJSX(source, 'C.tsx', { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => e.message).join('\n'))
  return result.files.find(f => f.type === 'clientJs')!.content
}

describe('loop-branch-stale-text — reactiveTexts narrowing (collect-elements.ts)', () => {
  test('a bare property-read branch (no call anywhere) gets its own text effect', () => {
    const js = clientJsFor('row.label')
    expect(js).toContain("escapeTextOrNode(row().label)")
    // And a slotId was actually allocated for it — `transformConditionalBranch`'s
    // `refsLoopParam` half of the fix, without which the effect above would
    // have nothing to `lazySlots(...)` claim.
    expect(js).toMatch(/lazySlots\(__branchScope, \[\{ id: 's\d+', kind: 'markup', path: \[\] \}\]\)/)
  })

  test('a template-literal branch built from property reads only (no call) also gets a text effect', () => {
    const js = clientJsFor('`[${row.label}]`')
    expect(js).toContain('escapeTextOrNode(`[${row().label}]`)')
  })

  test('a branch with a call ANYWHERE (top-level) keeps the skip — no per-item text effect', () => {
    const js = clientJsFor('_p.format(row.label)')
    expect(js).not.toContain('escapeTextOrNode(_p.format(row().label))')
    // bindEvents for that arm stays empty (mirrors the pre-fix shape exactly).
    expect(js).toMatch(/bindEvents: \(__branchScope, \{ isFirstRun: __bfFirstRun = false \} = \{\}\) => \{\s*\}/m)
  })

  test('a branch with a call NESTED inside a template literal also keeps the skip', () => {
    // The call is not at the top level of the expression — `exprHasFunctionCalls`
    // is a full recursive AST walk, so this must be caught too.
    const js = clientJsFor('`${_p.format(row.label)}!`')
    expect(js).not.toContain("escapeTextOrNode(`${_p.format(row().label)}!`)")
  })

  test('a branch with a call nested inside a sub-ternary keeps the skip', () => {
    const js = clientJsFor("row.id > 0 ? _p.format(row.label) : row.label")
    // The outer branch (itself a nested conditional) is unaffected by this
    // narrowing — nested conditionals already get their own `insert()` via
    // `collectLoopChildConditionals`, never through `reactiveTexts`. This
    // case exists to confirm compilation succeeds and the call-bearing leaf
    // still doesn't get a bare reactiveTexts effect wrapping the whole
    // nested-ternary expression text.
    expect(js).not.toContain('escapeTextOrNode(row.id > 0 ? _p.format(row().label) : row().label)')
  })

  test('an inert literal branch (no loop-param ref, no call) stays exactly as before — no slotId, no effect', () => {
    const js = clientJsFor("'yes'")
    expect(js).not.toContain("escapeTextOrNode('yes')")
  })
})
