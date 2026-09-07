/**
 * Regression probe, NOT yet filed as a GitHub issue: found while discussing
 * whether `insert.ts`'s branch-arm reactive-attr handling and
 * `loop-child-arm.ts`'s `stringifyBranchReactiveAttrs` should share one
 * implementation (#2869 follow-up conversation). They turned out to answer
 * DIFFERENT questions — `ReactiveAttrEffect` (the type `stringifyBranchReactiveAttrs`
 * consumes) carries a `readsPreamble?: boolean` field that `ArmReactiveAttr`
 * (`insert.ts`'s equivalent, for top-level non-loop conditionals) structurally
 * cannot have, because there is no `.map()` preamble outside a loop.
 *
 * Tracing where `readsPreamble` is actually set (`reactivity.ts`'s
 * `collectBranchReactiveAttrs`, guarding the exact "#2447" scenario this test
 * reproduces: `const cls = row.done ? … ; class={cls}`) proved it CAN be true
 * for an attribute inside a loop-row's branch conditional. But
 * `stringifyLoopChildArm` / `stringifyBranchReactiveAttrs`
 * (`control-flow/stringify/loop-child-arm.ts`) never receive a
 * `mapPreambleWrapped` string to inject — unlike every other `readsPreamble`
 * consumer (`emitAttrSlotsGranular`, `emitConsolidatedRowEffect`, and the
 * condition itself in `emitOuterConditional`, which explicitly reruns the
 * preamble inside its `insert()` condition getter but never threads it down
 * into the arm bodies it hands to `stringifyLoopChildArm`).
 *
 * Net effect: a reactive attribute that lives INSIDE a loop row's branch
 * conditional and reads a `.map()` preamble local closes over whatever that
 * local was on the row's LAST FULL RENDER (creation, or same-key remount) and
 * never sees a same-key `setItem` update again — even though a genuinely
 * reactive sibling in the SAME branch (a plain `{row().field}` text
 * expression, which reads the live per-item accessor directly instead of
 * through a preamble local) updates correctly. The result is a silent
 * DOM/text divergence: the visible text says one thing, a class/attribute
 * derived from the same data says another.
 *
 * This test pins TODAY's (broken) behavior so it doesn't regress further and
 * so a real fix has a green target to flip. It is not skipped/failing — the
 * bug is real but low severity (stale class/attr, not a crash), so there is
 * no CI-blocking reason to mark it red before a fix is scoped. Once fixed,
 * flip `expect(target.className).toBe('tier-gold')` to `.toBe('tier-silver')`
 * and delete this docstring's "pins TODAY's behavior" framing.
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

describe('preamble local inside a loop-row branch conditional does not refresh on same-key update', () => {
  test('sibling text (live accessor) updates; class (preamble local) stays stale', async () => {
    const { hydrate } = await setupHydration()
    hydrate()

    const target = document.getElementById('target') as HTMLElement
    expect(target.className).toBe('tier-gold')
    expect(target.textContent).toBe('gold')

    document.getElementById('bump')!.dispatchEvent(new window.Event('click', { bubbles: true }))

    // Correct: the branch's own live accessor read (`{row().tier}`) is not a
    // preamble local, so it updates on the same-key `setItem` reconcile.
    expect(target.textContent).toBe('silver')

    // BUG (pinned, not yet fixed): `cls` was computed once, in the `.map()`
    // preamble, at row creation — nothing re-runs that computation on a
    // same-key update inside this branch-arm path, so the class silently
    // disagrees with the text it's describing. If this assertion ever
    // fails, the gap traced in this file's docstring has been fixed —
    // update this test to assert 'tier-silver' instead of deleting it.
    expect(target.className).toBe('tier-gold')
  })
})
