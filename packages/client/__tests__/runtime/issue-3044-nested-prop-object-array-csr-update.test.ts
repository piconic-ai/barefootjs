/**
 * Runtime regression test for #3044.
 *
 * A client child component receiving a reactive OBJECT prop
 * (`{ data }: { data: { items: T[] } }`) that maps a nested array property
 * off it (`data.items.map(...)`) never reconciled when the parent's signal
 * driving `data` changed the array from empty (SSR-time) to non-empty
 * (e.g. in `onMount`). `isArrayExprDirectPropRef` (jsx-to-ir.ts) only
 * recognized a bare destructured-prop identifier or a single member access
 * off the WHOLE props object (`props.items`) as prop-derived — a nested
 * member access off a destructured OBJECT prop (`data.items`) fell through
 * both cases, so the loop compiled to the static SSR-row-bind path (a
 * one-shot `forEach` over the initially-empty array) instead of `mapArray`.
 *
 * Mirrors `issue-2724-prop-alias-loop-csr-mount.test.ts`'s harness: compile
 * the real parent+child source from the issue, mount the parent via
 * `createComponent`, and assert the child's list reflects the post-mount
 * signal update.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

const adapter = new TestAdapter()

async function compileAndEvalClientJs(source: string, filename: string): Promise<void> {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors in ${filename}:\n${errors.map(e => e.message).join('\n')}`)
  }
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')

  const runtimePath = join(__dirname, '../../src/runtime/index.ts')
  const rewritten = clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')

  const dir = mkdtempSync(join(tmpdir(), 'bf-3044-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
}

const REPRO_CHILD_SRC = `
  'use client'
  export type ReproData = { items: { id: string; label: string }[] }
  export function ReproChild({ data }: { data: ReproData }) {
    return (
      <ul aria-label="items">
        {data.items.map((item) => <li key={item.id}>{item.label}</li>)}
      </ul>
    )
  }
`

const REPRO_PARENT_SRC = `
  'use client'
  import { createSignal, onMount } from '@barefootjs/client'
  import { ReproChild } from './ReproChild'
  export function ReproParent() {
    const [data, setData] = createSignal({ items: [] as { id: string; label: string }[] })
    onMount(() => setData({ items: [{ id: '1', label: 'loaded' }] }))
    return <ReproChild data={data()} />
  }
`

describe('#3044 — CSR-mounted child reconciles a nested prop-object array after a parent signal update', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('list starts empty and gains a row once the parent signal updates in onMount', async () => {
    await compileAndEvalClientJs(REPRO_CHILD_SRC, 'ReproChild.tsx')
    await compileAndEvalClientJs(REPRO_PARENT_SRC, 'ReproParent.tsx')

    const { createComponent } = await import('../../src/runtime')
    const result = createComponent('ReproParent', {})
    document.body.appendChild(result)
    await new Promise(r => setTimeout(r, 0))

    const list = document.body.querySelector('ul[aria-label="items"]')!
    expect(list).not.toBeNull()
    expect(list.querySelectorAll('li')).toHaveLength(1)
    expect(list.textContent).toContain('loaded')
  })
})
