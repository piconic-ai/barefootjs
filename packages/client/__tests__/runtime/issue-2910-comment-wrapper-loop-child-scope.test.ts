/**
 * Regression test for #2910 (bug 1): a `.map()`-produced child component,
 * nested two component-levels below a comment-scoped wrapper (root is a
 * single child-component call, #2649 — the exact shape of
 * `<ChartContainer><LineChart>{series.map(s => <Line .../>)}</LineChart></ChartContainer>`),
 * never initialised on hydration. `series` is a MODULE-LEVEL const array
 * (not a prop) so the compiler takes the "static array child-init" plan
 * (`build-static-array-child-init.ts`) rather than the dynamic `mapArray`
 * plan — the plan the actual chart issue hits.
 *
 * Root cause: the wrapper's own `initHost` read `__scopeId` from
 * `__scope.getAttribute('bf-s')`. For a comment-scoped root, `__scope` is
 * the PROXY element rendered by the wrapper's single child (here,
 * `Container`'s own `<div>`), whose `bf-s` names ITS OWN scope — not the
 * wrapper's. So `[bf-h="${__scopeId}"]` searched for the wrong id and
 * found none of the `.map()`-produced `Row` children, leaving them
 * un-initialised (in the chart's case: `useContext` never resolves,
 * `registerBar` never runs, every line's `d` stays empty).
 *
 * Fixed by `ownScopeId(__scope)` (`packages/client/src/runtime/scope.ts`),
 * which reads the id the comment-scope registry recorded during hydration
 * instead of the proxy's own attribute.
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

const SOURCE = `'use client'
import { createContext, useContext } from '@barefootjs/client'

type RowInfo = { key: string; label: string }
const RowContext = createContext<{ register: (k: string) => void }>({ register: () => {} })
const items: RowInfo[] = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]

function Container(props: { children?: unknown }) {
  return (
    <RowContext.Provider value={{ register: (k) => document.body.setAttribute('data-registered-' + k, '1') }}>
      <div className="host">{props.children}</div>
    </RowContext.Provider>
  )
}

function Inner(props: { children?: unknown }) {
  return <div className="inner">{props.children}</div>
}

function Row(props: { item: RowInfo }) {
  const ctx = useContext(RowContext)
  const handleMount = (el: HTMLElement) => { ctx.register(props.item.key) }
  return <span ref={handleMount} data-key={props.item.key}>{props.item.label}</span>
}

export function Host() {
  return (
    <Container>
      <Inner>
        {items.map((item) => <Row key={item.key} item={item} />)}
      </Inner>
    </Container>
  )
}
`

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

describe('#2910 — .map()-produced child under a nested comment-scoped wrapper registers on hydration', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.removeAttribute('data-registered-a')
    document.body.removeAttribute('data-registered-b')
  })

  test('every mapped Row calls its context-provided callback after hydration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-2910-'))
    const file = join(dir, 'Host.mjs')
    writeFileSync(file, clientJsFor(SOURCE, 'Host.tsx'))
    await import(file)

    const ssrHtml = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: SOURCE,
      props: { __instanceId: 'Host_test' },
    })
    // Comment-scoped root (the shape under test): the wrapper carries no
    // element of its own, only the anchoring comment pair.
    expect(ssrHtml).toContain('<!--bf-scope:Host_test')
    // Both rows rendered with the WRAPPER's real scope id as their `bf-h`
    // ancestor stamp, not `Container`'s derived sub-scope.
    expect(ssrHtml).toContain('bf-h="Host_test"')

    document.body.innerHTML = ssrHtml

    const { rehydrateAll, flushHydration } = await import(runtimePath)
    rehydrateAll()
    flushHydration()

    expect(document.body.getAttribute('data-registered-a')).toBe('1')
    expect(document.body.getAttribute('data-registered-b')).toBe('1')
  }, 30000)
})
