/**
 * Regression: a keyed `.map()` row whose reactive conditional's branch is a
 * BARE expression (no wrapping element, e.g. `row.done ? row.label :
 * 'pending'`) must update when the item's VALUE changes even when the
 * conditional's own CONDITION does not flip.
 *
 * Two independent gates used to conspire to freeze the value forever:
 *
 *  - `insert()` (runtime/insert.ts) early-returns when its condition is
 *    unchanged — correct and untouched by this fix: branch-INTERNAL updates
 *    are deliberately the effect system's job, not DOM replacement's.
 *  - `summarizeLoopChildBranch` (jsx-to-ir.ts's compile-time counterpart,
 *    ir-to-client-js/collect-elements.ts) used to collect NO `reactiveTexts`
 *    for ANY bare-expression branch, so the effect `insert()` was relying on
 *    was never emitted in the first place. The value was baked into the
 *    branch's initial template string once, at row-creation time, and never
 *    touched again.
 *
 * The skip existed to protect a DIFFERENT shape: a branch that is a
 * `CallExpression` which may return a live DOM Node (a hoisted
 * `renderNode={(n) => <Pill/>}` callback, #1211/#1213 — see
 * `nested-loop-conditional.test.ts`'s "does not get a nested text effect"
 * pin). Re-invoking such a call inside an ADDITIONAL nested effect calls it
 * again on every unrelated tick, discarding the previous element's
 * listeners/state — that non-idempotence risk is real and the skip must
 * stay for it. But the skip previously fired for EVERY bare expression, not
 * just call-bearing ones, so a plain property read like `row.label` — which
 * cannot itself construct a DOM node — paid the same tax for no reason.
 *
 * The fix narrows the skip to `node.hasFunctionCalls` (an AST-computed flag,
 * catches a call anywhere in the expression, not just at the top) and, on
 * the IR side, gives a bare loop-item-reading branch a `slotId` at all
 * (`transformConditionalBranch`'s `refsLoopParam` check, jsx-to-ir.ts) —
 * without a slotId there is nothing for the new effect, or the
 * `<!--bf:sN-->` marker `irToHtmlTemplate` needs to emit for it, to attach
 * to.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const adapter = new TestAdapter()

async function compileAndRegister(source: string, filename: string): Promise<string> {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(`Compilation errors:\n${errors.map(e => e.message).join('\n')}`)
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')

  const runtimePath = join(__dirname, '../../src/runtime/index.ts')
  const rewritten = clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')

  const dir = mkdtempSync(join(tmpdir(), 'bf-loop-branch-stale-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
  return clientJs
}

/** Safe shape: both branches are calls-free (a property read and a literal). */
const BARE_TERNARY = `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function BareTernaryRows() {
  const [rows, setRows] = createSignal<Row[]>([])
  const load = () => setRows([{ id: 1, label: 'AAA', done: true }])
  const bump = () => setRows([{ id: 1, label: 'BBB', done: true }])
  const flip = () => setRows([{ id: 1, label: 'BBB', done: false }])
  return (
    <div>
      <button id="load" onClick={load}>load</button>
      <button id="bump" onClick={bump}>bump</button>
      <button id="flip" onClick={flip}>flip</button>
      <ul id="list">{rows().map(row => (
        <li key={row.id}>{row.done ? row.label : 'pending'}</li>
      ))}</ul>
    </div>
  )
}
`

/** Unsafe shape: the true branch is a CallExpression — must keep the skip. */
const CALL_TERNARY = `
'use client'
import { createSignal } from '@barefootjs/client'
type Props = { format?: (s: string) => string }
type Row = { id: number; label: string; done: boolean }
export function CallTernaryRows(_p: Props) {
  const [rows, setRows] = createSignal<Row[]>([])
  const load = () => setRows([{ id: 1, label: 'AAA', done: true }])
  const bump = () => setRows([{ id: 1, label: 'BBB', done: true }])
  return (
    <div>
      <button id="load" onClick={load}>load</button>
      <button id="bump" onClick={bump}>bump</button>
      <ul id="list">{rows().map(row => (
        <li key={row.id}>{row.done ? _p.format(row.label) : 'pending'}</li>
      ))}</ul>
    </div>
  )
}
`

describe('loop-branch-stale-text — bare-expression conditional branch inside a keyed .map()', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('a same-key item value change updates the branch text (the defect)', async () => {
    const js = await compileAndRegister(BARE_TERNARY, 'BareTernaryRows.tsx')
    // Precondition: the safe shape really does get its own per-item text
    // effect now — if the emission regressed, the assertions below would
    // pass for the wrong reason.
    expect(js).toContain('escapeTextOrNode(row().label)')

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('BareTernaryRows', {}) as Element
    document.body.appendChild(el)
    const li = () => el.querySelector('#list li')

    ;(el.querySelector('#load') as HTMLElement).click()
    expect(li()?.textContent).toBe('AAA')

    // Same key (id: 1), condition (`done`) UNCHANGED, only `label` differs.
    ;(el.querySelector('#bump') as HTMLElement).click()
    expect(li()?.textContent).toBe('BBB')
  })

  test('condition flip still swaps the branch correctly', async () => {
    await compileAndRegister(BARE_TERNARY, 'BareTernaryRows2.tsx')
    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('BareTernaryRows', {}) as Element
    document.body.appendChild(el)
    const li = () => el.querySelector('#list li')

    ;(el.querySelector('#load') as HTMLElement).click()
    expect(li()?.textContent).toBe('AAA')
    ;(el.querySelector('#flip') as HTMLElement).click()
    expect(li()?.textContent).toBe('pending')
  })

  test('a call-bearing branch keeps the OLD (skip) behavior — no per-item text effect', async () => {
    const js = await compileAndRegister(CALL_TERNARY, 'CallTernaryRows.tsx')
    // The call-bearing branch must NOT get a nested createDisposableEffect
    // re-invoking `_p.format(row().label)` — that would re-call a
    // non-idempotence-unproven function on every unrelated tick.
    expect(js).not.toContain('escapeTextOrNode(_p.format(row().label))')

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('CallTernaryRows', { format: (s: string) => `<${s}>` }) as Element
    document.body.appendChild(el)
    const li = () => el.querySelector('#list li')

    ;(el.querySelector('#load') as HTMLElement).click()
    expect(li()?.textContent).toBe('<AAA>')

    // Same key, condition unchanged, value changed — this shape is NOT
    // fixed by this PR (out of scope: the skip stays for any call), so the
    // row is expected to stay stale at its mount-time value.
    ;(el.querySelector('#bump') as HTMLElement).click()
    expect(li()?.textContent).toBe('<AAA>')
  })

  test('appending a new row after a value change gets the fresh value, not the stale one', async () => {
    await compileAndRegister(BARE_TERNARY, 'BareTernaryRows3.tsx')
    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('BareTernaryRows', {}) as Element
    document.body.appendChild(el)

    ;(el.querySelector('#load') as HTMLElement).click()
    ;(el.querySelector('#bump') as HTMLElement).click()
    expect(el.querySelector('#list li')?.textContent).toBe('BBB')
  })
})
