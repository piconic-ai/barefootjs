/**
 * End-to-end runtime test for #2930: a `.map()` row's `stopPropagation()`
 * must stop the row's static container's own handler for the same event —
 * both used to land as separate `addEventListener` calls on the identical
 * DOM node (the delegated dispatcher and the container's own listener),
 * so `stopPropagation()` (which only blocks bubbling to OTHER nodes, never
 * other listeners on the SAME node) couldn't stop the container's handler.
 *
 * Mounts the real compiled output in a DOM and dispatches real
 * `contextmenu` events, mirroring the issue's reproduction.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const adapter = new TestAdapter()

async function mount(source: string, filename: string, name: string): Promise<HTMLElement> {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter((e) => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compile errors in ${filename}:\n${errors.map((e) => `${e.code}: ${e.message}`).join('\n')}`)
  }
  const clientJs = result.files.find((f) => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')
  const runtimePath = join(__dirname, '../../src/runtime/index.ts')
  const rewritten = clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')
  const dir = mkdtempSync(join(tmpdir(), 'bf-2930-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  await import(file)
  const { createComponent } = await import(runtimePath)
  const el = createComponent(name, {}) as HTMLElement
  document.body.appendChild(el)
  return el
}

function rightClick(el: Element): void {
  el.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
}

describe('#2930 — row stopPropagation() vs. container own handler', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('static array: row stopPropagation() suppresses the container own handler', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const items = ['a', 'b', 'c']
      export function Repro() {
        const [log, setLog] = createSignal('')
        return (
          <div>
            <p>{log()}</p>
            <div
              className="container"
              onContextMenu={(e) => { e.preventDefault(); setLog(l => l + 'container;') }}
            >
              {items.map(item => (
                <div
                  key={item}
                  data-item={item}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setLog(l => l + 'row(' + item + ');')
                  }}
                >
                  row {item}
                </div>
              ))}
            </div>
          </div>
        )
      }
    `
    const el = await mount(source, 'StaticRepro.tsx', 'Repro')
    const p = el.querySelector('p')!
    const container = el.querySelector('.container')!
    const rowB = container.querySelector('[data-item="b"]')!

    rightClick(rowB)
    expect(p.textContent).toBe('row(b);')

    // Right-clicking the container's own background (no row under the
    // cursor) still runs the container's own handler — unaffected by the
    // merge, same as a plain always-firing listener would.
    rightClick(container)
    expect(p.textContent).toBe('row(b);container;')
  })

  test('dynamic loop: row stopPropagation() suppresses the container own handler', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Repro() {
        const [items] = createSignal(['a', 'b', 'c'])
        const [log, setLog] = createSignal('')
        return (
          <div>
            <p>{log()}</p>
            <div
              className="container"
              onContextMenu={(e) => { e.preventDefault(); setLog(l => l + 'container;') }}
            >
              {items().map(item => (
                <div
                  key={item}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setLog(l => l + 'row(' + item + ');')
                  }}
                >
                  row {item}
                </div>
              ))}
            </div>
          </div>
        )
      }
    `
    const el = await mount(source, 'DynamicRepro.tsx', 'Repro')
    const p = el.querySelector('p')!
    const container = el.querySelector('.container')!
    const rows = Array.from(container.children)

    rightClick(rows[1])
    expect(p.textContent).toBe('row(b);')
  })

  test('row handler WITHOUT stopPropagation still lets the container handler fire (unchanged)', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const items = ['a', 'b']
      export function Repro() {
        const [log, setLog] = createSignal('')
        return (
          <div>
            <p>{log()}</p>
            <div
              className="container"
              onContextMenu={(e) => { e.preventDefault(); setLog(l => l + 'container;') }}
            >
              {items.map(item => (
                <div key={item} data-item={item} onContextMenu={(e) => { e.preventDefault(); setLog(l => l + 'row(' + item + ');') }}>
                  row {item}
                </div>
              ))}
            </div>
          </div>
        )
      }
    `
    const el = await mount(source, 'NoStopRepro.tsx', 'Repro')
    const p = el.querySelector('p')!
    const container = el.querySelector('.container')!
    const rowA = container.querySelector('[data-item="a"]')!

    rightClick(rowA)
    // Row handler runs first (deepest-first), then the container's own
    // handler still fires since nothing called stopPropagation().
    expect(p.textContent).toBe('row(a);container;')
  })
})
