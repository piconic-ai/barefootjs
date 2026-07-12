/**
 * End-to-end runtime test for #2218: a NESTED (inner) `.map()` callback
 * declaring a positional index parameter and referencing it — as `key`, or
 * in reactive text/attrs, or a template interpolation — used to throw
 * `ReferenceError: i is not defined` and render nothing, because
 * `NestedLoop` never threaded the index param through `loopKeyFn` or the
 * `mapArray` renderItem body (unlike `TopLevelLoop`/`BranchLoop`, and unlike
 * the sibling fix for delegated event handlers in #2189).
 *
 * Mounts the real compiled output in a DOM (not just template-eval — see
 * `packages/adapter-tests/src/__tests__/csr-conformance.test.ts`, which only
 * evaluates the `template()` lambda and can't reach this bug) so the
 * `mapArray` renderItem body — where the `ReferenceError` actually threw —
 * runs for real.
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
  const dir = mkdtempSync(join(tmpdir(), 'bf-2218-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  await import(file)
  const { createComponent } = await import(runtimePath)
  const el = createComponent(name, {}) as HTMLElement
  document.body.appendChild(el)
  return el
}

describe('#2218 — nested .map() index param referenced in key/text/attr', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('mounting does not throw, and key={i} + text interpolation of i render correctly', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; text: string }
      interface Group { id: number; items: Item[] }
      export function Repro() {
        const [outer] = createSignal<Group[]>([
          { id: 1, items: [{ id: 11, text: 'a' }, { id: 12, text: 'b' }] },
        ])
        return (
          <div>
            {outer().map((o) => (
              <div key={o.id}>
                {o.items.map((item, i) => (
                  <span key={i}>{i}: {item.text}</span>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const el = await mount(source, 'NestedIndexRepro.tsx', 'Repro')
    const spans = Array.from(el.querySelectorAll('span'))
    expect(spans).toHaveLength(2)
    expect(spans[0].textContent).toBe('0: a')
    expect(spans[1].textContent).toBe('1: b')
  })

  test('appending a new outer group creates fresh inner elements with correct indices (no ReferenceError)', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; text: string }
      interface Group { id: number; items: Item[] }
      export function Repro() {
        const [outer, setOuter] = createSignal<Group[]>([
          { id: 1, items: [{ id: 11, text: 'a' }] },
        ])
        return (
          <div onClick={() => setOuter(prev => [...prev, { id: 2, items: [{ id: 21, text: 'x' }, { id: 22, text: 'y' }, { id: 23, text: 'z' }] }])}>
            {outer().map((o) => (
              <div key={o.id}>
                {o.items.map((item, i) => (
                  <span key={i}>{i}: {item.text}</span>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const el = await mount(source, 'NestedIndexAppendRepro.tsx', 'Repro')
    expect(el.querySelectorAll('span')).toHaveLength(1)

    el.dispatchEvent(new window.Event('click', { bubbles: true }))

    const spans = Array.from(el.querySelectorAll('span'))
    expect(spans).toHaveLength(4)
    expect(spans[1].textContent).toBe('0: x')
    expect(spans[2].textContent).toBe('1: y')
    expect(spans[3].textContent).toBe('2: z')
  })

  test('index referenced via a className attribute renders correctly for freshly-created items (no ReferenceError)', async () => {
    // `className` depends only on the index `i` (not a signal), so the
    // compiler bakes it into the per-item clone template rather than
    // wiring a `createEffect` (attributes only get reactive re-binding
    // when they read a signal) — existing elements keep the class they
    // were created with. That's an orthogonal, pre-existing characteristic
    // of attribute reactivity, not something #2218 changes; this test
    // exercises the index-in-attribute path specifically for NEWLY
    // created elements, where the bug's `ReferenceError` would have fired
    // during the clone-template IIFE.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; text: string }
      interface Group { id: number; items: Item[] }
      export function Repro() {
        const [outer, setOuter] = createSignal<Group[]>([
          { id: 1, items: [{ id: 11, text: 'a' }] },
        ])
        return (
          <div onClick={() => setOuter(prev => prev.map(g => ({ ...g, items: [...g.items, { id: 12, text: 'b' }, { id: 13, text: 'c' }] })))}>
            {outer().map((o) => (
              <div key={o.id}>
                {o.items.map((item, i) => (
                  <span key={item.id} className={i % 2 === 0 ? 'even' : 'odd'}>{item.text}</span>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const el = await mount(source, 'NestedIndexAttrRepro.tsx', 'Repro')
    const spansBefore = Array.from(el.querySelectorAll('span'))
    expect(spansBefore.map(s => s.className)).toEqual(['even'])

    el.dispatchEvent(new window.Event('click', { bubbles: true }))

    const spansAfter = Array.from(el.querySelectorAll('span'))
    expect(spansAfter.map(s => s.textContent)).toEqual(['a', 'b', 'c'])
    // The two freshly-created items compute their class from their own
    // (correct) index at creation time.
    expect(spansAfter.map(s => s.className)).toEqual(['even', 'odd', 'even'])
  })
})
