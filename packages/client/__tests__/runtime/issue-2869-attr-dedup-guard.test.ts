/**
 * Regression test for #2869: an eager reactive-attribute write —
 * `emitAttrUpdate`'s generic/`class`/`style`/`dangerouslySetInnerHTML`
 * branches, invoked from `emitReactiveAttributeUpdates` (a plain per-slot
 * effect) or from `emitConsolidatedRowEffect` (a keyed `.map()` row's ONE
 * fused effect covering every attr/text binding on that row) — used to
 * rewrite the DOM unconditionally on every effect rerun, no matter which
 * binding in that effect actually changed. `untrack()` cannot fix this on
 * its own: it only suppresses dependency REGISTRATION for the wrapped read,
 * not re-execution of the surrounding effect when a sibling binding
 * legitimately changes — so an `<iframe srcdoc={untrack(...)}>` sharing a
 * row's fused effect with an unrelated, genuinely reactive sibling binding
 * (e.g. `data-key={item.key}`) kept reloading on every edit to that row.
 *
 * The fix (`emitDedupedAttrUpdate`, `packages/jsx/src/ir-to-client-js/
 * emit-reactive.ts`) wraps every eager attribute write in an `Object.is`
 * previous-value guard backed by a per-effect `__l` store — the same
 * dedup contract the lazy row graph (`control-flow/stringify/lazy-row.ts`)
 * already had, now shared by every eager site too.
 *
 * Test shape mirrors `issue-2716-value-expando.test.ts`: compile real
 * repro components with `compileJSX` + `TestAdapter`, render their SSR
 * HTML with `renderHonoComponent` + `HonoAdapter`, hydrate against
 * `@happy-dom/global-registrator`, then dispatch DOM events / call signal
 * setters and assert on `setAttribute` call counts and a run counter
 * instrumenting the `untrack`-wrapped expression.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'bun:test'
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

async function setupHydration(source: string): Promise<{ hydrate: () => void; clientJs: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'bf-2869-'))
  const clientJs = clientJsFor(source, 'Repro.tsx')
  const file = join(dir, 'Repro.mjs')
  writeFileSync(file, clientJs)
  await import(file)

  const ssrHtml = await renderHonoComponent({
    adapter: new HonoAdapter(),
    source,
    props: { __instanceId: 'Repro_test' },
  })
  document.body.innerHTML = ssrHtml

  const { rehydrateAll, flushHydration } = await import(runtimePath)
  return {
    clientJs,
    hydrate: () => {
      rehydrateAll()
      flushHydration()
    },
  }
}

/** Count `setAttribute` calls per (element, name), installed AFTER hydrate
 *  so first-run writes are never counted. Restored in `afterEach`. */
function installAttrWriteCounter() {
  const proto = window.Element.prototype
  const orig = proto.setAttribute
  const counts = new Map<Element, Map<string, number>>()
  proto.setAttribute = function (this: Element, name: string, value: string) {
    let m = counts.get(this)
    if (!m) counts.set(this, (m = new Map()))
    m.set(name, (m.get(name) ?? 0) + 1)
    return orig.call(this, name, value)
  }
  return {
    writes: (el: Element, name: string) => counts.get(el)?.get(name) ?? 0,
    restore: () => {
      proto.setAttribute = orig
    },
  }
}

const docRuns = (): number => (globalThis as unknown as { __docRuns?: number }).__docRuns ?? 0

