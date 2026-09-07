/**
 * Regression test found while discussing (post-#2869) whether `insert.ts`'s
 * branch-arm reactive-attr handling and `loop-child-arm.ts`'s
 * `stringifyBranchReactiveAttrs` should share one implementation. They
 * turned out to answer DIFFERENT questions — `ReactiveAttrEffect` (the type
 * `stringifyBranchReactiveAttrs` consumes) carries a `readsPreamble?: boolean`
 * field that `ArmReactiveAttr` (`insert.ts`'s equivalent, for top-level
 * non-loop conditionals) structurally cannot have, because there is no
 * `.map()` preamble outside a loop.
 *
 * `readsPreamble` is set by `reactivity.ts`'s `collectLoopChildReactiveAttrs`
 * (called for the branch-arm case from `collect-elements.ts` with
 * `stopAtReactiveConditionals: true` — NOT the separate, top-level-only
 * `collectBranchReactiveAttrs` that feeds `insert.ts`'s `ArmBody` instead)
 * for exactly the "#2447" scenario this test reproduces: `const cls =
 * row.done ? … ; class={cls}`. But `stringifyLoopChildArm` /
 * `stringifyBranchReactiveAttrs` (`control-flow/stringify/loop-child-arm.ts`)
 * used to never receive a `mapPreambleWrapped` string to inject — unlike
 * every other `readsPreamble` consumer (`emitAttrSlotsGranular`,
 * `emitConsolidatedRowEffect`, and the condition itself in
 * `emitOuterConditional`, which reruns the preamble inside its `insert()`
 * condition getter). `buildArmAttrsPlan`
 * (`control-flow/plan/build-loop-child-arm.ts`) also dropped the
 * `readsPreamble` flag on the way from `LoopChildReactiveAttr` to
 * `ReactiveAttrEffect` — two gaps, not one.
 *
 * Fixed by threading `mapPreambleWrapped` through `stringifyLoopChildArm` →
 * `stringifyBranchReactiveAttrs` (and `stringifyLoopChildConditional`'s own
 * condition getter, via the shared `conditionGetterExpr` helper — a nested
 * conditional's own condition had the identical gap, #2596 one level
 * deeper), and forwarding `readsPreamble` in `buildArmAttrsPlan` /
 * `buildLoopChildConditionalsPlan`.
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { renderHonoComponent } from '../../../adapter-hono/src/test-render'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'
import { writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const adapter = new TestAdapter()
const runtimePath = join(__dirname, '../../src/runtime/index.ts')

// `visible` is a signal (not a literal) so the ternary compiles to a real
// `insert()` branch instead of being resolved away at build time, but it is
// never toggled in this test — the branch never swaps, isolating the
// preamble-staleness question from branch-swap behavior (a swap would
// re-invoke `bindEvents`, a separate code path not under test here).
function reproSource(): string {
  return `'use client'
import { createSignal } from '@barefootjs/client'

type Row = { id: number; tier: string }

export function List() {
  const [visible] = createSignal(true)
  const [rows, setRows] = createSignal<Row[]>([{ id: 1, tier: 'gold' }])
  const bump = () => setRows(prev => prev.map(r => ({ ...r, tier: 'silver' })))
  return (
    <div>
      <button id="bump" onClick={bump}>bump</button>
      <ul>
        {rows().map(row => {
          const cls = 'tier-' + row.tier
          return (
            <li key={row.id}>
              {visible() ? <span class={cls} id="target">{row.tier}</span> : <span>x</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
`
}

function clientJsFor(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compile errors in ${filename}:\n${errors.map(e => `${e.code}: ${e.message}`).join('\n')}`)
  }
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error(`No client JS for ${filename}`)
  return clientJs.replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
}

async function setupHydration(): Promise<{ hydrate: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'bf-preamble-branch-'))
  const source = reproSource()
  writeFileSync(join(dir, 'List.mjs'), clientJsFor(source, 'List.tsx'))
  await import(join(dir, 'List.mjs'))

  const ssrHtml = await renderHonoComponent({
    adapter: new HonoAdapter(),
    source,
    props: { __instanceId: 'List_test' },
  })
  document.body.innerHTML = ssrHtml

  const { rehydrateAll, flushHydration } = await import(runtimePath)
  return {
    hydrate: () => {
      rehydrateAll()
      flushHydration()
    },
  }
}

describe('preamble local inside a loop-row branch conditional refreshes on same-key update', () => {
  test('sibling text and preamble-derived class both update', async () => {
    const { hydrate } = await setupHydration()
    hydrate()

    const target = document.getElementById('target') as HTMLElement
    expect(target.className).toBe('tier-gold')
    expect(target.textContent).toBe('gold')

    document.getElementById('bump')!.dispatchEvent(new window.Event('click', { bubbles: true }))

    // The branch's own live accessor read (`{row().tier}`) is not a
    // preamble local, so it updates on the same-key `setItem` reconcile.
    expect(target.textContent).toBe('silver')

    // Fixed: the arm's attr effect re-runs the preamble (`const cls =
    // 'tier-' + row().tier`) before reading `cls`, so the class no longer
    // disagrees with the text describing the same data.
    expect(target.className).toBe('tier-silver')
  })
})
