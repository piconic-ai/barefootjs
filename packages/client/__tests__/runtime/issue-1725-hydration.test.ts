/**
 * Integration test for #1725: a `.map()` whose item root is a **child
 * component** (`Group`) whose `children` contain a nested `.map()` of
 * **child components** (`Item`) must hydrate the inner components.
 *
 * Before the fix the parent init emitted `initChild('Group', ...)` for the
 * outer loop item but never descended into the component's children to
 * initialize the inner-loop `Item` instances — they rendered from SSR but
 * never attached their event handlers (silent, no error).
 *
 * This test compiles the real components, renders the real SSR HTML via the
 * Hono adapter, drops it into the document, runs the generated `hydrate`
 * walk, then clicks an inner `Item` button and asserts its signal-backed
 * counter increments — observable proof that the inner components hydrated.
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

const ITEM = `'use client'
import { createSignal } from '@barefootjs/client'
export function Item(props: { label: string }) {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(c => c + 1)}>{props.label}: {count()}</button>
}`

const FRAGMENT_GROUP = `'use client'
export function Group(props: { children?: any }) { return <>{props.children}</> }`

const DIV_GROUP = `'use client'
export function Group(props: { children?: any }) { return <div role="group">{props.children}</div> }`

function reproSource(groupImport: string): string {
  return `'use client'
import { Group } from './Group'
import { Item } from './Item'
const GROUPS = [
  { id: 'a', items: [{ id: 'a1', label: 'A1' }, { id: 'a2', label: 'A2' }] },
  { id: 'b', items: [{ id: 'b1', label: 'B1' }, { id: 'b2', label: 'B2' }] },
]
export function Repro() {
  return (
    <div>
      {GROUPS.map(group => (
        <Group key={group.id}>
          {group.items.map(it => (
            <Item key={it.id} label={it.label} />
          ))}
        </Group>
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

async function setupHydration(groupSource: string): Promise<{ hydrate: () => void }> {
  // Register Item + Group + Repro defs (template + init) with the runtime.
  // Each module is imported separately so their (overlapping) runtime import
  // lines don't collide in one module scope.
  const dir = mkdtempSync(join(tmpdir(), 'bf-1725-'))
  const modules: Array<[string, string, string]> = [
    [ITEM, 'Item.tsx', 'Item'],
    [groupSource, 'Group.tsx', 'Group'],
    [reproSource(groupSource), 'Repro.tsx', 'Repro'],
  ]
  for (const [source, filename, name] of modules) {
    const file = join(dir, `${name}.mjs`)
    writeFileSync(file, clientJsFor(source, filename))
    await import(file)
  }

  // Real SSR HTML (Hono adapter) — same markup a server would send.
  const ssrHtml = await renderHonoComponent({
    adapter: new HonoAdapter(),
    source: reproSource(groupSource),
    components: { './Group.tsx': groupSource, './Item.tsx': ITEM },
    // Root scope must carry a `Name_` prefix so the hydration walk resolves
    // it to the registered `Repro` def (`scopeName` splits on the first `_`).
    props: { __instanceId: 'Repro_test' },
  })
  document.body.innerHTML = ssrHtml

  // The `hydrate()` calls during module import already scheduled (and, after
  // the awaits, drained) a walk against the then-empty body. Re-trigger a
  // walk now that the SSR markup is in place, then drain it synchronously.
  const { rehydrateAll, flushHydration } = await import(runtimePath)
  return {
    hydrate: () => {
      rehydrateAll()
      flushHydration()
    },
  }
}

describe('#1725 — nested component .map() inside a component-rooted loop item hydrates', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('fragment-rooted passthrough: all four inner Item buttons become interactive', async () => {
    const { hydrate } = await setupHydration(FRAGMENT_GROUP)
    hydrate()

    const buttons = Array.from(document.querySelectorAll('button'))
    expect(buttons.map(b => b.textContent)).toEqual([
      'A1: 0', 'A2: 0', 'B1: 0', 'B2: 0',
    ])

    // Click each button once — counters must increment, proving each Item
    // (including 2nd+ group members) attached its onClick handler.
    for (const button of buttons) {
      button.dispatchEvent(new window.Event('click', { bubbles: true }))
    }

    expect(buttons.map(b => b.textContent)).toEqual([
      'A1: 1', 'A2: 1', 'B1: 1', 'B2: 1',
    ])
  })

  test('element-rooted passthrough: inner Item buttons become interactive', async () => {
    const { hydrate } = await setupHydration(DIV_GROUP)
    hydrate()

    const buttons = Array.from(document.querySelectorAll('button'))
    expect(buttons.map(b => b.textContent)).toEqual([
      'A1: 0', 'A2: 0', 'B1: 0', 'B2: 0',
    ])

    buttons[2].dispatchEvent(new window.Event('click', { bubbles: true }))

    expect(buttons.map(b => b.textContent)).toEqual([
      'A1: 0', 'A2: 0', 'B1: 1', 'B2: 0',
    ])
  })
})
