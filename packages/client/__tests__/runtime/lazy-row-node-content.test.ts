/**
 * Regression: a lazy loop row's content slot must be able to hold a live Node.
 *
 * The lazy row graph (`spec/slot-unification.md` §9) claims every row content
 * slot as `kind: 'text'`, because that is the cheap door — a Text node write
 * through `nodeValue`, no range bookkeeping. But a child-position
 * interpolation can evaluate to a real element rather than a string:
 *
 *   {_p.renderCell(row.id)}
 *
 * where the caller passes an inline-JSX arrow, which the compiler lifts into a
 * component whose call returns a live Node. A Text node cannot host an
 * element, so before this fix the emitted `String(__x)` collapsed it — the
 * user saw the serialized markup as visible text (or `[object
 * HTMLDivElement]`, depending on the DOM implementation's `toString`), and
 * nothing ever corrected it. Two properties make that failure silent:
 *
 *  - Nothing overwrites the row afterwards. The other Node-bearing shapes are
 *    self-healing by accident — a conditional's `insert()` re-renders through
 *    `__bfSlot`, and a non-loop reactive text re-applies through
 *    `escapeTextOrNode` — so the wrong value is transient there and only the
 *    lazy row keeps it.
 *  - The lazy gate ACCEPTS this shape. A prop accessor is an opaque outer
 *    read, which the re-subscribe seam (§9.3a) made eligible, so the row goes
 *    down the lazy path and the destructive write is what ships.
 *
 * The fix keeps the cheap door and decides on the VALUE: `textOrNode` passes
 * a Node through instead of stringifying it, and the claim promotes that slot
 * from 'text' to 'markup' on first Node write, reusing the anchor it already
 * resolved. Whether such a call yields a string or a Node is not decidable
 * from the expression's syntax — both are `CallExpression` — so this has to
 * be a runtime decision, not a compile-time classification.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { lazySlots } from '../../src/runtime/claim-slots'
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

  const dir = mkdtempSync(join(tmpdir(), 'bf-lazy-node-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
  return clientJs
}

/**
 * A keyed plain loop whose row content is a call on a caller-supplied prop —
 * the eligible-for-lazy shape. `renderCell` returns a live element, which is
 * what the caller of a `renderX` prop is expected to be able to do.
 */
const ROWS = `
'use client'
import { createSignal } from '@barefootjs/client'
type Props = { renderCell: (id: number) => unknown }
export function NodeRows(_p: Props) {
  const [rows, setRows] = createSignal<{ id: number }[]>([])
  const load = () => setRows([{ id: 1 }])
  const append = () => setRows([{ id: 1 }, { id: 2 }])
  return (
    <div>
      <button id="load" onClick={load}>load</button>
      <button id="append" onClick={append}>append</button>
      <ul id="list">{rows().map(r => (
        <li key={r.id}>{_p.renderCell(r.id)}</li>
      ))}</ul>
    </div>
  )
}
`

describe('lazy row content slot — live Node values', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('a Node-valued row binding renders as an element, not as text', async () => {
    const js = await compileAndRegister(ROWS, 'NodeRows.tsx')
    // Precondition: this row really is on the lazy path. If the gate stops
    // accepting the shape, the assertions below would pass for the wrong
    // reason (the eager path routes through `__bfSlot`, which never had the
    // bug), so pin it.
    expect(js).toContain('mapArrayLazy(')
    expect(js).toContain('textOrNode(__x)')

    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('NodeRows', {
      renderCell: (id: number) => {
        const b = document.createElement('b')
        b.className = 'cell'
        b.textContent = `N${id}`
        return b
      },
    }) as Element
    document.body.appendChild(el)
    ;(el.querySelector('#load') as HTMLElement).click()

    const cells = el.querySelectorAll('#list li b.cell')
    expect(cells.length).toBe(1)
    expect(cells[0].textContent).toBe('N1')
    // The failure mode was the element surviving only as characters.
    expect(el.querySelector('#list')!.innerHTML).not.toContain('&lt;b')
    expect(el.querySelector('#list')!.innerHTML).not.toContain('[object')
  })

  test('rows added later get their own elements', async () => {
    await compileAndRegister(ROWS, 'NodeRows2.tsx')
    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('NodeRows', {
      renderCell: (id: number) => {
        const b = document.createElement('b')
        b.className = 'cell'
        b.textContent = `N${id}`
        return b
      },
    }) as Element
    document.body.appendChild(el)
    ;(el.querySelector('#load') as HTMLElement).click()
    ;(el.querySelector('#append') as HTMLElement).click()

    const cells = [...el.querySelectorAll('#list li b.cell')].map(n => n.textContent)
    expect(cells).toEqual(['N1', 'N2'])
  })
})

describe('claim door — text slot receiving a Node', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('promotes the claim to markup and splices the node', () => {
    const host = document.createElement('div')
    host.innerHTML = 'before<!--bf:s0-->old<!--/-->after'
    document.body.appendChild(host)

    const write = lazySlots(host, [{ id: 's0', kind: 'text', path: [] }])
    const node = document.createElement('em')
    node.textContent = 'live'
    write('s0', node)

    expect(host.querySelector('em')?.textContent).toBe('live')
    // Boundaries survive every write, and the adopted Text node is gone.
    expect(host.innerHTML).toBe('before<!--bf:s0--><em>live</em><!--/-->after')
  })

  test('a later string write on the promoted slot still lands', () => {
    const host = document.createElement('div')
    host.innerHTML = '<!--bf:s0-->old<!--/-->'
    document.body.appendChild(host)

    const write = lazySlots(host, [{ id: 's0', kind: 'text', path: [] }])
    const node = document.createElement('em')
    write('s0', node)
    write('s0', 'plain')

    expect(host.querySelector('em')).toBeNull()
    expect(host.innerHTML).toBe('<!--bf:s0-->plain<!--/-->')
  })

  test('the same node written twice is a no-op, not a re-splice', () => {
    const host = document.createElement('div')
    host.innerHTML = '<!--bf:s0--><!--/-->'
    document.body.appendChild(host)

    const write = lazySlots(host, [{ id: 's0', kind: 'text', path: [] }])
    const node = document.createElement('em')
    node.textContent = 'x'
    write('s0', node)
    const first = host.querySelector('em')
    write('s0', node)

    expect(host.querySelector('em')).toBe(first)
    expect(host.querySelectorAll('em').length).toBe(1)
  })

  test('string values are untouched by the Node branch', () => {
    const host = document.createElement('div')
    host.innerHTML = '<!--bf:s0-->old<!--/-->'
    document.body.appendChild(host)

    const write = lazySlots(host, [{ id: 's0', kind: 'text', path: [] }])
    // Markup-looking text must stay text — the 'text' door does not parse.
    write('s0', '<em>not markup</em>')

    expect(host.querySelector('em')).toBeNull()
    expect(host.textContent).toBe('<em>not markup</em>')
  })
})
