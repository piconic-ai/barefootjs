/**
 * Regression for #3009: a `ref` on an element inside a conditional branch
 * within a keyed `.map()` row only fired if that branch happened to be
 * active when the row was CREATED — it never fired on any later branch
 * activation (a round-trip through the other branch, or simply starting on
 * the other branch).
 *
 * Root cause: `collectLoopChildRefs` (ir-to-client-js/reactivity.ts)
 * descended straight through a nested reactive conditional and hoisted the
 * branch's ref to ROW level, where it is emitted unconditionally once per
 * `mapArray` renderItem call (row creation) instead of once per branch
 * activation. The fix collects branch-interior refs via
 * `LoopChildBranchSummary.refs` (mirroring `events`) and emits them inside
 * the branch's own `insert()` bindEvents, alongside `stringifyBranchEvents`
 * — the same place events already fire on every branch swap (#2927).
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

  const dir = mkdtempSync(join(tmpdir(), 'bf-loop-branch-ref-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
  return clientJs
}

/** Keyed row, ref on the `a` branch, same key across every render. */
const BRANCH_REF_ROWS = `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { key: string; kind: 'a' | 'b'; label: string }
export function BranchRefRows() {
  const [rows, setRows] = createSignal<Row[]>([{ key: 'x', kind: 'a', label: 'hi' }])
  const toB = () => setRows([{ key: 'x', kind: 'b', label: 'hi' }])
  const toA = () => setRows([{ key: 'x', kind: 'a', label: 'hi' }])
  return (
    <div>
      <button id="to-a" onClick={toA}>a</button>
      <button id="to-b" onClick={toB}>b</button>
      <ul id="list">{rows().map(row => (
        <li key={row.key}>
          {row.kind === 'a' ? (
            <span ref={el => { el.dataset.mounted = 'yes' }}>{row.label}</span>
          ) : (
            <span>placeholder</span>
          )}
        </li>
      ))}</ul>
    </div>
  )
}
`

/** Same shape, but the row is CREATED on branch 'b' (ref never mounts first). */
const BRANCH_REF_ROWS_STARTS_B = `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { key: string; kind: 'a' | 'b'; label: string }
export function BranchRefRowsStartsB() {
  const [rows, setRows] = createSignal<Row[]>([{ key: 'x', kind: 'b', label: 'hi' }])
  const toA = () => setRows([{ key: 'x', kind: 'a', label: 'hi' }])
  return (
    <div>
      <button id="to-a" onClick={toA}>a</button>
      <ul id="list">{rows().map(row => (
        <li key={row.key}>
          {row.kind === 'a' ? (
            <span ref={el => { el.dataset.mounted = 'yes' }}>{row.label}</span>
          ) : (
            <span>placeholder</span>
          )}
        </li>
      ))}</ul>
    </div>
  )
}
`

describe('issue-3009 — ref on a keyed loop row\'s conditional branch', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('compiles the ref into the branch\'s own bindEvents, not the row-level renderItem body', async () => {
    const js = await compileAndRegister(BRANCH_REF_ROWS, 'BranchRefRows.tsx')
    // The ref callback must appear inside a bindEvents closure using
    // __branchScope (the insert()-mounted branch element), not looked up
    // off the row's own __el/__existing clone.
    const bindEventsIdx = js.indexOf('bindEvents')
    const refCallIdx = js.indexOf("el.dataset.mounted = 'yes'")
    expect(bindEventsIdx).toBeGreaterThan(-1)
    expect(refCallIdx).toBeGreaterThan(-1)
    expect(js.slice(bindEventsIdx, refCallIdx)).toContain('__branchScope')
  })

  test('ref re-fires when the branch is re-entered after a round-trip through the other branch', async () => {
    await compileAndRegister(BRANCH_REF_ROWS, 'BranchRefRowsRuntime.tsx')
    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('BranchRefRows', {}) as Element
    document.body.appendChild(el)
    const span = () => el.querySelector('#list li span')

    // 1. Mounted on 'a' — ref fires.
    expect(span()?.getAttribute('data-mounted')).toBe('yes')

    // 2. Swap to 'b' — placeholder, no ref.
    ;(el.querySelector('#to-b') as HTMLElement).click()
    expect(span()?.getAttribute('data-mounted')).toBeNull()

    // 3. Swap back to 'a' (SAME key throughout) — this is the defect: the
    //    ref must fire again, not stay silent because the row itself never
    //    unmounted.
    ;(el.querySelector('#to-a') as HTMLElement).click()
    expect(span()?.getAttribute('data-mounted')).toBe('yes')
  })

  test('ref fires on first activation even when the row is created on the OTHER branch', async () => {
    await compileAndRegister(BRANCH_REF_ROWS_STARTS_B, 'BranchRefRowsStartsB.tsx')
    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('BranchRefRowsStartsB', {}) as Element
    document.body.appendChild(el)
    const span = () => el.querySelector('#list li span')

    // Row created on 'b' — no ref yet.
    expect(span()?.getAttribute('data-mounted')).toBeNull()

    // First-ever activation of 'a' for this row (created on 'b', never
    // mounted 'a' before) — the ref must still fire.
    ;(el.querySelector('#to-a') as HTMLElement).click()
    expect(span()?.getAttribute('data-mounted')).toBe('yes')
  })
})
