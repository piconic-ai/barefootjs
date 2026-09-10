/**
 * Regression test for #2910 (bug 2): a `const` built via a same-scope
 * loop mutation (`const config = {}; for (...) config[k] = ...`, the exact
 * shape `chart-container.ts`'s `applyChartCSSVariables` consumer hits) and
 * passed as a component prop must reach the child with its POST-mutation
 * value, not the stale pre-mutation literal its declaration captured.
 *
 * Root cause: `expandDynamicPropValue` (`ir-to-client-js/prop-handling.ts`)
 * inlined `ConstantInfo.value` — the declaration's initializer TEXT
 * (`"{}"`)  — wherever the bare `config` identifier was referenced as a
 * prop value, re-embedding a snapshot from BEFORE the mutating `for` loop
 * ran instead of a live reference to the binding. Fixed by flagging such
 * bindings `mutatedAfterDeclaration` (`analyzer.ts`'s `markMutatedConstants`)
 * and having every inlining consumer fall back to a live reference.
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
type SeriesConfig = Record<string, { color: string }>

function Swatch(props: { config: SeriesConfig }) {
  const handleMount = (el: HTMLElement) => {
    for (const [key, value] of Object.entries(props.config)) {
      el.style.setProperty('--color-' + key, value.color)
    }
  }
  return <div ref={handleMount} />
}

export function Host() {
  const config: SeriesConfig = {}
  const series = [{ key: 'a', color: 'red' }, { key: 'b', color: 'blue' }]
  for (const s of series) config[s.key] = { color: s.color }
  return <Swatch config={config} />
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

describe('#2910 — loop-mutated const reaches a child prop with its post-mutation value', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('the child applies BOTH CSS custom properties the loop populated', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-2910-config-'))
    const file = join(dir, 'Host.mjs')
    writeFileSync(file, clientJsFor(SOURCE, 'Host.tsx'))
    await import(file)

    const ssrHtml = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: SOURCE,
      props: { __instanceId: 'Host_test' },
    })

    document.body.innerHTML = ssrHtml

    const { rehydrateAll, flushHydration } = await import(runtimePath)
    rehydrateAll()
    flushHydration()

    const div = document.querySelector('div')!
    expect(div.style.getPropertyValue('--color-a')).toBe('red')
    expect(div.style.getPropertyValue('--color-b')).toBe('blue')
  }, 30000)
})
