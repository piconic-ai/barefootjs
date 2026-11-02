/**
 * Hydration of the rest-binding fixes (#3851, #3854), end to end: real
 * compiler, real Hono SSR, the generated client JS run in Happy DOM.
 *
 * - An attribute written before a closed `{...rest}` spread
 *   (`<p title="fixed" {...rest}>`) is kept when the caller omits the key.
 *   SSR renders `title="fixed"`; the client binding must read the same
 *   fallback (`_p.title ?? "fixed"`), not a bare `_p.title` that removes the
 *   attribute at hydration, and must stay reactive when the caller later
 *   passes and then drops `title`.
 * - A props-object body rest read or spread inside a callback whose
 *   parameter shadows the props object's name is refused on both the client
 *   and the SSR compile, instead of reading the row.
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

async function setup(
  modules: Array<[source: string, name: string]>,
  root: string,
  components: Record<string, string>,
  props: Record<string, unknown>,
): Promise<() => void> {
  const dir = mkdtempSync(join(tmpdir(), 'bf-rest-fallback-'))
  for (const [source, name] of modules) {
    const file = join(dir, `${name}.mjs`)
    writeFileSync(file, clientJsFor(source, `${name}.tsx`))
    await import(file)
  }
  document.body.innerHTML = await renderHonoComponent({ adapter: new HonoAdapter(), source: root, components, props })
  const { rehydrateAll, flushHydration } = await import(runtimePath)
  return () => {
    rehydrateAll()
    flushHydration()
  }
}

const REST_TITLE = `'use client'
export function RestTitle({ label, ...rest }: { label: string; title?: string }) {
  return <p data-slot="rest-title" title="fixed" {...rest}>{label}</p>
}`

const BODY_REST_TITLE = `'use client'
export function BodyRestTitle(props: { label: string; title?: string }) {
  const { label, ...rest } = props
  return <p data-slot="body-rest-title" title="fixed" {...rest}>{label}</p>
}`

const TITLE_PARENT = `'use client'
import { createSignal } from '@barefootjs/client'
import { RestTitle } from './RestTitle'
import { BodyRestTitle } from './BodyRestTitle'
export function TitleParent() {
  const [title, setTitle] = createSignal<string | undefined>(undefined)
  return (
    <div>
      <RestTitle label="L" title={title()} />
      <BodyRestTitle label="L" title={title()} />
      <button onClick={() => setTitle(t => (t === undefined ? 'x' : undefined))}>toggle</button>
    </div>
  )
}`

describe('an attribute before a closed rest spread, hydrated (#3851)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test.each(['rest-title', 'body-rest-title'])('%s: hydration keeps the fallback, and it tracks the caller', async (slot) => {
    const hydrate = await setup(
      [[REST_TITLE, 'RestTitle'], [BODY_REST_TITLE, 'BodyRestTitle'], [TITLE_PARENT, 'TitleParent']],
      TITLE_PARENT,
      { './RestTitle.tsx': REST_TITLE, './BodyRestTitle.tsx': BODY_REST_TITLE },
      { __instanceId: 'TitleParent_test' },
    )
    const p = document.querySelector(`[data-slot="${slot}"]`)!
    expect(p.getAttribute('title')).toBe('fixed')

    hydrate()
    expect(p.getAttribute('title')).toBe('fixed')

    const button = document.querySelector('button')!
    button.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(p.getAttribute('title')).toBe('x')

    button.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(p.getAttribute('title')).toBe('fixed')
  })
})

const SHADOWED_PROPS_READ = `'use client'
export function ShadowedPropsRead(props: { id?: string; rows: { id: string }[] }) {
  const { rows, ...rest } = props
  return <ul>{rows.map(props => <li key={props.id} data-row={props.id}>{rest.id}</li>)}</ul>
}`

const SHADOWED_PROPS_SPREAD = `'use client'
export function ShadowedPropsSpread(props: { id?: string; rows: { id: string }[] }) {
  const { rows, ...rest } = props
  return <ul>{rows.map(props => <li key={props.id} {...rest}>{props.id}</li>)}</ul>
}`

describe('a body rest used inside a callback that shadows the props name (#3854)', () => {
  // The read would be respelled `props.id`, which there names the row; no
  // spelling reaches the component's prop on every backend, so the SSR and
  // the client compile both refuse it instead of reading the row.
  test.each([
    ['a member read', SHADOWED_PROPS_READ],
    ['a spread', SHADOWED_PROPS_SPREAD],
  ])('%s is refused (BF101) on the client and the Hono SSR compile', (_name, source) => {
    for (const a of [adapter, new HonoAdapter()]) {
      const codes = compileJSX(source, 'Shadowed.tsx', { adapter: a }).errors.filter(e => e.severity === 'error').map(e => e.code)
      expect(codes).toEqual(['BF101'])
    }
  })
})
