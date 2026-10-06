/**
 * Integration test for #3324: a reactive attribute on an element a
 * conditional branch forwards as a child component's `children` must
 * update, and must never land on another component's forwarded element
 * that happens to carry the same parent-owned slot id (`^sN`).
 *
 * The real-browser fixture `cond-forwarded-child-attr` covers element-rooted
 * receivers. This test adds another component's fragment-rooted
 * (`<>{children}</>`) receiver, whose scope sits on the forwarded element
 * itself once mounted, so the element's nearest scope ANCESTOR is that
 * component — a host the parent does own. Both paths run: real Hono SSR +
 * hydration, and a CSR `render()`. Each component below forwards its
 * element as `^s3`.
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

function Wrapper({ children }: { children?: unknown }) {
  return <section>{children}</section>
}

function Passthrough({ children }: { children?: unknown }) {
  return <>{children}</>
}

function OtherWrapped() {
  const [value] = createSignal('other')
  return (
    <article>
      <i data-a={value()} />
      <b data-b={value()} />
      <s data-c={value()} />
      <Wrapper><em className="other-wrapped" data-label={value()}>x</em></Wrapper>
    </article>
  )
}

function OtherPass() {
  const [value] = createSignal('other')
  return (
    <article>
      <i data-a={value()} />
      <b data-b={value()} />
      <s data-c={value()} />
      <Passthrough><em className="other-pass" data-label={value()}>x</em></Passthrough>
    </article>
  )
}

export function Parent() {
  const [show, setShow] = createSignal(true)
  const [label, setLabel] = createSignal('alpha')
  return (
    <div>
      {show() && (
        <>
          <OtherPass />
          <OtherWrapped />
          <Wrapper><mark className="own" data-label={label()}>x</mark></Wrapper>
        </>
      )}
      <button className="update" onClick={() => setLabel(label() === 'alpha' ? 'beta' : 'alpha')}>update</button>
      <button className="toggle" onClick={() => setShow(!show())}>toggle</button>
    </div>
  )
}`

let loaded = false
async function loadClientJs(): Promise<void> {
  if (loaded) return
  const result = compileJSX(SOURCE, 'Parent.tsx', { adapter: new TestAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => `${e.code}: ${e.message}`).join('\n'))
  const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')
  const file = join(mkdtempSync(join(tmpdir(), 'bf-3324-')), 'Parent.mjs')
  writeFileSync(file, clientJs)
  await import(file)
  loaded = true
}

const labelOf = (selector: string) => document.querySelector(selector)?.getAttribute('data-label')
const click = (selector: string) =>
  document.querySelector(selector)!.dispatchEvent(new window.Event('click', { bubbles: true }))

function expectLabels(own: string) {
  expect(labelOf('.own')).toBe(own)
  expect(labelOf('.other-pass')).toBe('other')
  expect(labelOf('.other-wrapped')).toBe('other')
}

function exerciseUpdatesAndRecreation() {
  expectLabels('alpha')
  click('.update')
  expectLabels('beta')
  click('.toggle')
  expect(document.querySelector('.own')).toBeNull()
  click('.toggle')
  expectLabels('beta')
  click('.update')
  expectLabels('alpha')
}

describe('#3324 — forwarded parent-owned slot ownership with fragment-rooted receivers', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('the compiled source forwards all three elements as the same ^s3', async () => {
    const result = compileJSX(SOURCE, 'Parent.tsx', { adapter: new TestAdapter() })
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain(`qsa(__branchScope, '[bf="^s3"]', ["s4"])`)
    expect((clientJs.match(/class="other-pass"[^`]*?bf="\^s3"/g) ?? []).length).toBeGreaterThan(0)
    expect((clientJs.match(/class="other-wrapped"[^`]*?bf="\^s3"/g) ?? []).length).toBeGreaterThan(0)
  })

  test('SSR + hydration', async () => {
    await loadClientJs()
    document.body.innerHTML = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: SOURCE,
      props: { __instanceId: 'Parent_test' },
    })
    const { rehydrateAll, flushHydration } = await import(runtimePath)
    rehydrateAll()
    flushHydration()
    exerciseUpdatesAndRecreation()
  })

  test('CSR render()', async () => {
    await loadClientJs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { render } = await import(runtimePath)
    render(container, 'Parent')
    exerciseUpdatesAndRecreation()
  })
})
