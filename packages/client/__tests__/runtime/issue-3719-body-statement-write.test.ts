/**
 * Runtime checks for #3719: the two reads of a binding a component-body
 * statement writes that the compiler still accepts are read on the client
 * AFTER init ran the statement, so a mount shows what the statement wrote.
 *
 * - a `/* @client *\/` read (the escape `checkStatementWrites`'s BF101 names);
 * - a value handed to a child component as a prop (the client passes the
 *   live binding from init).
 *
 * Compiles each component, registers it through the real runtime's
 * `hydrate`, mounts it with `createComponent` and reads the DOM.
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

async function mount(source: string, name: string): Promise<Element> {
  const result = compileJSX(source, `${name}.tsx`, { adapter: new TestAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors in ${name}:\n${errors.map(e => e.message).join('\n')}`)
  }
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')

  const runtimePath = join(__dirname, '../../src/runtime/index.ts')
  const rewritten = clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')
  const dir = mkdtempSync(join(tmpdir(), 'bf-3719-'))
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, rewritten)
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
  const { createComponent } = await import('../../src/runtime')
  const el = createComponent(name, {}) as Element
  document.body.appendChild(el)
  return el
}

describe('#3719: reads of a binding a body statement writes, on a client mount', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('a /* @client */ text and attribute read see the written value', async () => {
    const el = await mount(
      `
      'use client'
      export function StatementWriteClientRead() {
        const local = ['y']
        local.push('z')
        return <p data-n={/* @client */ local.length}>{/* @client */ local.length}</p>
      }
    `,
      'StatementWriteClientRead',
    )
    expect(el.textContent).toBe('2')
    expect(el.getAttribute('data-n')).toBe('2')
  })

  test('a child handed the binding as a prop renders the written value', async () => {
    const el = await mount(
      `
      'use client'
      function StatementWriteKid(props: { items: string[] }) {
        return <i>{props.items.length}</i>
      }
      export function StatementWriteParent() {
        const items = ['y']
        items.push('z')
        return <div><StatementWriteKid items={items} /></div>
      }
    `,
      'StatementWriteParent',
    )
    expect(el.querySelector('i')?.textContent).toBe('2')
  })
})
