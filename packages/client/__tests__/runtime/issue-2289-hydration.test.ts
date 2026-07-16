/**
 * Integration test for #2289: a fragment-rooted child component (own file,
 * `'use client'`, root is `<>…</>`) must receive its parent's function props
 * and reactive getter props through SSR hydration.
 *
 * Before the fix the child's scope existed only as a `<!--bf-scope:...-->`
 * comment: the parent's `$c(scope, 'sN')` element lookup returned null, so
 * `initChild` never ran the child's init — the label froze at its SSR value
 * and the onClick callback silently no-op'd (no error, no warning).
 *
 * This compiles the real components, renders real Hono-adapter SSR HTML,
 * hydrates, then clicks the child's button and asserts the parent's signal
 * moved AND the child's getter-driven text re-rendered.
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

const CHILD_FRAGMENT = `'use client'
interface Props {
  label: string
  onClick: () => void
}
export function ChildFragment(props: Props) {
  return (
    <>
      <button onClick={() => props.onClick()}>{props.label}</button>
      <p>hint</p>
    </>
  )
}`

const PARENT = `'use client'
import { createSignal } from '@barefootjs/client'
import { ChildFragment } from './ChildFragment'
export function ParentIsland() {
  const [count, setCount] = createSignal(0)
  return (
    <div>
      <span>{count()}</span>
      <ChildFragment label={\`add:\${count()}\`} onClick={() => setCount((c) => c + 1)} />
    </div>
  )
}`

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

describe('#2289 — fragment-rooted child receives function/getter props on hydration', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('clicking the child button drives the parent signal and the getter prop back into the child', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-2289-'))
    for (const [source, filename, name] of [
      [CHILD_FRAGMENT, 'ChildFragment.tsx', 'ChildFragment'],
      [PARENT, 'ParentIsland.tsx', 'ParentIsland'],
    ] as const) {
      const file = join(dir, `${name}.mjs`)
      writeFileSync(file, clientJsFor(source, filename))
      await import(file)
    }

    const ssrHtml = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: PARENT,
      components: { './ChildFragment.tsx': CHILD_FRAGMENT },
      props: { __instanceId: 'ParentIsland_test' },
    })
    // The child's scope must be comment-anchored (that's the shape under test):
    expect(ssrHtml).toContain('<!--bf-scope:ParentIsland_test_')
    expect(ssrHtml).toContain('<!--bf-/scope:ParentIsland_test_')

    document.body.innerHTML = ssrHtml

    const { rehydrateAll, flushHydration } = await import(runtimePath)
    rehydrateAll()
    flushHydration()

    const button = document.querySelector('button')!
    expect(button.textContent).toBe('add:0')

    button.dispatchEvent(new window.Event('click', { bubbles: true }))

    // onClick reached the child (parent signal moved)…
    expect(document.querySelector('span')!.textContent).toBe('1')
    // …and the child's getter prop stayed live (its own text re-rendered).
    expect(button.textContent).toBe('add:1')
  }, 30000)
})
