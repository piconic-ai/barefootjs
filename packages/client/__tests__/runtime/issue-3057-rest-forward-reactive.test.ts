/**
 * Integration test for #3057: a child-component prop that reaches the
 * child's root only via a statically-expanded, closed-type `{...rest}`
 * spread must keep updating reactively — including from `undefined` (SSR
 * never renders the attribute at all) to a real value set later.
 *
 * Before the fix, `RestForwardTag`'s `{...rest}`-forwarded `tag` prop had
 * NO `createEffect` of its own: the compiler's per-key rest expansion
 * (`expandSpreadAttribute`) produces an attribute expression that reads the
 * destructured `rest` OBJECT (a one-time snapshot), which the Phase 2
 * string-level reactivity heuristics never recognize as a live prop read.
 * The only thing that could have applied a later `tag` update was the
 * PARENT-side generic child-prop mirror (`emitReactiveChildProps`), but its
 * `hasAttribute`-seeded gate (#3056) reads `false` forever once SSR renders
 * with no `tag` attribute, so it never writes either. Net effect: setting
 * `tag` after the first render silently did nothing.
 *
 * This test compiles the real components with the real compiler
 * (`compileJSX`), renders real SSR HTML via the Hono adapter, drops it into
 * the document, runs the generated `hydrate` walk, then clicks the button
 * and asserts the `tag` attribute actually appears on the child's root —
 * observable proof the forwarded prop is reactive end to end, not just that
 * the emitted source contains an effect.
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

// `variant` is destructured and consumed only internally (never forwarded);
// `tag` is NOT destructured, so it falls into `{...rest}` and reaches the
// root via the spread — the shape #3057 is about.
const REST_FORWARD_TAG = `'use client'
export function RestForwardTag({ variant = 'a', ...rest }: { variant?: 'a' | 'b'; tag?: string }) {
  const variantClasses: Record<'a' | 'b', string> = { a: 'cls-a', b: 'cls-b' }
  const cls = variantClasses[variant]
  return <span data-slot="rest-tag" className={cls} {...rest}>content</span>
}`

const PARENT_SOURCE = `'use client'
import { createSignal } from '@barefootjs/client'
import { RestForwardTag } from './RestForwardTag'
export function Parent() {
  const [tag, setTag] = createSignal<string | undefined>(undefined)
  return (
    <div>
      <RestForwardTag tag={tag()} />
      <button onClick={() => setTag(t => (t === undefined ? 'x' : undefined))}>toggle</button>
    </div>
  )
}`

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
  const dir = mkdtempSync(join(tmpdir(), 'bf-3057-'))
  const modules: Array<[string, string, string]> = [
    [REST_FORWARD_TAG, 'RestForwardTag.tsx', 'RestForwardTag'],
    [PARENT_SOURCE, 'Parent.tsx', 'Parent'],
  ]
  for (const [source, filename, name] of modules) {
    const file = join(dir, `${name}.mjs`)
    writeFileSync(file, clientJsFor(source, filename))
    await import(file)
  }

  // Real SSR HTML (Hono adapter) — `tag` starts `undefined`, so SSR renders
  // NO `tag` attribute on `RestForwardTag`'s root at all.
  const ssrHtml = await renderHonoComponent({
    adapter: new HonoAdapter(),
    source: PARENT_SOURCE,
    components: { './RestForwardTag.tsx': REST_FORWARD_TAG },
    props: { __instanceId: 'Parent_test' },
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

describe('#3057 — a {...rest}-forwarded prop that starts undefined updates reactively once set', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('SSR renders no `tag` attribute, then a click reactively applies it', async () => {
    const { hydrate } = await setupHydration()

    const root = document.querySelector('[data-slot="rest-tag"]')!
    // SSR-rendered starting state: no `tag` attribute at all (undefined).
    expect(root.hasAttribute('tag')).toBe(false)

    hydrate()

    const button = document.querySelector('button')!
    button.dispatchEvent(new window.Event('click', { bubbles: true }))

    expect(root.getAttribute('tag')).toBe('x')

    // Back to undefined, then set again — the attribute must be removed and
    // re-applied, not stuck after its first removal (the ratchet a live
    // `hasAttribute` gate would fall into).
    button.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(root.hasAttribute('tag')).toBe(false)

    button.dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(root.getAttribute('tag')).toBe('x')
  })
})
