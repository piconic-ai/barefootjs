/**
 * End-to-end runtime test for #2189: a delegated list-item handler that closes
 * over the `.map()` index param.
 *
 * `items().map((item, i) => <button onClick={() => setClicked(i)} />)` lowers to
 * a single delegated `click` listener on the container. Before the fix that
 * dispatcher re-derived the *item* from `data-key` but dropped the *index*, so
 * `i` was a dangling reference and the click threw
 * `ReferenceError: i is not defined`. This mounts the real compiled output in a
 * DOM, clicks a row, and asserts the handler ran with the correct index.
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
  const dir = mkdtempSync(join(tmpdir(), 'bf-2189-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  await import(file)
  const { createComponent } = await import(runtimePath)
  const el = createComponent(name, {}) as HTMLElement
  document.body.appendChild(el)
  return el
}

describe('#2189 — delegated handler closing over the .map() index', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('clicking a row runs the index handler with the correct index (no ReferenceError)', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number }
      export function IndexHandler() {
        const [items] = createSignal<Item[]>([{ id: 10 }, { id: 20 }, { id: 30 }])
        const [clicked, setClicked] = createSignal(-1)
        return (
          <div>
            <p>{clicked()}</p>
            <ul>
              {items().map((item, i) => (
                <li key={item.id}>
                  <button onClick={() => setClicked(i)}>{item.id}</button>
                </li>
              ))}
            </ul>
          </div>
        )
      }
    `
    const el = await mount(source, 'IndexHandler.tsx', 'IndexHandler')
    const p = el.querySelector('p')!
    expect(p.textContent).toBe('-1')

    const buttons = Array.from(el.querySelectorAll('button'))
    expect(buttons).toHaveLength(3)

    // Click the SECOND row — its index is 1.
    buttons[1].dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(p.textContent).toBe('1')

    // Click the THIRD row — its index is 2.
    buttons[2].dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(p.textContent).toBe('2')

    // Click the FIRST row — its index is 0.
    buttons[0].dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(p.textContent).toBe('0')
  })

  test('index and item property can be used together in one handler', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number }
      export function IndexAndItem() {
        const [items] = createSignal<Item[]>([{ id: 10 }, { id: 20 }, { id: 30 }])
        const [out, setOut] = createSignal('')
        return (
          <div>
            <p>{out()}</p>
            <ul>
              {items().map((item, i) => (
                <li key={item.id}>
                  <button onClick={() => setOut(item.id + ':' + i)}>{item.id}</button>
                </li>
              ))}
            </ul>
          </div>
        )
      }
    `
    const el = await mount(source, 'IndexAndItem.tsx', 'IndexAndItem')
    const p = el.querySelector('p')!
    const buttons = Array.from(el.querySelectorAll('button'))

    buttons[2].dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(p.textContent).toBe('30:2')
  })
})
