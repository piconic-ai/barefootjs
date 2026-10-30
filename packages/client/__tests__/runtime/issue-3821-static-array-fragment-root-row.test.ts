/**
 * #3821: rows of a static (module-const) array whose row component has a
 * fragment root. SSR (and a CSR `render()`) scopes each row with a
 * `<!--bf-scope:<id>|h=<host>|m=<slot>-->` comment, so no element carries
 * the row's scope. The static-array row init used an element selector
 * (`qsaChildScopes`) and never found such a row: no row was initialised and
 * no handler attached. The init now finds rows through `childScopesBySlot`.
 *
 * Covers the reported `fragment-wrap` shape (a handler forwarded through a
 * fragment-rooted child nested in a fragment-rooted row), a row's own
 * handler calling a callback prop in both props forms, and fragment-rooted
 * rows nested in a fragment-rooted group (the document-order zip), and a
 * fragment-rooted component inside a plain-element row or an inner loop's
 * row (the per-row `childScopeBySlot` lookup). Both paths run: real Hono
 * SSR + hydration, and a CSR `render()`.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import ts from 'typescript'
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

function PickPill({ id, onPick }: { id: string; onPick: (id: string) => void }) {
  return <><button type="button" className="own" onClick={() => onPick(id)}>{id}</button></>
}

function PickPillProps(props: { id: string; onPick: (id: string) => void }) {
  return <><button type="button" className="own" onClick={() => props.onPick(props.id)}>{props.id}</button></>
}

function Group({ title, children }: { title: string; children?: any }) {
  return <><h4 className="group">{title}</h4>{children}</>
}

const NESTED = [{ id: 'a' }, { id: 'b' }]
const ROWS = [{ id: 'r1', subs: [{ id: 'm' }] }, { id: 'r2', subs: [{ id: 'n' }] }]
const GROUPS = [
  { id: 'g1', items: [{ id: 'x' }, { id: 'y' }] },
  { id: 'g2', items: [{ id: 'z' }] },
]

export function StaticFragRows() {
  const [picked, setPicked] = createSignal('none')
  return (
    <>
      <div>
        <p className="picked">{picked()}</p>
        <div className="nested">
          {NESTED.map((o) => (
            <Chip key={o.id}>
              <Chip>
                <button type="button" className="pick" onClick={() => setPicked(\`n-\${o.id}\`)}>{o.id}</button>
              </Chip>
            </Chip>
          ))}
        </div>
        <div className="own">
          {NESTED.map((o) => (
            <PickPill key={o.id} id={o.id} onPick={(id) => setPicked(\`o-\${id}\`)} />
          ))}
        </div>
        <div className="own-props">
          {NESTED.map((o) => (
            <PickPillProps key={o.id} id={o.id} onPick={(id) => setPicked(\`p-\${id}\`)} />
          ))}
        </div>
        <div className="grouped">
          {GROUPS.map((g) => (
            <Group key={g.id} title={g.id}>
              {g.items.map((it) => (
                <PickPill key={it.id} id={it.id} onPick={(id) => setPicked(\`g-\${id}\`)} />
              ))}
            </Group>
          ))}
        </div>
        <div className="rows">
          {ROWS.map((r) => (
            <div key={r.id} className="row">
              <PickPill id={r.id} onPick={(id) => setPicked(\`r-\${id}\`)} />
            </div>
          ))}
        </div>
        <div className="inner">
          {ROWS.map((r) => (
            <div key={r.id} className="row">
              <ul>
                {r.subs.map((s) => (
                  <li key={s.id}>
                    <PickPillProps id={s.id} onPick={(id) => setPicked(\`i-\${id}\`)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}`

/**
 * Point the compiled module's runtime import at the runtime source and drop
 * its side-effect child-marker imports, on the TypeScript AST.
 */
function relinkRuntime(clientJs: string): string {
  const sf = ts.createSourceFile('client.mjs', clientJs, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const transformer: ts.TransformerFactory<ts.SourceFile> = context => root => {
    const { factory } = context
    const statements: ts.Statement[] = []
    for (const stmt of root.statements) {
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const spec = stmt.moduleSpecifier.text
        if (!stmt.importClause) continue
        if (spec === '@barefootjs/client/runtime') {
          statements.push(factory.updateImportDeclaration(
            stmt, stmt.modifiers, stmt.importClause, factory.createStringLiteral(runtimePath), stmt.attributes,
          ))
          continue
        }
      }
      statements.push(stmt)
    }
    return factory.updateSourceFile(root, statements)
  }
  const out = ts.transform(sf, [transformer])
  return ts.createPrinter().printFile(out.transformed[0])
}

