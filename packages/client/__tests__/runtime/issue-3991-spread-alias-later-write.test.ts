/**
 * Integration test for #3991: an attribute written after an open spread
 * whose bag holds it under another key (`htmlFor` for `for`) wins over that
 * bag, and a spread written after the attribute wins over it, on the client
 * as on the Hono reference.
 *
 * Compiles the real components (`compileJSX`) and checks a pure
 * `createComponent` mount and hydration of Hono's SSR HTML against Hono,
 * including a caller update of the last spread's key.
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

// The literal sits between two bags: it overrides `a`'s `htmlFor`, and the
// rest's `htmlFor` overrides it.
const BETWEEN = `'use client'
type P = { a?: Record<string, string>; [key: string]: unknown }
export function Between3991({ a, ...rest }: P) {
  return <label {...a} htmlFor="explicit" {...rest}>x</label>
}`

// The literal follows the rest: it overrides the rest's `htmlFor`.
const AFTER = `'use client'
type P = { [key: string]: unknown }
export function After3991({ ...rest }: P) {
  return <label {...rest} htmlFor="explicit">x</label>
}`

// A caller that updates the key the last spread carries.
const PARENT = `'use client'
import { createSignal } from '@barefootjs/client'
import { Between3991 } from './Between3991'
const first = { htmlFor: 'first' }
export function Parent3991() {
  const [f, setF] = createSignal('last')
  return <p><button onClick={() => setF('later')}>go</button><Between3991 a={first} htmlFor={f()} /></p>
}`

// A caller that moves the last spread's key between a string and `null`.
const TOGGLE_PARENT = `'use client'
import { createSignal } from '@barefootjs/client'
import { Between3991 } from './Between3991'
const first = { htmlFor: 'first' }
export function ToggleParent3991() {
  const [f, setF] = createSignal<string | null>('last')
  return <p><button id="str" onClick={() => setF('later')}>s</button><button id="nul" onClick={() => setF(null)}>n</button><Between3991 a={first} htmlFor={f()} /></p>
}`

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

let loaded = false
async function loadComponents(): Promise<void> {
  if (loaded) return
  const dir = mkdtempSync(join(tmpdir(), 'bf-3991-'))
  for (const [source, name] of [[BETWEEN, 'Between3991'], [AFTER, 'After3991'], [PARENT, 'Parent3991'], [TOGGLE_PARENT, 'ToggleParent3991']] as const) {
    const file = join(dir, `${name}.mjs`)
    writeFileSync(file, clientJsFor(source, `${name}.tsx`))
    await import(file)
  }
  loaded = true
}

async function ssr(source: string, props: Record<string, unknown>, instanceId: string, components?: Record<string, string>): Promise<string> {
  return renderHonoComponent({ adapter: new HonoAdapter(), source, components, props: { ...props, __instanceId: instanceId } })
}

async function hydrateHtml(html: string): Promise<void> {
  await loadComponents()
  document.body.innerHTML = html
  const { rehydrateAll, flushHydration } = await import(runtimePath)
  rehydrateAll()
  flushHydration()
}

async function mount(name: string, props: Record<string, unknown>): Promise<Element> {
  await loadComponents()
  const { createComponent } = await import(runtimePath)
  const el = createComponent(name, props) as Element
  document.body.appendChild(el)
  return el
}

// A component whose root is the label mounts as that label.
const labelFor = (root: ParentNode): string | null =>
  (root instanceof Element && root.matches('label') ? root : root.querySelector('label')!).getAttribute('for')

describe('#3991 — a write after an open spread wins once over a bag key that aliases it', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  const betweenProps = { a: { htmlFor: 'first' }, htmlFor: 'last' }

  test('the Hono reference renders the last write', async () => {
    document.body.innerHTML = await ssr(BETWEEN, betweenProps, 'Between3991_test')
    expect(labelFor(document.body)).toBe('last')
    document.body.innerHTML = await ssr(AFTER, { htmlFor: 'bag' }, 'After3991_test')
    expect(labelFor(document.body)).toBe('explicit')
  })

  test('hydration keeps the server value', async () => {
    await hydrateHtml(await ssr(BETWEEN, betweenProps, 'Between3991_test'))
    expect(labelFor(document.body)).toBe('last')
    await hydrateHtml(await ssr(AFTER, { htmlFor: 'bag' }, 'After3991_test'))
    expect(labelFor(document.body)).toBe('explicit')
  })

  test('a createComponent mount renders the last write', async () => {
    expect(labelFor(await mount('Between3991', betweenProps))).toBe('last')
    document.body.innerHTML = ''
    expect(labelFor(await mount('After3991', { htmlFor: 'bag' }))).toBe('explicit')
  })

  test('the last spread keeps winning when the caller updates its key', async () => {
    const el = await mount('Parent3991', {})
    expect(labelFor(el)).toBe('last')
    el.querySelector('button')!.click()
    expect(labelFor(el)).toBe('later')
  })

  test('when the last spread lacks the key, the literal wins over the earlier bag everywhere', async () => {
    const props = { a: { htmlFor: 'first' } }
    document.body.innerHTML = await ssr(BETWEEN, props, 'Between3991_test')
    expect(labelFor(document.body)).toBe('explicit')
    await hydrateHtml(await ssr(BETWEEN, props, 'Between3991_test'))
    expect(labelFor(document.body)).toBe('explicit')
    document.body.innerHTML = ''
    expect(labelFor(await mount('Between3991', props))).toBe('explicit')
  })

  // What the client does when the last spread's key holds `null` (hydration
  // and mount remove the attribute, the reference keeps the literal) is a
  // pre-existing mismatch of the literal-before-open-spread guard and is not
  // asserted here: a test must not pin the defect as the contract.

  test('the last spread\'s key recovers every string update after it was null', async () => {
    const el = await mount('ToggleParent3991', {})
    const click = (id: string) => (el.querySelector(`#${id}`) as HTMLElement).click()
    expect(labelFor(el)).toBe('last')
    click('nul')
    click('str')
    expect(labelFor(el)).toBe('later')
    click('nul')
    click('str')
    expect(labelFor(el)).toBe('later')
  })

  test('after hydration, the last spread keeps winning when the caller updates its key', async () => {
    await hydrateHtml(await ssr(PARENT, {}, 'Parent3991_test', { './Between3991.tsx': BETWEEN }))
    expect(labelFor(document.body)).toBe('last')
    document.querySelector('button')!.click()
    expect(labelFor(document.body)).toBe('later')
  })
})
