/**
 * A fragment-rooted component's CSR output must reproduce the scope shape
 * SSR renders for it. Two emission sites used to diverge (found by the
 * nightly mutation sweep's `fragment-wrap` mutant, real-browser pins:
 * `portal-fragment-root` / `loop-row-fragment-root-child` in
 * `packages/adapter-tests/fixtures/`):
 *
 * 1. The template-only registration (`generateTemplateOnlyMount`, a
 *    stateless child with no init) declared neither `comment` nor
 *    `fragmentRoot`, so `renderChild()` stamped `bf-s` on the child's first
 *    element while SSR scoped it with a `<!--bf-scope:-->` comment pair.
 * 2. An `ssrPortalOwnerScope` element is SSR-placed at the portal outlet
 *    with `bf-po="<own scope id>"`; on a CSR mount the owner came only from
 *    the ref callback's `el.closest('[bf-s]')`, which finds nothing for a
 *    fragment root. The init now stamps the same owner after the callback.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../index'
import { TestAdapter } from '../adapters/test-adapter'

function clientJs(src: string): string {
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter() })
  const file = result.files.find(f => f.type === 'clientJs')
  if (!file) throw new Error('no clientJs emitted')
  return file.content
}

function hydrateLine(js: string, key: string): string {
  const line = js.split('\n').find(l => l.startsWith(`hydrate('${key}`))
  if (!line) throw new Error(`no hydrate() registration for ${key}`)
  return line
}

describe('template-only registration declares the fragment-root scope shape', () => {
  test('a stateless fragment-rooted child registers comment + fragmentRoot', () => {
    const js = clientJs(`
'use client'
import { createSignal } from '@barefootjs/client'
function Tag({ children }: { children?: any }) {
  return <><span>{children}</span></>
}
export function Host() {
  const [n, setN] = createSignal(0)
  return <div>{['a', 'b'].map(x => <Tag key={x}>{x}</Tag>)}<button onClick={() => setN(n() + 1)}>{n()}</button></div>
}
`)
    const tag = hydrateLine(js, 'Tag')
    expect(tag).toContain('init: initTag')
    expect(tag).toContain('comment: true')
    expect(tag).toContain('fragmentRoot: true')
  })

  test('a stateless element-rooted child declares neither flag', () => {
    const js = clientJs(`
'use client'
import { createSignal } from '@barefootjs/client'
function Tag({ children }: { children?: any }) {
  return <span>{children}</span>
}
export function Host() {
  const [n, setN] = createSignal(0)
  return <div>{['a', 'b'].map(x => <Tag key={x}>{x}</Tag>)}<button onClick={() => setN(n() + 1)}>{n()}</button></div>
}
`)
    const tag = hydrateLine(js, 'Tag')
    expect(tag).not.toContain('comment: true')
    expect(tag).not.toContain('fragmentRoot: true')
  })
})

const PORTAL_CALLBACK = `
  const moveToBody = (el: HTMLElement) => {
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }`

describe('an SSR-portal ref element stamps its owner after the ref callback', () => {
  test('top-level element: owner stamped right after the callback call', () => {
    const js = clientJs(`
'use client'
import { createSignal, createPortal, isSSRPortal } from '@barefootjs/client'
export function P() {
  const [open, setOpen] = createSignal(false)${PORTAL_CALLBACK}
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <div className="panel" hidden={!open()} ref={moveToBody} />
    </>
  )
}
`)
    expect(js).toMatch(/if \(_s\d+\) \{ \(moveToBody\)\(_s\d+\); if \(__scopeId\) _s\d+\.setAttribute\('bf-po', __scopeId\) \}/)
  })

  test('conditional-branch element: owner stamped in the branch bindEvents too', () => {
    const js = clientJs(`
'use client'
import { createSignal, createPortal, isSSRPortal } from '@barefootjs/client'
export function P() {
  const [open, setOpen] = createSignal(false)${PORTAL_CALLBACK}
  return (
    <div>
      <button onClick={() => setOpen(!open())}>toggle</button>
      {open() ? <div className="panel" ref={moveToBody} /> : null}
    </div>
  )
}
`)
    expect(js).toMatch(/\{ \(moveToBody\)\(_s\d+\); if \(__scopeId\) _s\d+\.setAttribute\('bf-po', __scopeId\) \}/)
  })

  test('a ref callback that is not the SSR-portal pattern keeps the bare call', () => {
    const js = clientJs(`
'use client'
import { createSignal } from '@barefootjs/client'
export function P() {
  const [n, setN] = createSignal(0)
  const focus = (el: HTMLElement) => el.focus()
  return <div><input ref={focus} /><button onClick={() => setN(n() + 1)}>{n()}</button></div>
}
`)
    expect(js).toMatch(/if \(_s\d+\) \(focus\)\(_s\d+\)\n/)
    expect(js).not.toContain("setAttribute('bf-po'")
  })
})
