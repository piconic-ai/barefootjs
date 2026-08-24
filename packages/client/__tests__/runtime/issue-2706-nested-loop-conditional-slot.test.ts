/**
 * Regression test for https://github.com/piconic-ai/barefootjs/issues/2706
 * (fixed).
 *
 * `rows().map(row => <div>{row.items.map(item => <p>{cond ? <span/> : null}</p>)}</div>)`
 * — a per-item conditional living inside an INNER (nested) `.map()` row.
 *
 * Root cause: `buildInnerLoopsPlan` / `InnerLoopReactiveEmit` (control-flow/
 * plan/build-inner-loop.ts) had no `conditionals` field at all — unlike the
 * top-level loop's `ReactiveEffectsPlan.conditionals` (control-flow/plan/
 * build-reactive-effects.ts), which DOES route a loop-row conditional
 * through `insert()`. So a per-item conditional inside a NESTED loop's row
 * was baked directly into the row's static HTML template — the condition
 * evaluated exactly ONCE, at row creation, and never revisited even when it
 * read a signal (a genuine SILENT DIVERGENCE, confirmed by experiment: an
 * independent `createSignal` read by the condition kept flipping while the
 * DOM stayed frozen — deeper than the originally-reported console warning).
 * The reactive text nested in the branch still got the
 * "insert()-will-keep-the-marker-around" re-claim treatment regardless, so
 * when the row was first created with the false branch active, the marker
 * never existed and the effect's first run warned `slot sN marker not
 * found; skipping` / `no claimed slot for id sN; write ignored`.
 *
 * Fix: `collectInnerLoops` (ir-to-client-js/collect-elements.ts) now
 * collects `bindings.conditionals` for EVERY inner loop (branch or not,
 * previously gated behind branch-only `collectItemBindings`), and passes
 * `stopAtReactiveConditionals: true` to `collectLoopChildReactiveTexts` /
 * `collectLoopChildReactiveAttrs` so a reactive conditional's own content is
 * no longer ALSO flattened into the old bake-and-reclaim path. `buildReactiveEmit`
 * (build-inner-loop.ts) feeds those conditionals through the same
 * `buildLoopChildConditionalsPlan` the branch-arm path already used, and
 * `stringifyInnerLoops`'s `emitReactive` (stringify/inner-loop.ts) now emits
 * a real `insert()` over the row's own element — full parity with the
 * top-level loop's row-conditional handling.
 *
 * Confirmed adapter-independent: `generateClientJs` output is byte-identical
 * whether compiled via TestAdapter, HonoAdapter, or GoTemplateAdapter — the
 * defect (and the fix) is in `packages/jsx`'s codegen, not any one adapter.
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
  const dir = mkdtempSync(join(tmpdir(), 'bf-2706-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  await import(file)
  const { createComponent } = await import(runtimePath)
  const el = createComponent(name, {}) as HTMLElement
  document.body.appendChild(el)
  return el
}

const SOURCE = `
  "use client";
  import { createSignal } from '@barefootjs/client'
  type Item = { id: string; minimum: number }
  type Row = { id: string; items: Item[] }
  export function BarefootSlotRepro() {
    const [rows, setRows] = createSignal<Row[]>([])
    return (
      <div>
        <button onClick={() => setRows([{ id: 'row', items: [{ id: 'item', minimum: 1 }] }])}>Add</button>
        {rows().map((row) => (
          <div key={row.id}>
            {row.items.map((item) => (
              <p key={item.id}>
                Item
                {item.minimum > 1 ? <span>Minimum: {item.minimum}</span> : null}
              </p>
            ))}
          </div>
        ))}
      </div>
    )
  }
`

describe('#2706 — nested-loop row conditional gets real insert() parity', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('adding a row whose item does not satisfy the conditional does not warn', async () => {
    const el = await mount(SOURCE, 'BarefootSlotRepro.tsx', 'BarefootSlotRepro')

    const warnings: string[] = []
    const origWarn = console.warn
    console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')) }
    try {
      const button = el.querySelector('button')!
      button.dispatchEvent(new window.Event('click', { bubbles: true }))
    } finally {
      console.warn = origWarn
    }

    expect(warnings).toEqual([])
  })

  test('the rendered DOM is structurally correct', async () => {
    const el = await mount(SOURCE, 'BarefootSlotRepro.tsx', 'BarefootSlotRepro')
    const button = el.querySelector('button')!
    button.dispatchEvent(new window.Event('click', { bubbles: true }))

    const p = el.querySelector('p')!
    expect(p.textContent?.trim()).toBe('Item')
    expect(p.querySelector('span')).toBeNull()
  })

  // The deeper half of the bug (found via experiment while diagnosing the
  // fix direction, not in the original report): before the fix, a nested
  // loop's row conditional was baked ONCE at row creation and never
  // revisited — even when the condition read an INDEPENDENT signal totally
  // unrelated to the row's own data. This asserts the DOM now genuinely
  // follows the signal, not just that the console stays quiet.
  test('a nested-loop row conditional on an independent signal updates the DOM when that signal changes', async () => {
    const source = `
      "use client";
      import { createSignal } from '@barefootjs/client'
      type Item = { id: string; label: string }
      type Row = { id: string; items: Item[] }
      export function ExtraToggleRepro() {
        const [rows] = createSignal<Row[]>([{ id: 'row', items: [{ id: 'item', label: 'X' }] }])
        const [show, setShow] = createSignal(false)
        return (
          <div>
            <button onClick={() => setShow((v) => !v)}>Toggle</button>
            {rows().map((row) => (
              <div key={row.id}>
                {row.items.map((item) => (
                  <p key={item.id}>
                    Item {item.label}
                    {show() ? <span>Extra</span> : null}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const el = await mount(source, 'ExtraToggleRepro.tsx', 'ExtraToggleRepro')
    expect(el.querySelector('span')).toBeNull()

    el.querySelector('button')!.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(el.querySelector('span')?.textContent).toBe('Extra')

    el.querySelector('button')!.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(el.querySelector('span')).toBeNull()
  })
})
