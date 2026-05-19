// Unit tests for `generateTestTemplate` — covers the `bf gen test`
// regression on `export function` components (#1403). Writes a fixture
// .tsx to a tmpdir and asserts the emitted string contains the
// expected describe/test bodies, not just the header.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { generateTestTemplate } from '../lib/test-template'

let workdir: string

beforeEach(() => { workdir = mkdtempSync(path.join(tmpdir(), 'bf-test-template-')) })
afterEach(() => { rmSync(workdir, { recursive: true, force: true }) })

function tplFor(source: string, fileName = 'Component.tsx'): string {
  const filePath = path.join(workdir, fileName)
  writeFileSync(filePath, source)
  return generateTestTemplate(filePath)
}

describe('generateTestTemplate', () => {
  test('emits a complete describe block for `export function Counter`', () => {
    const tpl = tplFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Counter() {
        const [count, setCount] = createSignal(0)
        return <div><button onClick={() => setCount(c => c + 1)}>+1</button></div>
      }
    `, 'Counter.tsx')

    // Header
    expect(tpl).toContain(`import { renderToTest } from '@barefootjs/test'`)
    // describe with the actual component name
    expect(tpl).toContain(`describe('Counter'`)
    // basic assertions are present
    expect(tpl).toContain(`expect(result.errors).toEqual([])`)
    expect(tpl).toContain(`expect(result.componentName).toBe('Counter')`)
    // signal extraction
    expect(tpl).toContain(`expect(result.signals).toContain('count')`)
    // event handler picked up
    expect(tpl).toContain(`expect(el.events).toContain('click')`)
  })

  test('reads source via bare filename (same-dir layout)', () => {
    const tpl = tplFor(`export function Foo() { return <div /> }`, 'Foo.tsx')
    expect(tpl).toContain(`readFileSync(resolve(__dirname, 'Foo.tsx')`)
    // Specifically NOT the legacy `__tests__/` hop:
    expect(tpl).not.toContain(`readFileSync(resolve(__dirname, '../Foo.tsx')`)
  })

  test('registry-style `export { Slot }` still produces full template (regression guard)', () => {
    const tpl = tplFor(`
      function Slot(props: { children?: unknown; className?: string }) {
        return <div className={props.className}>{props.children}</div>
      }
      export { Slot }
    `, 'index.tsx')
    expect(tpl).toContain(`describe('Slot'`)
    expect(tpl).toContain(`expect(result.root.tag).toBe('div')`)
  })
})
