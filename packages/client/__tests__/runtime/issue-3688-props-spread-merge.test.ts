/**
 * Integration test for #3688: a `{...props}` spread onto a child component
 * merges with the call's explicit props in source order, as JS does — a
 * later explicit prop overrides the spread, and the spread overrides an
 * earlier explicit prop for the keys the caller passed.
 *
 * Before the fix the client dropped the spread from the child's
 * `renderChild(...)` props in the registration template (a CSR mount lost
 * every spread key), and `initChild`'s `forwardProps(...)` let every
 * explicit prop win, so an explicit prop written BEFORE the spread
 * overwrote the caller's value once the child's effects ran.
 *
 * Compiles the real components (`compileJSX`), then checks both client
 * paths against the Hono reference: a pure `createComponent` mount, and
 * hydration of Hono's SSR HTML.
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

const TAG = `'use client'
export function Tag3688(props: { tone?: string; size?: string; label?: string }) {
  return <b data-tone={props.tone} data-size={props.size}>{props.label}</b>
}`

// Explicit props on both sides of the spread: `tone` / `size` come first
// (the spread overrides them when the caller passed the key), `label` comes
// last (it always wins).
const PARENT = `'use client'
import { Tag3688 } from './Tag3688'
export function Parent3688(props: { tone?: string; size?: string; label?: string }) {
  return <p><Tag3688 tone="first" size="s" {...props} label="last" /></p>
}`

const CALLER_PROPS = { tone: 'warm', label: 'hi' }

// The child takes the spread into a rest bag that lands on its root: the
// registration template leaves a `{...rest}` element spread to init's
// `applyRestAttrs`, so only a real mount shows the forwarded `title`.
const REST_TAG = `'use client'
export function RestTag3688({ label, ...rest }: { label?: string; [key: string]: any }) {
  return <b {...rest}>{label}</b>
}`

const REST_PARENT = `'use client'
import { RestTag3688 } from './RestTag3688'
export function RestParent3688(props: { label?: string; title?: string; own?: string }) {
  return <p><RestTag3688 {...props} /></p>
}`

// A reactive explicit prop written before the spread: the parent's signal
// drives `title` only while the caller did not pass one. Both the child's
// own text and the parent's mirror of `title` onto the child's root must
// follow the same merged value across updates.
const SIGNAL_TAG = `'use client'
export function SignalTag3688(props: { title?: string }) {
  return <b title={props.title}>{props.title}</b>
}`

const SIGNAL_PARENT = `'use client'
import { createSignal } from '@barefootjs/client'
import { SignalTag3688 } from './SignalTag3688'
export function SignalParent3688(props: { title?: string }) {
  const [title, setTitle] = createSignal('first')
  return <p><button onClick={() => setTitle('second')}>go</button><SignalTag3688 title={title()} {...props} /></p>
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
  const dir = mkdtempSync(join(tmpdir(), 'bf-3688-'))
  const modules = [[TAG, 'Tag3688'], [PARENT, 'Parent3688'], [REST_TAG, 'RestTag3688'], [REST_PARENT, 'RestParent3688'], [SIGNAL_TAG, 'SignalTag3688'], [SIGNAL_PARENT, 'SignalParent3688']] as const
  for (const [source, name] of modules) {
    const file = join(dir, `${name}.mjs`)
    writeFileSync(file, clientJsFor(source, `${name}.tsx`))
    await import(file)
  }
  loaded = true
}

function tagAttrs(root: ParentNode): { tone: string | null; size: string | null; label: string | null } {
  const b = root.querySelector('b')!
  return { tone: b.getAttribute('data-tone'), size: b.getAttribute('data-size'), label: b.textContent }
}

describe('#3688 — a {...props} spread onto a child merges with explicit props in source order', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('the Hono reference: the spread overrides the earlier `tone`, keeps `size`, and the later `label` wins', async () => {
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: PARENT,
      components: { './Tag3688.tsx': TAG },
      props: { ...CALLER_PROPS, __instanceId: 'Parent3688_test' },
    })
    document.body.innerHTML = html
    expect(tagAttrs(document.body)).toEqual({ tone: 'warm', size: 's', label: 'last' })
  })

  test('a createComponent mount renders and keeps the merged props', async () => {
    await loadComponents()
    const { createComponent } = await import(runtimePath)
    const el = createComponent('Parent3688', { ...CALLER_PROPS }) as Element
    document.body.appendChild(el)
    expect(tagAttrs(el)).toEqual({ tone: 'warm', size: 's', label: 'last' })
  })

  test('hydrating the SSR HTML keeps the merged props', async () => {
    await loadComponents()
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: PARENT,
      components: { './Tag3688.tsx': TAG },
      props: { ...CALLER_PROPS, __instanceId: 'Parent3688_test' },
    })
    document.body.innerHTML = html
    const { rehydrateAll, flushHydration } = await import(runtimePath)
    rehydrateAll()
    flushHydration()
    expect(tagAttrs(document.body)).toEqual({ tone: 'warm', size: 's', label: 'last' })
  })

  test("a createComponent mount forwards the spread into the child's rest bag", async () => {
    await loadComponents()
    const { createComponent } = await import(runtimePath)
    const el = createComponent('RestParent3688', { label: 'hi', title: 'T' }) as Element
    document.body.appendChild(el)
    const b = el.querySelector('b')!
    expect(b.getAttribute('title')).toBe('T')
    expect(b.hasAttribute('own')).toBe(false)
    expect(b.textContent).toBe('hi')
  })

  async function mountSignalParent(callerProps: Record<string, unknown>): Promise<HTMLElement> {
    await loadComponents()
    const { createComponent } = await import(runtimePath)
    const el = createComponent('SignalParent3688', callerProps) as HTMLElement
    document.body.appendChild(el)
    return el
  }

  function titleState(root: ParentNode): { attr: string | null; text: string | null } {
    const b = root.querySelector('b')!
    return { attr: b.getAttribute('title'), text: b.textContent }
  }

  test("a signal update to an explicit prop the spread overrides leaves the caller's value in place", async () => {
    const el = await mountSignalParent({ title: 'warm' })
    expect(titleState(el)).toEqual({ attr: 'warm', text: 'warm' })
    el.querySelector('button')!.click()
    expect(titleState(el)).toEqual({ attr: 'warm', text: 'warm' })
  })

  test('a signal update reaches the child when the caller did not pass the key', async () => {
    const el = await mountSignalParent({})
    expect(titleState(el)).toEqual({ attr: 'first', text: 'first' })
    el.querySelector('button')!.click()
    expect(titleState(el)).toEqual({ attr: 'second', text: 'second' })
  })
})