let loaded = false
async function loadClientJs(): Promise<void> {
  if (loaded) return
  const result = compileJSX(SOURCE, 'StaticFragRows.tsx', { adapter: new TestAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => `${e.code}: ${e.message}`).join('\n'))
  const clientJs = relinkRuntime(result.files.find(f => f.type === 'clientJs')!.content)
  const file = join(mkdtempSync(join(tmpdir(), 'bf-3821-')), 'StaticFragRows.mjs')
  writeFileSync(file, clientJs)
  await import(file)
  loaded = true
}

const picked = () => document.querySelector('.picked')?.textContent
const click = (selector: string) =>
  document.querySelector(selector)!.dispatchEvent(new window.Event('click', { bubbles: true }))

function exercise() {
  expect(picked()).toBe('none')
  // The reported shape: forwarded through a fragment-rooted nested child.
  click('.nested > .chip:nth-of-type(2) .pick')
  expect(picked()).toBe('n-b')
  click('.nested > .chip:nth-of-type(1) .pick')
  expect(picked()).toBe('n-a')
  // The row's own handler calling a callback prop, both props forms.
  click('.own > button:nth-of-type(2)')
  expect(picked()).toBe('o-b')
  click('.own-props > button:nth-of-type(1)')
  expect(picked()).toBe('p-a')
  // Fragment-rooted rows nested in a fragment-rooted group.
  click('.grouped > button:nth-of-type(2)')
  expect(picked()).toBe('g-y')
  click('.grouped > button:nth-of-type(3)')
  expect(picked()).toBe('g-z')
  // A fragment-rooted component inside a plain-element row / inner-loop row.
  click('.rows > .row:nth-of-type(2) button')
  expect(picked()).toBe('r-r2')
  click('.inner > .row:nth-of-type(2) button')
  expect(picked()).toBe('i-n')
}

describe('#3821 — fragment-rooted rows of a static array are initialised', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('SSR + hydration', { timeout: 30_000 }, async () => {
    await loadClientJs()
    document.body.innerHTML = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: SOURCE,
      props: { __instanceId: 'StaticFragRows_test' },
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
    render(container, 'StaticFragRows')
    exercise()
  })
})

describe('childScopesBySlot', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('finds element- and comment-scoped children of one slot in document order', async () => {
    const { childScopesBySlot, childScopeBySlot } = await import(runtimePath)
    const container = document.createElement('div')
    container.innerHTML = [
      '<span bf-s="Row_a" bf-h="Host_1" bf-m="s2">a</span>',
      '<!--bf-scope:Row_b|h=Host_1|m=s2|{"x":"|h=Other|m=s2"}--><i>b</i><!--bf-/scope:Row_b-->',
      // Another slot of the same host, and the same slot of another host.
      '<!--bf-scope:Row_c|h=Host_1|m=s3--><i>c</i><!--bf-/scope:Row_c-->',
      '<!--bf-scope:Row_d|h=Host_2|m=s2--><i>d</i><!--bf-/scope:Row_d-->',
      // A nested-slot id is never a row of this slot (#1220).
      '<!--bf-scope:Host_1_s4_s2|h=Host_1_s4|m=s2--><i>e</i><!--bf-/scope:Host_1_s4_s2-->',
      // A deeper child that only shares the slot number.
      '<!--bf-scope:Row_a_s2|h=Row_a|m=s2--><i>g</i><!--bf-/scope:Row_a_s2-->',
      // Suffix fallback for a scope with no host/slot markers.
      '<b bf-s="Host_1_s2">f</b>',
      '<!--bf-scope:Host_1_s2--><i>h</i><!--bf-/scope:Host_1_s2-->',
    ].join('')
    document.body.appendChild(container)
    const found = childScopesBySlot(container, 'Host_1', 's2') as Element[]
    expect(found.map(el => el.textContent)).toEqual(['a', 'b', 'f', 'h'])
    expect((childScopeBySlot(container, 'Host_1', 's3') as Element).textContent).toBe('c')
    expect(childScopeBySlot(container, 'Host_9', 's3')).toBeNull()
  })
})
