/**
 * Integration test for #3713: a `{...props}` spread onto a child component
 * inside a `.map()` row merges with the call's explicit props in source
 * order, as JS does, on every client path of the row: a pure
 * `createComponent` mount, a row added by an update, and hydration of
 * Hono's SSR HTML.
 *
 * Before the fix every loop-row props builder spelled the spread as a
 * getter literally named `...` (`{ get "..."() { return _p } }`), so the
 * row's child received none of the caller's keys on the client.
 *
 * The compiled modules are wired to the runtime source through their import
 * declarations, located with the TypeScript AST rather than by matching
 * the JS text.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import ts from 'typescript'
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

/**
 * `clientJs` with its runtime import pointed at the runtime source and the
 * `@bf-child` import markers removed (this test loads every module itself).
 */
function wireModule(clientJs: string): string {
  const file = ts.createSourceFile('client.mjs', clientJs, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const edits: Array<{ start: number; end: number; text: string }> = []
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const specifier = statement.moduleSpecifier.text
    if (specifier === '@barefootjs/client/runtime') {
      edits.push({ start: statement.moduleSpecifier.getStart(file), end: statement.moduleSpecifier.end, text: JSON.stringify(runtimePath) })
    } else if (statement.importClause === undefined && specifier.includes('@bf-child:')) {
      edits.push({ start: statement.getStart(file), end: statement.end, text: '' })
    }
  }
  return edits.reduceRight((code, e) => code.slice(0, e.start) + e.text + code.slice(e.end), clientJs)
}

const TAG = `'use client'
export function Tag3713(props: { tone?: string; size?: string; label?: string }) {
  return <b data-tone={props.tone} data-size={props.size}>{props.label}</b>
}`

// `size` comes before the spread (the caller's `size` wins when passed),
// `label` after it (the row's own value always wins). One section per
// loop-row builder: a component row, an element row, a conditional inside
// a row, a static-array row and a nested loop's row. The `<output>` reads
// every key directly: a key reached only through a spread is not written to
// the root's hydration props (`bf-p`), a separate gap this test keeps out of
// the way.
const LIST = `'use client'
import { createSignal } from '@barefootjs/client'
import { Tag3713 } from './Tag3713'
export function List3713(props: { tone?: string; size?: string; label?: string }) {
  const [items, setItems] = createSignal(['a'])
  const [groups, setGroups] = createSignal([{ id: 'g', cells: ['c'] }])
  const fixed = ['x']
  return (
    <div>
      <button onClick={() => { setItems([...items(), 'b']); setGroups([...groups(), { id: 'h', cells: ['d'] }]) }}>add</button>
      <output>{props.tone}{props.size}{props.label}</output>
      <ul>{items().map((it) => <Tag3713 key={it} size="s" {...props} label={it} />)}</ul>
      <ol>{items().map((it) => <li key={it}><Tag3713 size="s" {...props} label={it} /></li>)}</ol>
      <section>{items().map((it) => <p key={it}>{props.tone ? <Tag3713 size="s" {...props} label={it} /> : null}</p>)}</section>
      <nav>{fixed.map((it) => <Tag3713 key={it} size="s" {...props} label={it} />)}</nav>
      <dl>{groups().map((g) => <dd key={g.id}>{g.cells.map((c) => <Tag3713 key={c} size="s" {...props} label={c} />)}</dd>)}</dl>
    </div>
  )
}`

// A loop row named `props` is the row, not the component's props object:
// its spread must not forward the caller's props.
const SHADOW = `'use client'
import { Tag3713 } from './Tag3713'
export function Shadow3713(props: { rows: { tone: string; label: string }[]; tone?: string }) {
  const rows = props.rows
  return <ul>{rows.map((props) => <Tag3713 key={props.label} size="s" {...props} />)}</ul>
}`

const CALLER = { tone: 'warm', size: 'l', label: 'ignored' }

