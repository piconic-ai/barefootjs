/**
 * End-to-end runtime test for #2219: an inner reactive `.map()` callback
 * whose item root is an SVG element (`<line>`, `<circle>`, ...) cloned via
 * `template.innerHTML` in the HTML namespace — the element existed in the
 * DOM but rendered nothing, silently, because `template.innerHTML` always
 * parses in the HTML namespace and a bare `<line>` root clones as an
 * `HTMLUnknownElement` instead of an `SVGLineElement`.
 *
 * Confirmed with a standalone happy-dom sanity check before writing this
 * test: `template.innerHTML = '<line/>'` clones with
 * `namespaceURI === 'http://www.w3.org/1999/xhtml'` (HTMLUnknownElement),
 * while `template.innerHTML = '<svg><line/></svg>'` followed by
 * `.firstElementChild.firstElementChild` clones with
 * `namespaceURI === 'http://www.w3.org/2000/svg'` (SVGLineElement) — so
 * happy-dom faithfully reproduces the parsing bug this fix addresses.
 *
 * Mounts the real compiled output in a DOM (not just template-eval — see
 * `packages/adapter-tests/src/__tests__/csr-conformance.test.ts`, which only
 * evaluates the `template()` lambda and can't reach this bug) with an empty
 * initial signal and appends after mount, forcing `mapArray` to CREATE the
 * inner `<line>` elements via the renderItem clone IIFE (the code path fixed
 * in `stringify/inner-loop.ts`) rather than hydrating pre-existing SSR
 * markup.
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
  const dir = mkdtempSync(join(tmpdir(), 'bf-2219-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  await import(file)
  const { createComponent } = await import(runtimePath)
  const el = createComponent(name, {}) as HTMLElement
  document.body.appendChild(el)
  return el
}

const SVG_NS = 'http://www.w3.org/2000/svg'

describe('#2219 — inner reactive loop with an SVG element root', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('freshly-created <line> items added to an already-mounted <svg> parse in the SVG namespace', async () => {
    // The outer sheet (and its <svg> root) exists from the initial signal
    // value with an EMPTY ticks array, so the outer item's own baked
    // template embeds zero inner <line> elements — the initial mount does
    // not exercise the inner-loop clone path (an outer item created fresh
    // bakes its *initial* inner items into its own already-svg-wrapped
    // template string, which bypasses `stringify/inner-loop.ts` entirely;
    // see the sibling test below for that scenario). Adding ticks to the
    // EXISTING sheet afterwards forces the inner reactive `mapArray` to
    // find no `__existing` match and CREATE each <line> via the
    // `stringify/inner-loop.ts` renderItem clone IIFE — the code path #2219
    // actually fixed.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Sheet { id: number; ticks: number[] }
      export function Repro() {
        const [sheets, setSheets] = createSignal<Sheet[]>([{ id: 1, ticks: [] }])
        return (
          <div onClick={() => setSheets(prev => prev.map(s => ({ ...s, ticks: [10, 20, 30] })))}>
            {sheets().map((s) => (
              <svg key={s.id} viewBox="0 0 100 100">
                {s.ticks.map((y) => (
                  <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="black" />
                ))}
              </svg>
            ))}
          </div>
        )
      }
    `
    const el = await mount(source, 'SvgInnerLoopRepro.tsx', 'Repro')
    // The outer <svg> exists already, but with zero <line> children.
    expect(el.querySelectorAll('svg')).toHaveLength(1)
    expect(el.querySelectorAll('line')).toHaveLength(0)

    el.dispatchEvent(new window.Event('click', { bubbles: true }))

    const lines = Array.from(el.querySelectorAll('line'))
    expect(lines).toHaveLength(3)
    for (const line of lines) {
      expect(line.namespaceURI).toBe(SVG_NS)
      expect(line.constructor.name).toBe('SVGLineElement')
    }
  })

  test('appending more ticks to an existing sheet creates further SVG-namespaced <line> items', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Sheet { id: number; ticks: number[] }
      export function Repro() {
        const [sheets, setSheets] = createSignal<Sheet[]>([{ id: 1, ticks: [10] }])
        return (
          <div onClick={() => setSheets(prev => prev.map(s => ({ ...s, ticks: [...s.ticks, 20, 30] })))}>
            {sheets().map((s) => (
              <svg key={s.id} viewBox="0 0 100 100">
                {s.ticks.map((y) => (
                  <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="black" />
                ))}
              </svg>
            ))}
          </div>
        )
      }
    `
    const el = await mount(source, 'SvgInnerLoopAppendRepro.tsx', 'Repro')
    expect(el.querySelectorAll('line')).toHaveLength(1)

    el.dispatchEvent(new window.Event('click', { bubbles: true }))

    const lines = Array.from(el.querySelectorAll('line'))
    expect(lines).toHaveLength(3)
    for (const line of lines) {
      expect(line.namespaceURI).toBe(SVG_NS)
    }
  })
})
