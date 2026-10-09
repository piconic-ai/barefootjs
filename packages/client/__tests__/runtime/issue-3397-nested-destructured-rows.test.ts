/**
 * Integration test for #3397: rows nested inside a destructured `.map()`
 * row read the outer row's bindings through the outer row's accessor.
 *
 * The outer row (`{ id, label, tags, rows }`) and the middle row
 * (`{ id: rowId }`) both destructure their item. The middle row reads the
 * outer `label`, and a loop inside it iterates the outer `tags`. Each nested
 * destructured row names its item accessor after its loop, so the deeper
 * reads still resolve to the outer row. The test hydrates the real SSR HTML,
 * then updates the outer item and checks every depth follows it.
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
type Group = { id: string; label: string; tags: string[]; rows: { id: string }[] }
export function Nested() {
  const [groups, setGroups] = createSignal<Group[]>([
    { id: 'g', label: 'G', tags: ['a', 'b'], rows: [{ id: 'r1' }, { id: 'r2' }] },
  ])
  return (
    <div>
      <button onClick={() => setGroups([{ id: 'g', label: 'H', tags: ['x', 'y', 'z'], rows: [{ id: 'r1' }, { id: 'r2' }] }])}>update</button>
      <ul>{groups().map(({ id, label, tags, rows }) => (
        <li key={id}>{rows.map(({ id: rowId }) => (
          <b key={rowId}>{label}:{tags.map(tag => <i key={tag}>{tag}</i>)}</b>
        ))}</li>
      ))}</ul>
    </div>
  )
}`

function clientJs(): string {
  const result = compileJSX(SOURCE, 'Nested.tsx', { adapter: new TestAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => `${e.code}: ${e.message}`).join('\n'))
  const js = result.files.find(f => f.type === 'clientJs')?.content
  if (!js) throw new Error('No client JS')
  return js.replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
}

const rows = () => Array.from(document.querySelectorAll('b')).map(b =>
  `${(b.textContent ?? '').split(':')[0]}|${Array.from(b.querySelectorAll('i')).map(i => i.textContent).join(',')}`)

describe('#3397 — nested destructured rows read the outer row', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('hydrates, then follows an outer-item update at every depth', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'bf-3397-')), 'Nested.mjs')
    writeFileSync(file, clientJs())
    await import(file)
    document.body.innerHTML = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: SOURCE,
      props: { __instanceId: 'Nested_test' },
    })
    const { rehydrateAll, flushHydration } = await import(runtimePath)
    rehydrateAll()
    flushHydration()

    expect(rows()).toEqual(['G|a,b', 'G|a,b'])

    document.querySelector('button')!.dispatchEvent(new window.Event('click', { bubbles: true }))

    expect(rows()).toEqual(['H|x,y,z', 'H|x,y,z'])
  })
})
