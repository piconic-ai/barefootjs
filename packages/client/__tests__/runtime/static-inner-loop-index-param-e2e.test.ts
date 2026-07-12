/**
 * End-to-end runtime test for #2231: a FULLY-STATIC (module-const array,
 * not a signal or a prop) nested loop's inner `.map((sub, i) => ...)` index
 * param, referenced in a CHILD COMPONENT's prop, used to throw
 * `ReferenceError: i is not defined` at hydration time.
 *
 * Follow-up to #2218 (fixed the reactive `mapArray` / branch-arm paths via
 * `loopKeyFn` + the renderItem alias) — this covers the *static-array*
 * child-init family (`plan/build-static-array-child-init.ts` /
 * `stringify/static-array-child-init.ts`), which #2218 never reached because
 * fully-static loops don't go through `mapArray` at all: the outer/inner
 * `forEach` bodies here only call `initChild(name, el, props)` to wire up
 * already-rendered child-component scopes.
 *
 * Root cause: the `inner-loop-nested` shape hardcoded the synthetic
 * `__innerIdx` as the inner `forEach`'s second param, so a user-declared
 * index name like `i` was never bound — `initChild`'s `get label() { return
 * String(i) }` prop getter threw `ReferenceError: i is not defined` the
 * first time the runtime's `createEffect` read it.
 *
 * Harness notes (see `initChild`'s selector — `buildCompSelector` in
 * `packages/jsx/src/ir-to-client-js/control-flow/shared.ts`): the
 * `[bf-h="…"][bf-m="…"]` / `[bf-s$="_s…"]` selectors this code path
 * searches for are only produced by REAL server-rendered markup — the
 * `renderChild(...)` helper used by the CSR *materialize* template (as
 * exercised by `static-loop-csr-materialize.test.ts` / the plain
 * `createComponent(name, {})` pattern in `nested-loop-index-param-e2e.test.ts`)
 * stamps a random per-call scope id when called without a `slotSuffix`
 * (`component.ts` `renderChild`), which this family's compiled forEach
 * calls never pass. A `createComponent`-only mount was tried first and
 * does NOT reach `initChild` for this shape (`qsaChildScope` finds no
 * match, so the getter is never invoked, and the pre-fix build passes
 * silently — a false negative). So, like `issue-1725-hydration.test.ts`
 * (the sibling #1725 fix for this same family), this test renders REAL
 * SSR HTML via the Hono adapter — which stamps parent-anchored `bf-s`
 * values matching the selector — then runs the real `hydrate` walk so
 * `initChild`'s prop-getter closures actually execute.
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

const CELL = `'use client'
export function Cell(props: { label: string }) {
  return <span>{props.label}</span>
}`

function reproSource(): string {
  // The inner `.map()` sits inside a `<div class="subs">` wrapper rather
  // than directly in the group item root. This isn't cosmetic: with the
  // inner loop hanging directly off the group root, that root's own
  // reactive-attribute slot id happens to collide with `Cell`'s
  // independently-numbered template-root slot id, so
  // `__outerEl.querySelector('[bf="s1"]')` — the inner-container lookup —
  // matches the group root's own child span instead of an inner-loop
  // container, `__ic.children[i]` comes back empty, and `initChild` is
  // never reached at all (a false negative, not a #2231 pin). The wrapper
  // gives the inner loop its own container slot id, distinct from any
  // child component's internal slot numbering, so `initChild('Cell', …)`
  // — and the broken `get label() { return String(i) }` getter — actually
  // runs.
  return `'use client'
import { Cell } from './Cell'
const OUTER = [
  { id: 1, subs: [{ id: 11 }, { id: 12 }] },
  { id: 2, subs: [{ id: 21 }] },
]
export function Repro() {
  return (
    <div>
      {OUTER.map((o) => (
        <div key={o.id} data-group={o.id}>
          <div class="subs">
            {o.subs.map((sub, i) => (
              <Cell key={sub.id} label={String(i)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}`
}

/** Compile a component's client JS with imports re-anchored to the live runtime. */
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

async function setupHydration(): Promise<{ hydrate: () => void }> {
  // Register Cell + Repro defs (template + init) with the runtime. Each
  // module is imported separately so their (overlapping) runtime import
  // lines don't collide in one module scope.
  const dir = mkdtempSync(join(tmpdir(), 'bf-2231-'))
  const modules: Array<[string, string, string]> = [
    [CELL, 'Cell.tsx', 'Cell'],
    [reproSource(), 'Repro.tsx', 'Repro'],
  ]
  for (const [source, filename, name] of modules) {
    const file = join(dir, `${name}.mjs`)
    writeFileSync(file, clientJsFor(source, filename))
    await import(file)
  }

  // Real SSR HTML (Hono adapter) — same markup a server would send, with
  // deterministic parent-anchored `bf-s` values on the `Cell` scopes that
  // `initChild`'s selector can actually find.
  const ssrHtml = await renderHonoComponent({
    adapter: new HonoAdapter(),
    source: reproSource(),
    components: { './Cell.tsx': CELL },
    // Root scope must carry a `Name_` prefix so the hydration walk resolves
    // it to the registered `Repro` def (`scopeName` splits on the first `_`).
    props: { __instanceId: 'Repro_test' },
  })
  document.body.innerHTML = ssrHtml

  // The `hydrate()` calls during module import already scheduled (and,
  // after the awaits, drained) a walk against the then-empty body.
  // Re-trigger a walk now that the SSR markup is in place, then drain it
  // synchronously — this is where `initChild('Cell', …)` runs for real and,
  // pre-fix, is where `ReferenceError: i is not defined` throws.
  const { rehydrateAll, flushHydration } = await import(runtimePath)
  return {
    hydrate: () => {
      rehydrateAll()
      flushHydration()
    },
  }
}

describe('#2231 — static nested-loop index param referenced in a child-component prop', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('hydration does not throw, and the inner index renders per-group Cell labels', async () => {
    const { hydrate } = await setupHydration()

    // Pre-fix, this call threw synchronously: `initChild`'s
    // `get label() { return String(i) }` closure read an unbound `i` the
    // first time `createEffect` evaluated it. This is the pin — it fails
    // with `ReferenceError: i is not defined` without the compiler fix.
    expect(() => hydrate()).not.toThrow()

    const group1 = document.querySelector('[data-group="1"]')
    const group2 = document.querySelector('[data-group="2"]')
    expect(group1).not.toBeNull()
    expect(group2).not.toBeNull()

    const group1Labels = Array.from(group1!.querySelectorAll('span')).map(s => s.textContent)
    const group2Labels = Array.from(group2!.querySelectorAll('span')).map(s => s.textContent)

    // Group 1 has two subs -> inner index resets to 0 for each outer item.
    expect(group1Labels).toEqual(['0', '1'])
    // Group 2 has one sub -> index also starts fresh at 0 (not a running
    // total across groups), proving the bound `i` is the real forEach index
    // and not some other unrelated in-scope value.
    expect(group2Labels).toEqual(['0'])
  })
})
