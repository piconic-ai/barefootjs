/**
 * Regression test for #2716: `emitAttrUpdate` (and `emitReactivePropBindings`'s
 * own inline `value` branch, `packages/jsx/src/ir-to-client-js/emit-reactive.ts`)
 * used to write the DOM `.value` IDL property unconditionally whenever a
 * reactive prop or attribute was named `value` — including onto a child
 * component's root element when that root is a plain, non-form-control tag
 * (e.g. `<div>`). SSR never renders a `.value` property (there is no such
 * thing in markup), so hydration silently planted a live expando the
 * server-rendered DOM never had — a hydrated/SSR DOM-state divergence, and a
 * hazard for any code that duck-types form controls via `'value' in el`.
 *
 * This mirrors the shape of the `props-reactivity-comparison` / `reactive-props`
 * / `tabs` adapter-tests fixtures that first surfaced the bug via the oracle
 * harness (#2481): a child component whose root is a `<div>` receives a
 * plain numeric `value` prop from its parent.
 *
 * The fix gates the IDL-property write on `'value' in target` at runtime
 * (the same duck-type `applyRestAttrs.ts` already used for its own
 * rest-spread `value` handling), so an element that already exposes
 * `.value` (e.g. `<input>`) still gets the live controlled-value write real
 * user interaction requires. Two DIFFERENT fallbacks for everything else,
 * matching what SSR rendered in each case: a developer-authored `value=`
 * attribute falls back to `setAttribute` (SSR renders that attribute), but
 * the CHILD-ROOT named-prop mirror exercised below writes NOTHING — no
 * property and no attribute — because SSR renders no mirror at all.
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

const DIV_CHILD = `'use client'
export function ValueChild(props: { value: number }) {
  return <div class="child">{props.value}</div>
}`

const INPUT_CHILD = `'use client'
export function ValueChild(props: { value: string }) {
  return <input class="child" value={props.value} />
}`

function reproSource(): string {
  return `'use client'
import { createSignal } from '@barefootjs/client'
import { ValueChild } from './ValueChild'
export function Repro() {
  const [count, setCount] = createSignal(0)
  return (
    <div>
      <button onClick={() => setCount(c => c + 1)}>+</button>
      <ValueChild value={count()} />
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

async function setupHydration(childSource: string): Promise<{ hydrate: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'bf-2716-'))
  const modules: Array<[string, string, string]> = [
    [childSource, 'ValueChild.tsx', 'ValueChild'],
    [reproSource(), 'Repro.tsx', 'Repro'],
  ]
  for (const [source, filename, name] of modules) {
    const file = join(dir, `${name}.mjs`)
    writeFileSync(file, clientJsFor(source, filename))
    await import(file)
  }

  const ssrHtml = await renderHonoComponent({
    adapter: new HonoAdapter(),
    source: reproSource(),
    components: { './ValueChild.tsx': childSource },
    props: { __instanceId: 'Repro_test' },
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

describe('#2716 — reactive `value` prop does not plant a `.value` expando on a non-form root', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('a <div>-rooted child never gains a `.value` IDL property, before or after hydration', async () => {
    const { hydrate } = await setupHydration(DIV_CHILD)

    const childBefore = document.querySelector('.child') as HTMLElement
    expect(childBefore).toBeTruthy()
    expect('value' in childBefore).toBe(false)

    hydrate()

    const childAfter = document.querySelector('.child') as HTMLElement
    // Same element identity check isn't required — the point is the LIVE
    // element post-hydration, whichever it is, must not have gained the
    // property SSR never rendered.
    expect('value' in childAfter).toBe(false)
    expect((childAfter as unknown as Record<string, unknown>).value).toBeUndefined()

    // The child-root mirror writes NOTHING on an element with no native
    // `.value`: no property AND no attribute (an attribute fallback here
    // would be a fresh SSR/hydrate divergence of its own, since SSR renders
    // no mirror at all). The signal-driven update still reaches the child
    // through its own text binding.
    expect(childAfter.hasAttribute('value')).toBe(false)
    document.querySelector('button')!.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(childAfter.textContent).toBe('1')
    expect('value' in childAfter).toBe(false)
    expect(childAfter.hasAttribute('value')).toBe(false)
  })

  test('a genuine form control (<input>) still gets the live controlled-value property', async () => {
    const { hydrate } = await setupHydration(INPUT_CHILD)
    hydrate()

    const input = document.querySelector('.child') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('0')

    document.querySelector('button')!.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(input.value).toBe('1')
  })
})
