/**
 * A lazy row whose `.map()` callback has a value-only PREAMBLE — the §9.5
 * widening (`jsx/src/ir-to-client-js/control-flow/plan/lazy-preamble.ts`).
 *
 * The compiler side is pinned by unit tests (`jsx/src/__tests__/
 * lazy-preamble.test.ts`): which preambles are accepted, and that the accepted
 * one is emitted into `createRow` only. What those cannot show is that the
 * emitted plan actually RUNS — the preamble declares a local that the row
 * template interpolates, so a wrong order or a missing splice produces a row
 * with an empty attribute rather than a compile error.
 *
 * So this runs it: compile the component, import the emitted module, mount it,
 * and read the DOM. Two things are checked, and they are the two the widening
 * could plausibly break:
 *
 *  1. A CSR-created row gets the preamble-derived attribute value. This is the
 *     `createRow` splice, and it must land BEFORE the clone whose template
 *     literal reads the local.
 *  2. A same-key item update still writes the row's item-driven text. `applyItem`
 *     deliberately does NOT re-run the preamble (no binding may read a local —
 *     `lazyRowEligibility` refuses that), so this pins that leaving it out did
 *     not strand the bindings that body does own.
 *
 * The attribute is creation-time by construction: an attribute reading a
 * preamble local is not classified as reactive, so it is interpolated into the
 * template rather than wired. That is true of the eager path too and is not a
 * behaviour this widening changes — see the `class` assertion after the update,
 * which pins the CURRENT contract rather than an aspiration.
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

  const dir = mkdtempSync(join(tmpdir(), 'bf-lazy-preamble-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
  return clientJs
}

const ROWS = `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
export function PreambleRows() {
  const [rows, setRows] = createSignal<Row[]>([])
  const load = () => setRows([{ id: 1, label: 'write it', done: false }, { id: 2, label: 'ship it', done: true }])
  const rename = () => setRows([{ id: 1, label: 'shipped it', done: true }, { id: 2, label: 'ship it', done: true }])
  return (
    <div>
      <button id="load" onClick={load}>load</button>
      <button id="rename" onClick={rename}>rename</button>
      <ul id="list">{rows().map(row => {
        const cls = row.done ? 'done' : 'open'
        return <li key={row.id} class={cls}>{row.label}</li>
      })}</ul>
    </div>
  )
}
`

describe('lazy row with a value-only map-callback preamble', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('CSR-created rows get the preamble-derived attribute and the item text', async () => {
    const js = await compileAndRegister(ROWS, 'PreambleRows.tsx')
    // Precondition: this shape really is on the lazy path. Without it the
    // assertions below would pass for the wrong reason — the eager path also
    // renders the row correctly, it just pays a root + effect per row.
    expect(js).toContain('mapArrayLazy(')
    expect(js).not.toMatch(/\bmapArray\(/)

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('PreambleRows', {}) as Element
    document.body.appendChild(el)
    ;(el.querySelector('#load') as HTMLElement).click()

    const items = el.querySelectorAll('#list li')
    expect(items.length).toBe(2)
    expect(items[0].getAttribute('class')).toBe('open')
    expect(items[1].getAttribute('class')).toBe('done')
    expect(items[0].textContent).toBe('write it')
    expect(items[1].textContent).toBe('ship it')
  })

  test('a same-key item change still writes the row text', async () => {
    await compileAndRegister(ROWS, 'PreambleRows2.tsx')
    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('PreambleRows', {}) as Element
    document.body.appendChild(el)
    ;(el.querySelector('#load') as HTMLElement).click()
    ;(el.querySelector('#rename') as HTMLElement).click()

    const items = el.querySelectorAll('#list li')
    expect(items.length).toBe(2)
    // `applyItem` owns this and does not re-run the preamble.
    expect(items[0].textContent).toBe('shipped it')
    // The preamble-derived attribute is creation-time on BOTH emission paths
    // (an attribute reading a preamble local is never classified as reactive),
    // so row 1 keeps `open` even though its item is now `done: true`. Pinned
    // so a future change to that classification shows up here as a decision,
    // not as a surprise.
    expect(items[0].getAttribute('class')).toBe('open')
  })
})
