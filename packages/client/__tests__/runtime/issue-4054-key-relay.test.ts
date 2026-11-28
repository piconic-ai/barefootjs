/**
 * Runtime checks for #4054: where the CSR render puts the row key of a
 * keyed loop row whose component renders its first element from somewhere
 * else (a child component, a branch or fragment that starts with one).
 *
 * SSR renders the key only on the elements carrying `IRElement.keyAttr`:
 * none when the component's root is another component, a later element
 * when a fragment starts with one. `renderChild` used to stamp the key onto
 * the first element of the markup whatever the shape. A `keyRelay` def now
 * renders the key from its template instead, so `renderChild` puts it where
 * SSR does. A mounted row still carries its key on its primary element,
 * where `mapArray` reads it, as it does after hydrating SSR markup.
 *
 * Compiles each component, registers it through the real runtime's
 * `hydrate`, and reads `renderChild`'s markup and a mounted DOM.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import ts from 'typescript'
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

const runtimePath = join(__dirname, '../../src/runtime/index.ts')

/** Point the compiled module's runtime import at the runtime source (a walk of its top-level imports). */
function relinkRuntime(clientJs: string): string {
  const sf = ts.createSourceFile('client.mjs', clientJs, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const edits: Array<{ start: number; end: number; text: string }> = []
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (!stmt.importClause) {
      edits.push({ start: stmt.getFullStart(), end: stmt.getEnd(), text: '' })
    } else if (stmt.moduleSpecifier.text === '@barefootjs/client/runtime') {
      const spec = stmt.moduleSpecifier
      edits.push({ start: spec.getStart(sf), end: spec.getEnd(), text: JSON.stringify(runtimePath) })
    }
  }
  let out = clientJs
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}

async function load(source: string, name: string): Promise<string> {
  const result = compileJSX(source, `${name}.tsx`, { adapter: new TestAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors in ${name}:\n${errors.map(e => e.message).join('\n')}`)
  }
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')
  const dir = mkdtempSync(join(tmpdir(), 'bf-4054-'))
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, relinkRuntime(clientJs))
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
  return clientJs
}

function parse(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

const SOURCE = `
'use client'
import { createSignal } from '@barefootjs/client'
export function K4054(props: { label?: string }) {
  return <b>{props.label}</b>
}
export function Root4054(props: { label?: string }) {
  return <K4054 label={props.label} />
}
export function Chain4054(props: { label?: string }) {
  return <Root4054 label={props.label} />
}
export function Lead4054(props: { label?: string }) {
  return <><K4054 label={props.label} /><i>{props.label}</i></>
}
export function Branch4054(props: { label?: string; kid?: boolean }) {
  if (props.kid) return <K4054 label={props.label} />
  return <i>{props.label}</i>
}
export function Elem4054(props: { label?: string }) {
  return <i>{props.label}</i>
}
export function List4054(props: { items: string[] }) {
  const [items, setItems] = createSignal(props.items)
  return (
    <div>
      <button onClick={() => setItems([...items()].reverse())}>rev</button>
      <ul>{items().map((x) => <Root4054 key={x} label={x} />)}</ul>
    </div>
  )
}
`

describe('#4054: the row key of a component whose first element is not its own', () => {
  let clientJs = ''
  beforeAll(async () => {
    clientJs = await load(SOURCE, 'K4054')
  })
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('only the components whose first element is not their own carriers relay the key in the template', () => {
    expect(clientJs).toMatch(/hydrate\('Root4054', \{[^\n]*keyRelay: true/)
    expect(clientJs).toMatch(/hydrate\('Lead4054', \{[^\n]*keyRelay: true/)
    expect(clientJs).toMatch(/hydrate\('Branch4054', \{[^\n]*keyRelay: true/)
    expect(clientJs).not.toMatch(/hydrate\('Elem4054', \{[^\n]*keyRelay/)
    expect(clientJs).not.toMatch(/hydrate\('K4054', \{[^\n]*keyRelay/)
  })

  test('a root that is another component renders no key, at any depth', async () => {
    const { renderChild } = await import('../../src/runtime')
    for (const name of ['Root4054', 'Chain4054']) {
      const b = parse(renderChild(name, { label: 'a' }, 'a', 's0', true)).querySelector('b')!
      expect(b.hasAttribute('data-key')).toBe(false)
    }
  })

  test('a fragment that starts with a component renders the key on its own element', async () => {
    const { renderChild } = await import('../../src/runtime')
    const host = parse(renderChild('Lead4054', { label: 'a' }, 'a', 's0', true))
    expect(host.querySelector('b')!.hasAttribute('data-key')).toBe(false)
    expect(host.querySelector('i')!.getAttribute('data-key')).toBe('a')
  })

  test('an if-statement root renders the key only in its element branch', async () => {
    const { renderChild } = await import('../../src/runtime')
    expect(parse(renderChild('Branch4054', { label: 'a', kid: true }, 'a', 's0', true)).querySelector('b')!.hasAttribute('data-key')).toBe(false)
    expect(parse(renderChild('Branch4054', { label: 'a' }, 'a', 's0', true)).querySelector('i')!.getAttribute('data-key')).toBe('a')
  })

  test('an element root still gets the key stamped', async () => {
    const { renderChild } = await import('../../src/runtime')
    expect(parse(renderChild('Elem4054', { label: 'a' }, 'a', 's0', true)).querySelector('i')!.getAttribute('data-key')).toBe('a')
  })

  test('a mounted list keys its rows on their primary element and reorders them by key', async () => {
    const { createComponent } = await import('../../src/runtime')
    const el = createComponent('List4054', { items: ['a', 'b', 'c'] }) as HTMLElement
    document.body.appendChild(el)
    const rows = () => Array.from(el.querySelectorAll('ul > b')) as HTMLElement[]
    expect(rows().map(b => b.getAttribute('data-key'))).toEqual(['a', 'b', 'c'])
    const before = rows()
    el.querySelector('button')!.click()
    expect(rows().map(b => b.textContent)).toEqual(['c', 'b', 'a'])
    expect(rows().map(b => b.getAttribute('data-key'))).toEqual(['c', 'b', 'a'])
    // Reordered, not re-created: the same nodes come back in reverse.
    expect(rows()).toEqual([...before].reverse())
  })
})
