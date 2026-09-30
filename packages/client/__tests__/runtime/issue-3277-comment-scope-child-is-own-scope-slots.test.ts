/**
 * Regression test for #3277: a client component whose render root is a
 * single CHILD COMPONENT call (comment-scoped root, `component-root-scope-
 * comment.ts`) never updated a reactive keyed-array prop passed to that
 * child — the first row was never created on an empty -> non-empty
 * transition, even though hydration itself succeeded and a fresh render of
 * the final state produced the row correctly.
 *
 * Root cause: `ReproChild` (the sole root) is itself a real, addressable
 * `[bf-s]` component — so the proxy element `hydrateCommentScope` registers
 * in `commentScopeRegistry` for `ReproParent`'s comment scope is the SAME
 * element that also carries `ReproChild`'s OWN `bf-s` attribute. `find()`'s
 * (and `findCondTarget()`'s) comment-scope candidate filter in
 * `query.ts` rejected every one of `ReproChild`'s own slots
 * (`<ul bf="s1">`, `<button bf="s2">`): their nearest `[bf-s]` ancestor is
 * that very proxy element, which the filter's `isInCommentScopeRange` check
 * classifies as "a nested child scope inside our range" rather than
 * "ourselves" — there was no `nearestScope === scope` escape hatch. So
 * `$(scope, 's2', 's1')` inside `ReproChild`'s own `init` returned
 * `[null, null]`: no click listener was ever attached AND `mapArrayLazy`
 * returned immediately (`if (!container) return`) without ever creating the
 * loop-level reconciler effect — so no `.map()` update could ever reach the
 * DOM, not just the empty -> non-empty one this issue's title names.
 *
 * Fixed by `belongsToCommentScope()` (`packages/client/src/runtime/
 * query.ts`), the same acceptance rule `belongsToScope()` already used for
 * the non-comment-scope path: a candidate whose nearest `[bf-s]` ancestor
 * IS `scope` itself belongs to `scope`, not to some other nested child.
 *
 * Two mount paths hit this, both covered below:
 *  - hydration (`hydrateCommentScope`, `hydrate.ts`) registers the same
 *    dual-purpose proxy element in `commentScopeRegistry`;
 *  - a CSR mount of `ReproParent` as a nested/dynamically-created
 *    component (`createComponent`'s `isCommentWrapper` branch,
 *    `component.ts`) registers it the same way — this is the shape the
 *    issue's browser oracle exercised as its failing "CSR" case (a plain
 *    top-level `render()` of a single-element-root component does NOT hit
 *    this path at all, since it never registers `commentScopeRegistry` for
 *    a lone root — that's why a bare `render()` mount alone would not have
 *    reproduced the issue's CSR failure).
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

const SOURCE = `'use client'
import { createSignal } from '@barefootjs/client'

export type Data = { items: { id: string; label: string }[] }

function ReproChild({ data, onLoad }: { data: Data; onLoad: () => void }) {
  return (
    <div>
      <ul data-list="true">
        {data.items.map((item) => <li key={item.id}>{item.label}</li>)}
      </ul>
      <button data-action="load" onClick={onLoad}>load</button>
    </div>
  )
}

export function ReproParent({ initial }: { initial: Data }) {
  const [data, setData] = createSignal<Data>(initial)
  return <ReproChild data={data()} onLoad={() => setData({ items: [{ id: '1', label: 'loaded' }] })} />
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

describe('#3277 — comment-scoped root whose sole child is itself a real bf-s scope', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('a keyed-array prop reactively creates its first row after hydration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-3277-'))
    const file = join(dir, 'ReproParent.mjs')
    writeFileSync(file, clientJsFor(SOURCE, 'ReproParent.tsx'))
    await import(file)

    const ssrHtml = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: SOURCE,
      props: { __instanceId: 'ReproParent_test', initial: { items: [] } },
    })
    // Comment-scoped root: no wrapper element of ReproParent's own, only
    // the anchoring comment pair around ReproChild's own rendered div.
    expect(ssrHtml).toContain('<!--bf-scope:ReproParent_test')

    document.body.innerHTML = ssrHtml

    const { rehydrateAll, flushHydration } = await import(runtimePath)
    rehydrateAll()
    flushHydration()

    const btn = document.querySelector('[data-action="load"]') as HTMLButtonElement
    expect(btn).not.toBeNull()
    btn.click()
    await new Promise((r) => setTimeout(r, 0))

    const ul = document.querySelector('[data-list="true"]')
    expect(ul?.querySelectorAll('li').length).toBe(1)
    expect(ul?.textContent).toBe('loaded')
  }, 30000)

  test('a keyed-array prop reactively creates its first row after a CSR mount', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-3277-csr-'))
    const file = join(dir, 'ReproParent.mjs')
    writeFileSync(file, clientJsFor(SOURCE, 'ReproParent.tsx'))
    await import(file)

    // `createComponent` (not the top-level `render()`) is the CSR path a
    // nested/dynamically-mounted component actually takes — e.g. a loop
    // row or a conditional branch swap creating this component fresh, with
    // no SSR markup at all. `render()`'s own single-root branch never
    // registers `commentScopeRegistry`, so it would not have exercised the
    // bug this test guards.
    const { createComponent } = await import(runtimePath)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const el = createComponent('ReproParent', { initial: { items: [] } })
    container.appendChild(el as HTMLElement)

    const btn = document.querySelector('[data-action="load"]') as HTMLButtonElement
    expect(btn).not.toBeNull()
    btn.click()
    await new Promise((r) => setTimeout(r, 0))

    const ul = document.querySelector('[data-list="true"]')
    expect(ul?.querySelectorAll('li').length).toBe(1)
    expect(ul?.textContent).toBe('loaded')
  }, 30000)
})