describe('#2869 — reactive attribute writes are deduped against their previous value', () => {
  let counter: ReturnType<typeof installAttrWriteCounter> | null = null

  beforeEach(() => {
    document.body.innerHTML = ''
    ;(globalThis as unknown as { __docRuns?: number }).__docRuns = 0
  })

  afterEach(() => {
    counter?.restore()
    counter = null
  })

  test('fused keyed-row effect: an unrelated sibling change reruns the row effect but does not rewrite an unchanged untracked attribute', async () => {
    const source = `'use client'
import { createSignal, untrack } from '@barefootjs/client'

function seedItems() {
  return [{ id: 1, label: 'a' }, { id: 2, label: 'b' }]
}

function docFor(id: number): string {
  globalThis.__docRuns = (globalThis.__docRuns || 0) + 1
  return 'doc-' + id
}

export function Repro() {
  const [items, setItems] = createSignal(seedItems())
  return (
    <div>
      <button id="bump" onClick={() => setItems(items().map(it => ({ id: it.id, label: it.label + '!' })))}>bump</button>
      <ul>
        {items().map(item => (
          <li key={item.id} title={item.label} data-doc={untrack(() => docFor(item.id))}>{item.label}</li>
        ))}
      </ul>
    </div>
  )
}
`
    const { hydrate, clientJs } = await setupHydration(source)
    // Pin the eager path (module docstring above / issue #2869): this must
    // exercise `emitConsolidatedRowEffect`, not the already-guarded lazy
    // row graph. If a future eligibility widening moves this repro onto
    // `mapArrayLazy`, fail loudly instead of passing for the wrong reason.
    expect(clientJs).toContain('mapArray(')
    expect(clientJs).not.toContain('mapArrayLazy(')

    hydrate()

    const [li1, li2] = Array.from(document.querySelectorAll('li'))
    expect(li1.getAttribute('title')).toBe('a')
    expect(li1.getAttribute('data-doc')).toBe('doc-1')
    expect(li2.getAttribute('data-doc')).toBe('doc-2')

    counter = installAttrWriteCounter()
    const base = docRuns()

    // Same keys, new item objects with a changed `label` — reconciles via
    // `setItem`/`setIndex` (batched), so each row's fused effect reruns
    // exactly once.
    document.getElementById('bump')!.dispatchEvent(new window.Event('click', { bubbles: true }))

    // The sibling binding (`title`, tracked) DID change and DID write —
    // proof the shared row effect actually reran.
    expect(li1.getAttribute('title')).toBe('a!')
    expect(counter.writes(li1, 'title')).toBe(1)

    // The untracked read reruns every time its surrounding effect reruns —
    // untrack only suppresses dependency registration, not re-execution.
    expect(docRuns()).toBe(base + 2)

    // But its VALUE never changed, so the guard skips the write — this is
    // the regression assertion; before the fix this was 1 (a `srcdoc`
    // iframe would have reloaded here despite `untrack`).
    expect(counter.writes(li1, 'data-doc')).toBe(0)
    expect(counter.writes(li2, 'data-doc')).toBe(0)
    expect(li1.getAttribute('data-doc')).toBe('doc-1')
    expect(li2.getAttribute('data-doc')).toBe('doc-2')

    // A second edit reconfirms the guard keeps holding, not just once.
    document.getElementById('bump')!.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(li1.getAttribute('title')).toBe('a!!')
    expect(counter.writes(li1, 'title')).toBe(2)
    expect(docRuns()).toBe(base + 4)
    expect(counter.writes(li1, 'data-doc')).toBe(0)
  })

  test('non-loop reactive attrs: an unrelated sibling change reruns the effect but a changed untracked value still writes', async () => {
    const source = `'use client'
import { createSignal, untrack } from '@barefootjs/client'

function docFor(n: number): string {
  globalThis.__docRuns = (globalThis.__docRuns || 0) + 1
  return 'doc-' + n
}

export function Repro() {
  const [count, setCount] = createSignal(0)
  const [step, setStep] = createSignal(1)
  return (
    <div>
      <button id="count-btn" onClick={() => setCount(c => c + 1)}>count</button>
      <button id="step-btn" onClick={() => setStep(s => s + 1)}>step</button>
      <p id="target" title={String(count())} data-doc={untrack(() => docFor(step()))}>x</p>
    </div>
  )
}
`
    const { hydrate } = await setupHydration(source)
    hydrate()

    const p = document.getElementById('target')!
    expect(p.getAttribute('data-doc')).toBe('doc-1')

    counter = installAttrWriteCounter()
    const base = docRuns()

    // Clicking `step` alone: `step()` is read only inside `untrack` in this
    // component, so it never registered as a dependency — the effect does
    // not rerun at all.
    document.getElementById('step-btn')!.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(counter.writes(p, 'title')).toBe(0)
    expect(counter.writes(p, 'data-doc')).toBe(0)
    expect(docRuns()).toBe(base)
    expect(p.getAttribute('data-doc')).toBe('doc-1')

    // Clicking `count`: the effect reruns (title's own dependency), so the
    // untracked expression reruns too — and its value NOW differs (step is
    // 2), so it DOES write. Positive control: a genuinely changed value is
    // never suppressed by the guard.
    document.getElementById('count-btn')!.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(p.getAttribute('title')).toBe('1')
    expect(counter.writes(p, 'title')).toBe(1)
    expect(docRuns()).toBe(base + 1)
    expect(counter.writes(p, 'data-doc')).toBe(1)
    expect(p.getAttribute('data-doc')).toBe('doc-2')

    // Clicking `count` again: the effect reruns again, `step()` is still 2
    // so the untracked expression recomputes to the SAME 'doc-2' — the
    // regression assertion: no second write.
    document.getElementById('count-btn')!.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(p.getAttribute('title')).toBe('2')
    expect(counter.writes(p, 'title')).toBe(2)
    expect(docRuns()).toBe(base + 2)
    expect(counter.writes(p, 'data-doc')).toBe(1)
  })
})
