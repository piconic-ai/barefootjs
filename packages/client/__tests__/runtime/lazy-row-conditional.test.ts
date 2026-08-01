/**
 * A lazy row containing a reactive CONDITIONAL — the §9.5 widening
 * (`jsx/src/ir-to-client-js/control-flow/plan/lazy-conditional.ts`).
 *
 * The eager path calls `insert()` per row, which creates one `createEffect` per
 * row. For a conditional whose arms are wiring-free static elements, all of
 * `insert`'s work reduces to replacing the `[bf-c]` element — so the loop-level
 * apply bodies drive it and the row keeps zero reactive resources.
 *
 * That reduction is only safe if the swap really happens, in both directions,
 * on both row shapes. The compiler tests can show the emitted shape; only
 * running it can show the DOM ends up right. So this compiles the component,
 * imports the emitted module, mounts it, and reads the DOM:
 *
 *  - a CSR-created row renders the correct arm and flips on an item change
 *    (`applyItem` — the row `createRow` cloned already had the right arm, so a
 *    bug here is a swap that never fires, not one that fires wrongly);
 *  - the flip goes BOTH ways, because the dedup boolean and the arm choice are
 *    separate pieces of state and only a round trip exercises both;
 *  - the element ref is reassigned after a swap. Without that the second flip
 *    would write into a node detached by the first — which is exactly the bug
 *    a one-way test would miss.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { renderHonoComponent } from '../../../adapter-hono/src/test-render'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'
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

  const dir = mkdtempSync(join(tmpdir(), 'bf-lazy-cond-'))
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
type Row = { id: number; done: boolean }
export function CondRows() {
  const [rows, setRows] = createSignal<Row[]>([])
  const load = () => setRows([{ id: 1, done: false }, { id: 2, done: true }])
  const flip = () => setRows(rs => rs.map(r => ({ ...r, done: !r.done })))
  return (
    <div>
      <button id="load" onClick={load}>load</button>
      <button id="flip" onClick={flip}>flip</button>
      <ul id="list">{rows().map(row => (
        <li key={row.id}>{row.done ? <span class="yes">done</span> : <em class="no">open</em>}</li>
      ))}</ul>
    </div>
  )
}
`

const arms = (el: Element): string[] =>
  Array.from(el.querySelectorAll('#list li')).map(li => li.firstElementChild?.className ?? '')

describe('lazy row with a wiring-free reactive conditional', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('rows render the right arm and flip both ways on item change', async () => {
    const js = await compileAndRegister(ROWS, 'CondRows.tsx')
    // Preconditions. Without these the DOM assertions would pass on the eager
    // `insert()` path, which was never broken — it just costs an effect per row.
    expect(js).toContain('mapArrayLazy(')
    expect(js).not.toMatch(/\bmapArray\(/)
    expect(js).not.toContain('insert(')
    // The arms are parsed once per LOOP, not per row.
    expect(js).toMatch(/const __cbt_l0_s\d+ = document\.createElement\('template'\)/)

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('CondRows', {}) as Element
    document.body.appendChild(el)
    ;(el.querySelector('#load') as HTMLElement).click()
    expect(arms(el)).toEqual(['no', 'yes'])

    // First flip: both rows swap arms.
    ;(el.querySelector('#flip') as HTMLElement).click()
    expect(arms(el)).toEqual(['yes', 'no'])

    // Second flip: only lands if the ref was reassigned after the first swap.
    ;(el.querySelector('#flip') as HTMLElement).click()
    expect(arms(el)).toEqual(['no', 'yes'])
  })

  test('the row holds no per-row reactive resources', async () => {
    const js = await compileAndRegister(ROWS, 'CondRows2.tsx')
    const plan = js.slice(js.indexOf('mapArrayLazy('), js.indexOf("}, 'l0')"))
    expect(plan).not.toContain('createEffect')
    expect(plan).not.toContain('createRoot')
    expect(plan).not.toContain('createSignal')
  })
})

/**
 * The ADOPTED (server-rendered) row is the risky half and the one the CSR test
 * above cannot reach. `applyItem` resolves the arm by `qsa(primaryEl,
 * '[bf-c="sN"]')`, so this only works if SSR actually emits `bf-c` on the arm
 * root — it does, but the cross-adapter conformance comparison STRIPS `bf-c`
 * before comparing, so reading the fixture's expected HTML would suggest
 * otherwise. Verified here against a real Hono render instead of by reasoning.
 *
 * A silently-missing arm element would make `if (__c)` skip and the row would
 * simply never swap — no error, no warning. That is precisely the failure this
 * test exists to make loud.
 */
const OUTER = `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number }
export function AdoptedCondRows(props: { rows: Row[] }) {
  const [rows, setRows] = createSignal<Row[]>(props.rows)
  const [open, setOpen] = createSignal(false)
  return (
    <div>
      <button id="toggle" onClick={() => setOpen(true)}>toggle</button>
      <ul id="list">{rows().map(row => (
        <li key={row.id}>{open() ? <span class="yes">on</span> : <em class="no">off</em>}</li>
      ))}</ul>
    </div>
  )
}
`

describe('lazy row conditional on ADOPTED (server-rendered) rows', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('an outer-driven conditional seeds against SSR and then swaps every row', async () => {
    const js = await compileAndRegister(OUTER, 'AdoptedCondRows.tsx')
    expect(js).toContain('mapArrayLazy(')
    // The condition reads an outer signal, so it lands in `applyOuter` with the
    // §9.3(1) seed comparison and `open` on the prime list.
    expect(js).toContain('applyOuter:')
    expect(js).toMatch(/__seed \? \(__c\.outerHTML !== __w\.outerHTML\)/)

    document.body.innerHTML = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: OUTER,
      componentName: 'AdoptedCondRows',
      props: { rows: [{ id: 1 }, { id: 2 }], __instanceId: 'AdoptedCondRows_test' },
    })
    // Precondition: the arm really carries `bf-c` in server output — the whole
    // adopted-row claim depends on it.
    expect(document.body.innerHTML).toContain('bf-c=')

    const { rehydrateAll, flushHydration } = await import('../../src/runtime')
    rehydrateAll()
    flushHydration()

    // SSR rendered the false arm and the client agrees, so the seed compares
    // equal and writes nothing.
    expect(arms(document.body)).toEqual(['no', 'no'])

    ;(document.querySelector('#toggle') as HTMLElement).click()
    expect(arms(document.body)).toEqual(['yes', 'yes'])
  })
})
