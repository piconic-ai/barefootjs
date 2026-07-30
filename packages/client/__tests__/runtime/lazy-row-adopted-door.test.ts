/**
 * The lazy row graph's content door is built on FIRST USE, not at claim time
 * (`spec/slot-unification.md` §9; `refParts`'s `deferDoor` note in
 * `jsx/src/ir-to-client-js/control-flow/stringify/lazy-row.ts`).
 *
 * Why that needed its own behavioural test rather than an emission assertion:
 * an ADOPTED (server-rendered) row's `entry.refs` now holds `null` in the door
 * slot, and the door is constructed against `__e.primaryEl` and the ADOPTED
 * claim plan the first time that row writes content. Every existing check
 * around this either
 *
 *  - asserts the emitted TEXT (`lazy-row-eligibility.test.ts`), which cannot
 *    tell a door that resolves from one that silently resolves to the wrong
 *    root, or
 *  - drives `createComponent` (`lazy-row-node-content.test.ts`), which is the
 *    CSR path where `createRow` still builds the door eagerly, so the deferred
 *    branch never runs, or
 *  - compares HTML shapes (`csr-conformance`, `ssr-hydration-contract`), which
 *    never execute a post-hydration update at all.
 *
 * So this renders the real Hono SSR markup, hydrates it, and then changes an
 * item — the one sequence in which the deferred door is the thing under test.
 * A regression here (wrong root, wrong plan, door never filled) shows up as a
 * row whose text stops tracking its item, which is exactly the silent class of
 * failure the lazy path is prone to.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { renderHonoComponent } from '../../../adapter-hono/src/test-render'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const adapter = new TestAdapter()
const runtimePath = join(__dirname, '../../src/runtime/index.ts')

/**
 * The shape the deferral targets: a keyed, single-root, conditional-free loop
 * whose row carries item-driven TEXTS plus one OUTER-involving attribute. The
 * outer class makes `applyOuter` exist (so every row is claimed at seed) while
 * giving it no content binding to seed — the case where the door was being
 * built for every row and used by none.
 *
 * `rename` changes an item's label, and `select` moves the outer signal, so
 * both apply paths are reachable against rows that came from the server.
 */
const SOURCE = `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string }
export function AdoptedRows() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 1, label: 'alpha' },
    { id: 2, label: 'beta' },
  ])
  const [selected, setSelected] = createSignal(0)
  const rename = () => setRows(rs => rs.map(r => (r.id === 2 ? { id: 2, label: 'renamed' } : r)))
  return (
    <div>
      <button id="rename" onClick={rename}>rename</button>
      <button id="select" onClick={() => setSelected(2)}>select</button>
      <table>
        <tbody id="rows">
          {rows().map(row => (
            <tr key={row.id} className={selected() === row.id ? 'danger' : 'plain'}>
              <td class="id">{row.id}</td>
              <td class="label">{row.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
`

function clientJsFor(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(`Compilation errors:\n${errors.map(e => e.message).join('\n')}`)
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error(`No client JS for ${filename}`)
  return clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')
}

async function setup(name: string): Promise<{ js: string; hydrate: () => void }> {
  const js = clientJsFor(SOURCE, `${name}.tsx`)
  const dir = mkdtempSync(join(tmpdir(), 'bf-adopted-door-'))
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, js)
  try {
    // The import registers the component with the runtime; once it resolves the
    // module is loaded and the file on disk is no longer needed.
    await import(file)
  } finally {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }

  document.body.innerHTML = await renderHonoComponent({
    adapter: new HonoAdapter(),
    source: SOURCE,
    props: { __instanceId: 'AdoptedRows_test' },
  })

  const { rehydrateAll, flushHydration } = await import(runtimePath)
  return {
    js,
    hydrate: () => {
      rehydrateAll()
      flushHydration()
    },
  }
}

const labels = (): string[] =>
  Array.from(document.querySelectorAll('#rows tr td.label')).map(td => td.textContent ?? '')

const classes = (): string[] =>
  Array.from(document.querySelectorAll('#rows tr')).map(tr => tr.getAttribute('class') ?? '')

describe('lazy row graph — deferred content door on ADOPTED rows', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('an adopted row whose item changes still updates its text', async () => {
    const { js, hydrate } = await setup('AdoptedRowsText')
    // Preconditions: without these the assertions below could pass on the
    // eager path or on an eagerly-built door, i.e. for the wrong reason.
    expect(js).toContain('mapArrayLazy(')
    expect(js).toMatch(/return \[qsa\(__el, '\[bf="s\d+"\]'\), null\]/)
    expect(js).toMatch(/const __d = __r\[\d\] \?\? \(__r\[\d\] = lazySlots\(__e\.primaryEl, __lzs_l0\)\)/)

    hydrate()
    expect(labels()).toEqual(['alpha', 'beta'])

    ;(document.querySelector('#rename') as HTMLElement).click()

    // The door had to be built here, from `__e.primaryEl` and the adopted
    // plan, for this to hold.
    expect(labels()).toEqual(['alpha', 'renamed'])
  })

  test('the outer class seeds and updates without the door being needed', async () => {
    const { hydrate } = await setup('AdoptedRowsClass')
    hydrate()
    // Seeded by read-compare-write against the server's markup.
    expect(classes()).toEqual(['plain', 'plain'])

    ;(document.querySelector('#select') as HTMLElement).click()
    expect(classes()).toEqual(['plain', 'danger'])
    // Untouched by the class pass — the door stayed unbuilt and no content
    // was rewritten.
    expect(labels()).toEqual(['alpha', 'beta'])
  })

  test('a later item change still lands after the outer pass already claimed the row', async () => {
    const { hydrate } = await setup('AdoptedRowsBoth')
    hydrate()

    // Claim every row through applyOuter FIRST (door slot stays null), then
    // force applyItem to fill that slot on an already-claimed row — the
    // ordering that would break if the door's absence were mistaken for "this
    // row has no refs yet".
    ;(document.querySelector('#select') as HTMLElement).click()
    ;(document.querySelector('#rename') as HTMLElement).click()

    expect(labels()).toEqual(['alpha', 'renamed'])
    expect(classes()).toEqual(['plain', 'danger'])
  })
})
