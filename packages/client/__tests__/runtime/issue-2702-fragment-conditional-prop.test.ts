/**
 * Regression test for #2702: `isSingleElementJsxChildren`'s narrow gate
 * (`ir-to-client-js/collect-elements.ts`, #2651) only branded a LONE
 * `'element'` `jsx-children` prop value with `bfMarkup()`. A conditional
 * hoisted behind a fragment (`header={<>{cond() ? <a/> : <b/>}</>}`)
 * reached the `initChild` getter door UNbranded — SSR was correct, but the
 * child's own `escapeTextOrNode` reactive effect re-escaped the chosen
 * branch's HTML as literal text the moment it first ran, corrupting the
 * DOM at hydrate time. No shared JS-level conformance suite observes this:
 * SSR is genuinely correct, and CSR conformance's `createEffect` mock never
 * runs the reactive effect where the bug actually lives — this real-DOM
 * hydration test is the only layer that does.
 *
 * `jsxChildrenPropGetterExpr` (`html-template.ts`) now brands each
 * `'element'` LEAF after flattening fragments/conditionals, so the branded
 * value survives to `escapeTextOrNode`'s unwrap check regardless of which
 * branch is active — verified here through an actual hydrate + a signal
 * flip that swaps the active branch.
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

const CARD_SOURCE = `'use client'
export function Card(props: { header?: any; children?: any }) {
  return (
    <section>
      <header>{props.header}</header>
      <div>{props.children}</div>
    </section>
  )
}`

function reproSource(): string {
  return `'use client'
import { createSignal } from '@barefootjs/client'
import { Card } from './Card'
export function Repro() {
  const [cond, setCond] = createSignal(true)
  return (
    <div>
      <button onClick={() => setCond(c => !c)}>flip</button>
      <Card header={<>{cond() ? <a>x</a> : <b>y</b>}</>}>
        <p>body text</p>
      </Card>
    </div>
  )
}`
}

/** Compile a component's client JS with imports re-anchored to the live runtime. */
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

async function setupHydration(): Promise<{ hydrate: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'bf-2702-'))
  const modules: Array<[string, string, string]> = [
    [CARD_SOURCE, 'Card.tsx', 'Card'],
    [reproSource(), 'Repro.tsx', 'Repro'],
  ]
  for (const [source, filename, name] of modules) {
    const file = join(dir, `${name}.mjs`)
    writeFileSync(file, clientJsFor(source, filename))
    await import(file)
  }

  const ssrHtml = await renderHonoComponent({
    adapter: new HonoAdapter(),
    source: reproSource(),
    components: { './Card.tsx': CARD_SOURCE },
    props: { __instanceId: 'Repro_test' },
  })
  document.body.innerHTML = ssrHtml

  const { rehydrateAll, flushHydration } = await import(runtimePath)
  return {
    hydrate: () => {
      rehydrateAll()
      flushHydration()
    },
  }
}

describe('#2702 — a conditional-in-fragment jsx-children prop stays branded through hydration', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('the active branch renders as real HTML (not re-escaped text) after hydrate, and after flipping', async () => {
    const { hydrate } = await setupHydration()

    const headerBefore = document.querySelector('header') as HTMLElement
    expect(headerBefore.querySelector('a')).toBeTruthy()

    hydrate()

    const header = document.querySelector('header') as HTMLElement
    // Bug (pre-fix): innerHTML would contain the literal text
    // "&lt;a&gt;x&lt;/a&gt;" instead of a real <a> element.
    expect(header.querySelector('a')).toBeTruthy()
    expect(header.querySelector('a')!.textContent).toBe('x')
    expect(header.innerHTML).not.toContain('&lt;')

    document.querySelector('button')!.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(header.querySelector('b')).toBeTruthy()
    expect(header.querySelector('b')!.textContent).toBe('y')
    expect(header.innerHTML).not.toContain('&lt;')

    document.querySelector('button')!.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(header.querySelector('a')).toBeTruthy()
    expect(header.querySelector('a')!.textContent).toBe('x')
    expect(header.innerHTML).not.toContain('&lt;')
  })
})
