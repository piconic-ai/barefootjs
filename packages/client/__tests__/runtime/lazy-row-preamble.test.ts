/**
 * A row whose `.map()` callback has a value-only PREAMBLE, run end to end:
 * compile the component, import the emitted module, mount it, read the DOM.
 *
 * The compiler side is pinned by unit tests (`jsx/src/__tests__/
 * lazy-preamble.test.ts`, `preamble-attr-reactivity.test.ts`). What those
 * cannot show is that the emitted plan actually RUNS — the preamble declares
 * a local the row reads, so a wrong order or a missing splice produces a row
 * with an empty or stale attribute rather than a compile error.
 *
 * ## What is checked
 *
 *  1. A CSR-created row gets the preamble-derived attribute value.
 *  2. A same-key item update REWRITES it. This is the behaviour the follow-up
 *     added: before it, `applyItem` reused the row node and re-ran only the
 *     wired slots, of which the class was not one, so row 1 kept `open` after
 *     its item turned `done: true` while the sibling text updated normally.
 *     Now `class={cls}` is a binding, `applyItem` re-runs the preamble ahead
 *     of it, and the write lands.
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

describe('a row with a value-only map-callback preamble', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('CSR-created rows get the preamble-derived attribute and the item text', async () => {
    const js = await compileAndRegister(ROWS, 'PreambleRows.tsx')
    // Precondition: this shape is on the LAZY path, and stays there even
    // though `class={cls}` is now a real binding (#2447 follow-up) — the
    // apply bodies re-run the preamble instead of the gate refusing. Without
    // this the assertions below could pass on the eager path for the wrong
    // reason: it also renders correctly, it just pays a root + effect per row.
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
    expect(items[0].textContent).toBe('shipped it')
    // The point of the follow-up: row 1's item is now `done: true`, so the
    // preamble recomputes `cls` and the row effect writes it. This assertion
    // read `'open'` before the fix — the same DOM node, the same key, the
    // sibling text updated, and the class left behind.
    expect(items[0].getAttribute('class')).toBe('done')
    // Row 2 was `done` all along and must not have been disturbed.
    expect(items[1].getAttribute('class')).toBe('done')
  })
})