function clientJsFor(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compile errors in ${filename}:\n${errors.map(e => `${e.code}: ${e.message}`).join('\n')}`)
  }
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error(`No client JS for ${filename}`)
  return wireModule(clientJs)
}

let loaded = false
async function loadComponents(): Promise<void> {
  if (loaded) return
  const dir = mkdtempSync(join(tmpdir(), 'bf-3713-'))
  for (const [source, name] of [[TAG, 'Tag3713'], [LIST, 'List3713'], [SHADOW, 'Shadow3713']] as const) {
    const file = join(dir, `${name}.mjs`)
    writeFileSync(file, clientJsFor(source, `${name}.tsx`))
    await import(file)
  }
  loaded = true
}

type TagState = { tone: string | null; size: string | null; label: string | null }

function tags(root: ParentNode, container: string): TagState[] {
  return [...root.querySelectorAll(`${container} b`)].map(b => ({
    tone: b.getAttribute('data-tone'),
    size: b.getAttribute('data-size'),
    label: b.textContent,
  }))
}

const merged = (label: string): TagState => ({ tone: 'warm', size: 'l', label })

/**
 * Every row's child carries the merged props. `rowContainers` defaults to
 * all three dynamic-row sections; after an update the conditional-in-row
 * section is left out (a component inside a conditional of a row added on
 * the client is not rendered there at all, spread or not — a separate gap).
 */
function expectRows(root: ParentNode, labels: string[], cells: string[], rowContainers = ['ul', 'ol', 'section']): void {
  for (const container of rowContainers) {
    expect({ container, rows: tags(root, container) }).toEqual({ container, rows: labels.map(merged) })
  }
  expect(tags(root, 'nav')).toEqual([merged('x')])
  expect(tags(root, 'dl')).toEqual(cells.map(merged))
}

async function honoHtml(source: string, props: Record<string, unknown>, instanceId: string): Promise<string> {
  return renderHonoComponent({
    adapter: new HonoAdapter(),
    source,
    components: { './Tag3713.tsx': TAG },
    props: { ...props, __instanceId: instanceId },
  })
}

describe('#3713 — a {...props} spread onto a child in a loop row', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('the Hono reference merges the spread in source order', async () => {
    document.body.innerHTML = await honoHtml(LIST, CALLER, 'List3713_test')
    expectRows(document.body, ['a'], ['c'])
  })

  test('a createComponent mount gives every row child the merged props', async () => {
    await loadComponents()
    const { createComponent } = await import(runtimePath)
    const el = createComponent('List3713', { ...CALLER }) as HTMLElement
    document.body.appendChild(el)
    expectRows(el, ['a'], ['c'])
  })

  test('a row added by an update gets the merged props too', async () => {
    await loadComponents()
    const { createComponent } = await import(runtimePath)
    const el = createComponent('List3713', { ...CALLER }) as HTMLElement
    document.body.appendChild(el)
    el.querySelector('button')!.click()
    expectRows(el, ['a', 'b'], ['c', 'd'], ['ul', 'ol'])
  })

  test('hydrating the SSR HTML keeps the merged props, also for rows added afterwards', async () => {
    await loadComponents()
    document.body.innerHTML = await honoHtml(LIST, CALLER, 'List3713_test')
    const { rehydrateAll, flushHydration } = await import(runtimePath)
    rehydrateAll()
    flushHydration()
    expectRows(document.body, ['a'], ['c'])
    document.querySelector('button')!.click()
    expectRows(document.body, ['a', 'b'], ['c', 'd'], ['ul', 'ol'])
  })

  test('an explicit prop before the spread keeps its value when the caller omits the key', async () => {
    await loadComponents()
    const { createComponent } = await import(runtimePath)
    const el = createComponent('List3713', { tone: 'warm' }) as HTMLElement
    document.body.appendChild(el)
    expect(tags(el, 'ul')).toEqual([{ tone: 'warm', size: 's', label: 'a' }])
    expect(tags(el, 'nav')).toEqual([{ tone: 'warm', size: 's', label: 'x' }])
  })

  test('a loop row named `props` is the row, not the props object', async () => {
    await loadComponents()
    const rows = [{ tone: 'cool', label: 'r' }]
    const { createComponent } = await import(runtimePath)
    const el = createComponent('Shadow3713', { rows, tone: 'warm', size: 'l' }) as HTMLElement
    document.body.appendChild(el)
    // Only what the props-object merge decides is asserted: the caller's
    // `tone` / `size` must not reach the row. Spreading the row object
    // itself is a separate client gap.
    const [row] = tags(el, 'ul')
    expect(row.tone).not.toBe('warm')
    expect(row.size).toBe('s')
  })
})
