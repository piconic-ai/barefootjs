/**
 * Integration test for the mutation sweep's `loop-row-nested-child-children-handler
 * × fragment-wrap` failure (#3230): the #3695 shape — a handler on an element
 * forwarded through a child nested below a loop row — with the receiver
 * component fragment-rooted (`<><span>{children}</span></>`) and the host
 * fragment-rooted too.
 *
 * Three runtime gaps, each pinned by an assertion below:
 *   1. `qsa`'s forwarded-slot walk rejected every comment-delimited scope, so
 *      no `.pick` handler was wired in any row.
 *   2. `insertGetterChildren` dropped the `DocumentFragment` a bare
 *      fragment-root `createComponent` returns, so a client-built
 *      `<Chip><Chip>…</Chip></Chip>` row rendered its outer chip empty.
 *   3. `parentScopeOf` read the fragment-rooted host's raw `bf-s` (absent),
 *      so `upsertChild` built a client-built row's receiver under a random
 *      scope id instead of `${host}_${slot}`.
 * Both paths run: real Hono SSR + hydration, and a CSR `render()`.
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

function Chip({ children }: { children?: any }) {
  return <><span class="chip">{children}</span></>
}

type Row = { id: string; label: string }

export function FragHost() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ])
  const [picked, setPicked] = createSignal('none')
  return (
    <>
      <div>
        <p className="picked">{picked()}</p>
        <button type="button" className="add" onClick={() => setRows([{ id: 'c', label: 'C' }, ...rows()])}>add</button>
        <div className="composite">
          {rows().map((o) => (
            <div key={o.id} className="row">
              <Chip>
                <button type="button" className="pick" onClick={() => setPicked(\`c-\${o.id}\`)}>{o.label}</button>
              </Chip>
            </div>
          ))}
        </div>
        <div className="sig-nested">
          {rows().map((o) => (
            <Chip key={o.id}>
              <Chip>
                <button type="button" className="pick" onClick={() => setPicked(\`s-\${o.id}\`)}>{o.label}</button>
              </Chip>
            </Chip>
          ))}
        </div>
      </div>
    </>
  )
}`

let loaded = false
async function loadClientJs(): Promise<void> {
  if (loaded) return
  const result = compileJSX(SOURCE, 'FragHost.tsx', { adapter: new TestAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => `${e.code}: ${e.message}`).join('\n'))
  const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')
  const file = join(mkdtempSync(join(tmpdir(), 'bf-3695-frag-')), 'FragHost.mjs')
  writeFileSync(file, clientJs)
  await import(file)
  loaded = true
}

const picked = () => document.querySelector('.picked')?.textContent
const click = (selector: string) =>
  document.querySelector(selector)!.dispatchEvent(new window.Event('click', { bubbles: true }))

function exercise() {
  expect(picked()).toBe('none')
  // (1) hydrated / first-render rows: the forwarded handler is wired.
  click('.composite .row:nth-child(2) .pick')
  expect(picked()).toBe('c-b')
  click('.sig-nested > .chip:nth-child(2) .pick')
  expect(picked()).toBe('s-b')

  click('.add')
  // (2) the client-built nested row keeps its children.
  const built = document.querySelector('.sig-nested > .chip:nth-child(1)')
  expect(built?.querySelector('.pick')?.textContent).toBe('C')
  click('.sig-nested > .chip:nth-child(1) .pick')
  expect(picked()).toBe('s-c')
  // (3) the client-built composite row's receiver is hosted by FragHost.
  click('.composite .row:nth-child(1) .pick')
  expect(picked()).toBe('c-c')
}

describe('#3695 under fragment-wrap — forwarded handler through fragment-rooted receivers', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('SSR + hydration', { timeout: 30_000 }, async () => {
    await loadClientJs()
    document.body.innerHTML = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: SOURCE,
      props: { __instanceId: 'FragHost_test' },
    })
    const { rehydrateAll, flushHydration } = await import(runtimePath)
    rehydrateAll()
    flushHydration()
    exercise()
  })

  test('CSR render()', async () => {
    await loadClientJs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { render } = await import(runtimePath)
    render(container, 'FragHost')
    exercise()
  })
})
