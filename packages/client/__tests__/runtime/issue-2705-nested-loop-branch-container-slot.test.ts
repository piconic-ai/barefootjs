/**
 * Regression test for https://github.com/piconic-ai/barefootjs/issues/2705
 * (fixed).
 *
 * `groups().map(group => <div><article>{group.show && group.items.map(item =>
 * <section key={item.id}>{item.label}</section>)}</article></div>)` — a
 * KEYED inner `.map()` living inside a `&&`-conditional that is itself
 * inside a wrapper element (`<article>`) inside an OUTER loop's row.
 *
 * Root cause: `collectInnerLoops` (ir-to-client-js/collect-elements.ts),
 * called with `branchInnerLoopOptions` from `summarizeLoopChildBranch` to
 * gather the inner loops living inside a loop-row conditional's branch,
 * seeds its slot-tracking walk with `parentSlotId: null` and only updates it
 * by walking INTO elements inside the branch's own subtree (`element:
 * descend({ ...scope, parentSlotId: el.slotId ?? scope.parentSlotId })`).
 * Here the branch's rendered content IS the loop itself (no wrapping
 * element inside the branch — `<article>` sits OUTSIDE the conditional, one
 * level up), so the walk never observes an element with a slot id and
 * `containerSlotId: scope.parentSlotId` (collect-elements.ts ~line 400)
 * resolves to `null`.
 *
 * Downstream, `buildBranchInnerLoopsPlan` (control-flow/plan/build-loop-
 * child-arm.ts) falls back to `containerExpr = scopeVar` (i.e. `__branchScope`
 * verbatim) whenever `containerSlotId` is falsy — so the nested `mapArray`'s
 * `container` argument is the WHOLE conditional's bind scope (the outer
 * loop's row root, here the `<div>` wrapping `<article>`), not `<article>`
 * itself. `mapArray`'s own marker lookup (`findLoopMarkers`, runtime/
 * map-array.ts) only scans `container`'s DIRECT children for the
 * `<!--bf-loop:l0-->` markers — which actually live one level deeper, inside
 * `<article>` — so it never finds them, falls back to treating
 * `container.children` (i.e. `<article>` itself, the row's one direct
 * child) as the loop's "existing" item list, and:
 *   - adopts `<article>` as if it were item[0] — stamping the WRONG
 *     `data-key`/`data-key-1` (the first item's key) onto `<article>`;
 *   - appends any items beyond the first as fresh `<section>` siblings of
 *     `<article>`, directly under the outer row `<div>` — landing OUTSIDE
 *     `<article>` entirely.
 *
 * Reproduced on the very FIRST hydration pass — no click/update required.
 *
 * Fix: `buildBranchInnerLoopsPlan` (build-loop-child-arm.ts) now falls back
 * to `findCondContainer(scopeVar, condSlotId)` (runtime/insert.ts, new)
 * instead of the raw `scopeVar` when `containerSlotId` is null.
 * `findCondContainer` walks the branch scope's comments for the enclosing
 * conditional's own `<!--bf-cond-start:id-->` marker and returns ITS
 * parent element — the marker is always a direct child of the real
 * wrapper (`<article>`), since `insert()` keeps it as one of the range's
 * boundaries regardless of whether the branch content was SSR-adopted or
 * freshly spliced. `condSlotId` (the conditional's own slot id) is now
 * threaded down through `buildOuterArm` / `buildLoopChildArmPlan` so it's
 * always available at the fallback site.
 *
 * A different mechanism from #2706 (that one is a compiler codegen gap for
 * per-item conditionals inside a nested loop's OWN row; this one is a
 * slot-id propagation gap for a loop nested inside a loop-row conditional's
 * branch) — no shared root-cause line, though both are the same THEME: a
 * nested `.map()` whose slot/container resolution assumes a shape a
 * surrounding conditional silently breaks.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
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

const SOURCE = `"use client";
import { createSignal } from '@barefootjs/client'
type Item = { id: string; label: string }
type Group = { id: string; show: boolean; items: Item[] }
export function BarefootNestedLoopDuplicateRepro() {
  const [groups, setGroups] = createSignal<Group[]>([
    { id: 'group', show: true, items: [
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ]},
  ])
  return (
    <div>
      <button onClick={() => setGroups([...groups()])}>Replace</button>
      {groups().map((group) => (
        <div key={group.id}>
          <article>
            Group
            {group.show &&
              group.items.map((item) => (
                <section key={item.id}>{item.label}</section>
              ))}
          </article>
        </div>
      ))}
    </div>
  )
}
`

function clientJsFor(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compile errors in ${filename}:\n${errors.map(e => `${e.code}: ${e.message}`).join('\n')}`)
  }
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error(`No client JS for ${filename}`)
  return clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')
}

describe('#2705 — keyed nested loop behind a wrapped loop-row conditional', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  // Graduated (#2705 fixed): `buildBranchInnerLoopsPlan` now falls back to
  // `findCondContainer(scopeVar, condSlotId)` (runtime/insert.ts) instead of
  // the whole conditional's bind scope when the inner loop's own IR never
  // got a `containerSlotId` — see build-loop-child-arm.ts.
  test('SSR hydration does not misplace the last item outside <article> or mis-key it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-2705-'))
    const file = join(dir, 'Repro.mjs')
    writeFileSync(file, clientJsFor(SOURCE, 'BarefootNestedLoopDuplicateRepro.tsx'))
    await import(file)

    const ssrHtml = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: SOURCE,
      props: { __instanceId: 'BarefootNestedLoopDuplicateRepro_test' },
    })
    document.body.innerHTML = ssrHtml

    const { rehydrateAll, flushHydration } = await import(runtimePath)
    rehydrateAll()
    flushHydration()

    const article = document.querySelector('article')!
    expect(article.getAttribute('data-key')).toBeNull()
    expect(article.querySelectorAll('section').length).toBe(2)
    expect(document.querySelectorAll('section').length).toBe(2)
  })

  // Not pinned: the SSR markup itself (pre-hydration) is correct — the
  // divergence is purely a hydration-time DOM mutation, so this passes
  // today and stays a normal regression pin for the SSR half.
  test('the pre-hydration SSR markup nests both sections correctly inside <article>', async () => {
    const ssrHtml = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: SOURCE,
      props: { __instanceId: 'BarefootNestedLoopDuplicateRepro_test' },
    })
    document.body.innerHTML = ssrHtml
    const article = document.querySelector('article')!
    expect(article.getAttribute('data-key')).toBeNull()
    expect(article.querySelectorAll('section').length).toBe(2)
    expect(document.querySelectorAll('section').length).toBe(2)
  })
})
