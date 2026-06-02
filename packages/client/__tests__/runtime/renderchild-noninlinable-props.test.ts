/**
 * Runtime regression test for the dropped-prop bug.
 *
 * When a parent passes a NON-statically-inlinable value (e.g.
 * `Array.from(...)`) as a prop to a child component, the prop must still
 * reach the child. The module-scope CSR template lambda cannot inline
 * such a value, so the parent must DEFER the child render to init (which
 * carries the value through a `get propName()` getter) rather than
 * eagerly calling `renderChild('Child', {})` with the prop dropped — that
 * makes the child template read `undefined.filter(...)` and throw.
 *
 * The 4-case matrix mirrors the repro: {module, local} × {literal,
 * Array.from}. Literals (A/B) already bake into the template; the
 * Array.from cases (C/D) are the regression.
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

  const dir = mkdtempSync(join(tmpdir(), 'bf-dropprop-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}_${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(file, rewritten)
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
}

const CHILD_SRC = `
  'use client'
  import { createMemo } from '@barefootjs/client'
  interface Row { id: string }
  export function DropChild(props: { rows: Row[] }) {
    const n = createMemo(() => props.rows.filter(r => r.id !== '').length)
    return <div data-drop-child="true">{n()}</div>
  }
`

describe('renderChild — non-inlinable component props are forwarded (no dropped props)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  // The parent's root is a single child component, so `createComponent`
  // returns the rendered child element directly (a comment-scope parent).
  // Resolve the child whether it is the returned element itself or a
  // descendant.
  function findChild(el: Element): Element | null {
    if (el.getAttribute('data-drop-child') === 'true') return el
    return el.querySelector('[data-drop-child="true"]')
  }

  async function mountParent(label: string, parentSrc: string) {
    await compileAndEvalClientJs(CHILD_SRC, `DropChild_${label}.tsx`)
    await compileAndEvalClientJs(parentSrc, `DropParent_${label}.tsx`)
    const { createComponent } = await import('../../src/runtime')
    const el = createComponent(`DropParent${label}`, {}) as Element
    document.body.appendChild(el)
    return el
  }

  test('A: module-scope literal array forwards the prop', async () => {
    const el = await mountParent('A', `
      'use client'
      import { DropChild } from './DropChild_A'
      const rowsA = [{ id: 'a' }, { id: 'b' }]
      export function DropParentA() { return <DropChild rows={rowsA} /> }
    `)
    const child = findChild(el)
    expect(child).not.toBeNull()
    expect(child!.textContent).toBe('2')
  })

  test('B: local literal array forwards the prop', async () => {
    const el = await mountParent('B', `
      'use client'
      import { DropChild } from './DropChild_B'
      export function DropParentB() {
        const rowsB = [{ id: 'a' }, { id: 'b' }]
        return <DropChild rows={rowsB} />
      }
    `)
    const child = findChild(el)
    expect(child).not.toBeNull()
    expect(child!.textContent).toBe('2')
  })

  test('C: module-scope Array.from forwards the prop (regression)', async () => {
    const el = await mountParent('C', `
      'use client'
      import { DropChild } from './DropChild_C'
      const rowsC = Array.from({ length: 3 }, (_, i) => ({ id: String(i) }))
      export function DropParentC() { return <DropChild rows={rowsC} /> }
    `)
    const child = findChild(el)
    expect(child).not.toBeNull()
    expect(child!.textContent).toBe('3')
  })

  test('D: local Array.from forwards the prop (regression)', async () => {
    const el = await mountParent('D', `
      'use client'
      import { DropChild } from './DropChild_D'
      export function DropParentD() {
        const rowsD = Array.from({ length: 3 }, (_, i) => ({ id: String(i) }))
        return <DropChild rows={rowsD} />
      }
    `)
    const child = findChild(el)
    expect(child).not.toBeNull()
    expect(child!.textContent).toBe('3')
  })
})
