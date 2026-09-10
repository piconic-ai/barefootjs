/**
 * Regression test for a gap pullfrog's review of #2915 (issue #2910) found
 * in the `ownScopeId` fix: `materializeComponent` (`component.ts`) only
 * captured `wrapperScopeId` — the id `commentScopeRegistry` needs to
 * resolve a comment-wrapper's OWN scope later via `ownScopeId()` — for two
 * of its three mount shapes (a genuine fragment root, and a wrapper
 * mounted BARE at the top level, #2728). The third shape, a comment
 * wrapper (`comment: true`, no `fragmentRoot` — "root is a single
 * child-component call", #2649) CSR-materialized as a NESTED/slotted
 * child — i.e. through `upsertChild`'s CSR-create branch with a real
 * `slotId`, the ordinary way a named child component gets created — hit
 * the `slot?.parent` branch, which set `_parentScopeId` but left
 * `wrapperScopeId` null. `commentScopeId` then resolved to null and the
 * proxy never got a `commentScopeRegistry` entry, so `ownScopeId()` fell
 * through to the proxy's own (wrong) `bf-s` attribute — the exact failure
 * this PR fixes for hydration, reached instead via pure CSR.
 *
 * `#2910-comment-wrapper-loop-child-scope.test.ts` and
 * `#2910-mutated-const-child-prop.test.ts` are both SSR+hydrate, so
 * neither exercised this CSR-only materialize path — this test fills
 * that gap directly against the runtime primitives (`upsertChild` /
 * `createComponent`), mirroring `issue-2728-comment-wrapper-csr-mount-
 * child-slots.test.ts`'s bare-top-level case but with a real `slotId`.
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
const runtimePath = join(__dirname, '../../src/runtime/index.ts')

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

async function loadComponent(source: string, filename: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'bf-2910-nested-csr-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}_${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(file, clientJsFor(source, filename))
  await import(file)
}

const BOX_SRC = `'use client'
export function Box2910Nested(props: { children?: unknown }) {
  return <div data-box="true">{props.children}</div>
}
`

const LEAF_SRC = `'use client'
export function Leaf2910Nested(props: { a: number }) {
  return <span data-leaf="true">{props.a}</span>
}
`

// A comment-wrapper component: its own root is a single child-component
// call (`<Box2910Nested>`), so it registers with `comment: true` and no
// `fragmentRoot` — the exact shape under test.
const MIDDLE_SRC = `'use client'
import { Box2910Nested } from './Box2910Nested'
import { Leaf2910Nested } from './Leaf2910Nested'
export function Middle2910Nested(props: { value: number }) {
  return (
    <Box2910Nested>
      <Leaf2910Nested a={props.value} />
    </Box2910Nested>
  )
}
`

describe('#2910 follow-up — a comment wrapper CSR-materialized as a NESTED (slotted) child registers its own comment scope', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('upsertChild with a real slotId registers commentScopeRegistry so ownScopeId resolves correctly', async () => {
    await loadComponent(BOX_SRC, 'Box2910Nested.tsx')
    await loadComponent(LEAF_SRC, 'Leaf2910Nested.tsx')
    await loadComponent(MIDDLE_SRC, 'Middle2910Nested.tsx')

    const { upsertChild } = await import(runtimePath)
    const { commentScopeRegistry, ownScopeId } = await import('../../src/runtime/scope')

    // Stand in for a parent scope that mounts `Middle2910Nested` as an
    // ordinary named child at slot 's0' via a CSR placeholder — the shape
    // `upsertChild`'s CSR-create branch handles for any deferred/dynamic
    // child, not just this PR's `.map()` case.
    const host = document.createElement('div')
    host.setAttribute('bf-s', 'Host2910Nested_x1')
    const placeholder = document.createElement('div')
    placeholder.setAttribute('data-bf-ph', 's0')
    host.appendChild(placeholder)
    document.body.appendChild(host)

    const proxy = upsertChild(host, 'Middle2910Nested', 's0', { value: 7 })
    expect(proxy).not.toBeNull()
    expect(proxy!.getAttribute('data-box')).toBe('true')

    // The proxy IS `Box2910Nested`'s own rendered element (Middle has no
    // DOM footprint of its own) — its `bf-s` names Box's scope, not
    // Middle's. `ownScopeId` must resolve Middle's real derived scope
    // (`${slot.parent}_${slot.mount}`) via the registry, not that attribute.
    expect(commentScopeRegistry.has(proxy!)).toBe(true)
    expect(ownScopeId(proxy!)).toBe('Host2910Nested_x1_s0')
    expect(ownScopeId(proxy!)).not.toBe(proxy!.getAttribute('bf-s'))

    // And the actual bug this covers: Leaf (Middle's `.map()`-analogue
    // child in the real chart shape) rendered with its prop applied.
    const leaf = proxy!.querySelector('[data-leaf]')
    expect(leaf?.textContent).toBe('7')
  })
})
