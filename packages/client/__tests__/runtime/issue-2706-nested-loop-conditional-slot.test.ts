/**
 * Repro for https://github.com/piconic-ai/barefootjs/issues/2706
 *
 * `rows().map(row => <div>{row.items.map(item => <p>{cond ? <span/> : null}</p>)}</div>)`
 * — a per-item conditional living inside an INNER (nested) `.map()` row.
 *
 * `stringifyInnerLoops`'s `emitReactive` (ir-to-client-js/control-flow/
 * stringify/inner-loop.ts) unconditionally emits a re-claiming
 * `createEffect(() => { claimSlots(...).write(...) })` for any reactive text
 * flagged `insideConditional` (`InnerLoopText.insideConditional`,
 * ir-to-client-js/control-flow/plan/inner-loop.ts) — a pattern whose
 * correctness assumes `insert()` mounts/unmounts the branch so the marker is
 * always (re)present whenever the effect runs. But `buildInnerLoopsPlan` /
 * `InnerLoopReactiveEmit` (control-flow/plan/build-inner-loop.ts) has no
 * `conditionals` field at all — unlike the top-level loop's
 * `ReactiveEffectsPlan.conditionals` (control-flow/plan/build-reactive-
 * effects.ts), which DOES route a loop-row conditional through `insert()`.
 * So a per-item conditional inside a NESTED loop's row is baked directly
 * into the row's static HTML template (condition evaluated once, at row
 * creation, never revisited) with no `insert()` at all — yet the reactive
 * text nested in its true branch still gets the "insert()-will-keep-the-
 * marker-around" treatment. When the row is first created with the false
 * branch active, the marker never existed, and the effect's first run warns
 * `slot sN marker not found; skipping` / `no claimed slot for id sN; write
 * ignored` — even though nothing is actually broken visually (the DOM is
 * byte-correct; only the console is polluted and the pattern is fragile).
 *
 * Confirmed adapter-independent: `generateClientJs` output is byte-identical
 * whether compiled via TestAdapter, HonoAdapter, or GoTemplateAdapter — the
 * defect is in `packages/jsx`'s codegen, not any one adapter.
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

describe('#2706 — nested-loop conditional slot claimed against a marker that was never rendered', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  // Pinned failing (Bun's `test.failing`): passes today because the bug
  // exists (no console warnings expected, but warnings fire); will start
  // FAILING — the intended graduation signal — once the compiler routes
  // this shape through `insert()` (or otherwise stops claiming a slot the
  // active branch never rendered). At that point flip this back to `test`.
  test.failing('adding a row whose item does not satisfy the conditional does not warn', async () => {
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

  // Not pinned: the DOM shape itself is correct even though the console
  // warns — this is the "silent" half of the divergence (only the console
  // is wrong), so it stays a normal, currently-passing assertion.
  test('the rendered DOM is structurally correct despite the console warnings', async () => {
    const el = await mount(SOURCE, 'BarefootSlotRepro.tsx', 'BarefootSlotRepro')
    const button = el.querySelector('button')!
    button.dispatchEvent(new window.Event('click', { bubbles: true }))

    const p = el.querySelector('p')!
    expect(p.textContent?.trim()).toBe('Item')
    expect(p.querySelector('span')).toBeNull()
  })
})
