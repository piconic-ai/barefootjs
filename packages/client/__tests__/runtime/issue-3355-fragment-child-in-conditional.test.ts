/**
 * Integration test for #3355: hydrating a conditional whose branch renders a
 * stateless fragment-rooted child (`<>{children}</>`) must leave the
 * server-rendered DOM unchanged.
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

const runtimePath = join(__dirname, '../../src/runtime/index.ts')

const SOURCE = `'use client'
import { createSignal } from '@barefootjs/client'

function Passthrough({ children }: { children?: unknown }) {
  return <>{children}</>
}

export function Probe() {
  const [show, setShow] = createSignal(true)
  return (
    <div>
      {show() && <Passthrough><mark className="m">value</mark></Passthrough>}
      <button onClick={() => setShow(!show())}>t</button>
    </div>
  )
}`

// The passed-through element is interactive: its handler and text binding are
// owned by Probe (`bf="^sN"`) and must bind with no scope from Passthrough.
const INTERACTIVE_SOURCE = `'use client'
import { createSignal } from '@barefootjs/client'

function Passthrough({ children }: { children?: unknown }) {
  return <>{children}</>
}

export function Probe() {
  const [show, setShow] = createSignal(true)
  const [n, setN] = createSignal(0)
  return (
    <div>
      {show() && <Passthrough><b onClick={() => setN(n() + 1)}>{n()}</b></Passthrough>}
      <button onClick={() => setShow(!show())}>t</button>
    </div>
  )
}`

function clientJs(source = SOURCE): string {
  const result = compileJSX(source, 'Probe.tsx', { adapter: new TestAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => `${e.code}: ${e.message}`).join('\n'))
  const js = result.files.find(f => f.type === 'clientJs')?.content
  if (!js) throw new Error('No client JS')
  return js.replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
}

describe('#3355 — fragment-rooted child inside a conditional', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('hydration leaves the SSR DOM unchanged, and toggling still works', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'bf-3355-')), 'Probe.mjs')
    writeFileSync(file, clientJs())
    await import(file)
    document.body.innerHTML = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: SOURCE,
      props: { __instanceId: 'Probe_test' },
    })
    const ssr = document.body.innerHTML
    const { rehydrateAll, flushHydration } = await import(runtimePath)
    rehydrateAll()
    flushHydration()

    expect(document.body.innerHTML).toBe(ssr)

    const button = () => document.querySelector('button')!
    button().dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(document.querySelector('mark')).toBeNull()
    button().dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(document.querySelector('mark')?.textContent).toBe('value')
  })

  test('a passed-through interactive element binds on hydration and after a re-render', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'bf-3355-')), 'Probe.mjs')
    writeFileSync(file, clientJs(INTERACTIVE_SOURCE))
    await import(file)
    document.body.innerHTML = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: INTERACTIVE_SOURCE,
      props: { __instanceId: 'Probe_test' },
    })
    const ssr = document.body.innerHTML
    const { rehydrateAll, flushHydration } = await import(runtimePath)
    rehydrateAll()
    flushHydration()
    expect(document.body.innerHTML).toBe(ssr)

    const click = (sel: string) =>
      document.querySelector(sel)!.dispatchEvent(new window.Event('click', { bubbles: true }))
    click('b')
    expect(document.querySelector('b')?.textContent).toBe('1')

    click('button')
    expect(document.querySelector('b')).toBeNull()
    click('button')
    expect(document.querySelector('b')?.hasAttribute('bf-s')).toBe(false)
    click('b')
    expect(document.querySelector('b')?.textContent).toBe('2')
  })
})
