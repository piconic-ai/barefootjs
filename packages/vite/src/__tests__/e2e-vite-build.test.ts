/**
 * Real end-to-end coverage: actually runs `vite build` (via Vite's Node
 * API — the same function the `vite` CLI binary itself calls) against the
 * small fixture project under `../../e2e-fixture`, then asserts BOTH
 * halves of the design:
 *
 *   - the client-asset half: Vite/Rollup produced hashed JS assets, and
 *     the shared `@barefootjs/client` runtime collapsed into ONE shared
 *     chunk imported by every entry (not duplicated per entry) — the
 *     exact behavior the spike (R1/R3) proved.
 *   - the template half: the emitted Go template for the `'use client'`
 *     component contains a `{{.Scripts.Register "…"}}` call pointing at
 *     the REAL, hashed, `base`-prefixed manifest URL, and the server-only
 *     component (never reachable from Rollup's module graph) still got a
 *     template, with no script registration at all.
 *
 * A plugin that only passes mocked unit tests hasn't been shown to work —
 * this is the test that shows it.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { build } from 'vite'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { GoTemplateAdapter } from '@barefootjs/go-template/adapter'
import { barefoot } from '../plugin.ts'

const FIXTURE_ROOT = resolve(import.meta.dirname, '../../e2e-fixture')

describe('e2e: vite build', () => {
  let outDir: string
  let templatesDir: string

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'barefoot-vite-dist-'))
    templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-vite-views-'))

    await build({
      configFile: false,
      root: FIXTURE_ROOT,
      base: '/static/build/',
      logLevel: 'warn',
      build: {
        outDir,
        emptyOutDir: true,
      },
      plugins: [
        barefoot({
          adapter: new GoTemplateAdapter({ packageName: 'main' }),
          components: ['src/components'],
          templates: templatesDir,
        }),
      ],
    })
  }, 60_000)

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true })
    await rm(templatesDir, { recursive: true, force: true })
  })

  test('emits a manifest with hashed entries for every "use client" component', async () => {
    const manifest = JSON.parse(await readFile(resolve(outDir, '.vite/manifest.json'), 'utf8'))
    const keys = Object.keys(manifest)
    expect(keys.some(k => k.endsWith('Counter.tsx'))).toBe(true)
    expect(keys.some(k => k.endsWith('SharedCounter.tsx'))).toBe(true)
    expect(keys.some(k => k.endsWith('counterState.tsx'))).toBe(true)
    // Greeting.tsx has no 'use client' directive AND no client descendant
    // anywhere — the anti-regression guard: an all-server file must never
    // become a spurious Rollup entry. See the `needsClientEntry` false case.
    expect(keys.some(k => k.endsWith('Greeting.tsx'))).toBe(false)
  })

  // #2767: ServerParent/ServerGrandparent carry NO 'use client' directive at
  // all — they're plain server components whose only reason to become
  // entries is that they transitively render `Counter`. See
  // `e2e-fixture/src/components/ServerParent.tsx` and
  // `ServerGrandparent.tsx`.
  test('a server component that renders a client descendant also becomes a Rollup entry, transitively', async () => {
    const manifest = JSON.parse(await readFile(resolve(outDir, '.vite/manifest.json'), 'utf8'))
    const keys = Object.keys(manifest)
    const serverParentKey = keys.find(k => k.endsWith('ServerParent.tsx'))
    const serverGrandparentKey = keys.find(k => k.endsWith('ServerGrandparent.tsx'))
    expect(serverParentKey).toBeDefined()
    expect(serverGrandparentKey).toBeDefined()

    const counterKey = keys.find(k => k.endsWith('Counter.tsx') && !k.includes('Shared'))!

    // Proof `@bf-child:` resolved through the fixed `buildChildNameIndex`
    // to the REAL entry-to-entry import, not the no-op module — mirrors the
    // LoopParent→LoopChild assertion below, one level deeper.
    expect(manifest[serverParentKey!].imports).toContain(counterKey)
    expect(manifest[serverGrandparentKey!].imports).toContain(serverParentKey)
  })

  test('the runtime collapses into one shared chunk imported by every client entry', async () => {
    const manifest = JSON.parse(await readFile(resolve(outDir, '.vite/manifest.json'), 'utf8'))
    const counterKey = Object.keys(manifest).find(k => k.endsWith('Counter.tsx') && !k.includes('Shared'))!
    const sharedCounterKey = Object.keys(manifest).find(k => k.endsWith('SharedCounter.tsx'))!

    const counterEntry = manifest[counterKey]
    const sharedCounterEntry = manifest[sharedCounterKey]
    expect(counterEntry.imports?.length).toBeGreaterThan(0)
    expect(sharedCounterEntry.imports?.length).toBeGreaterThan(0)

    // Both entries' shared-chunk import sets intersect on at least one
    // chunk (the runtime) — i.e. it's a SHARED chunk, not duplicated.
    const shared = (counterEntry.imports ?? []).filter((k: string) => (sharedCounterEntry.imports ?? []).includes(k))
    expect(shared.length).toBeGreaterThan(0)

    // That shared chunk is a real file on disk under outDir.
    for (const key of shared) {
      const file = manifest[key].file
      const content = await readFile(resolve(outDir, file), 'utf8')
      expect(content.length).toBeGreaterThan(0)
    }
  })

  test('SharedCounter\'s relative "./counterState.client.js" import resolved to the real counterState chunk (resolveId shim, R2)', async () => {
    const manifest = JSON.parse(await readFile(resolve(outDir, '.vite/manifest.json'), 'utf8'))
    const sharedCounterKey = Object.keys(manifest).find(k => k.endsWith('SharedCounter.tsx'))!
    const stateKey = Object.keys(manifest).find(k => k.endsWith('counterState.tsx'))!
    const sharedCounterEntry = manifest[sharedCounterKey]

    // counterState.tsx is itself a rollupOptions.input entry (it has 'use
    // client' too) AND is import-reachable from SharedCounter — Rollup
    // resolves both to the identical module id, so SharedCounter's
    // manifest row lists it directly as an entry-to-entry import.
    expect(sharedCounterEntry.imports).toContain(stateKey)
  })

  test('the built client JS is plain JS Vite/esbuild could bundle and minify without re-parsing JSX (R1)', async () => {
    const manifest = JSON.parse(await readFile(resolve(outDir, '.vite/manifest.json'), 'utf8'))
    const counterKey = Object.keys(manifest).find(k => k.endsWith('Counter.tsx') && !k.includes('Shared'))!
    const file = manifest[counterKey].file
    const content = await readFile(resolve(outDir, file), 'utf8')
    // Production build output is minified — identifiers like `hydrate` get
    // renamed, so assert on what survives minification instead: the
    // hydration template's literal markup (proof this went through as
    // plain JS, not raw JSX esbuild would have needed a JSX transform for)
    // and the total absence of the 'use client' directive / JSX attribute
    // syntax a live JSX expression would still carry.
    expect(content).toContain('<button bf="s1">')
    expect(content).not.toContain('use client')
    expect(content).not.toMatch(/onClick=\{/)
  })

  test('emits a Go template for the "use client" component with the real hashed, base-prefixed script URL', async () => {
    const manifest = JSON.parse(await readFile(resolve(outDir, '.vite/manifest.json'), 'utf8'))
    const counterKey = Object.keys(manifest).find(k => k.endsWith('Counter.tsx') && !k.includes('Shared'))!
    const expectedUrl = `/static/build/${manifest[counterKey].file}`

    const template = await readFile(resolve(templatesDir, 'Counter.tmpl'), 'utf8')
    expect(template).toContain(`{{.Scripts.Register "${expectedUrl}"}}`)
  })

  test('a sibling-imported child rendered inside a CSR .map() loop resolves to a REAL import, not the raw @bf-child: marker', async () => {
    const manifest = JSON.parse(await readFile(resolve(outDir, '.vite/manifest.json'), 'utf8'))
    const loopParentKey = Object.keys(manifest).find(k => k.endsWith('LoopParent.tsx'))!
    const loopChildKey = Object.keys(manifest).find(k => k.endsWith('LoopChild.tsx'))!

    // LoopChild is independently a Rollup entry (every 'use client' file is)
    // AND reachable from LoopParent's own compiled output — proof the
    // `@bf-child:LoopChild` marker resolved to LoopChild's real module
    // instead of the unresolvable literal string, and that Rollup wired an
    // entry-to-entry import rather than leaving it external.
    expect(manifest[loopParentKey].imports).toContain(loopChildKey)

    const parentContent = await readFile(resolve(outDir, manifest[loopParentKey].file), 'utf8')
    expect(parentContent).not.toContain('@bf-child')
    expect(parentContent).not.toContain('bf-child')
  })

  // #2767: each server component on the path to Counter owns the
  // `initChild(...)` call reaching the NEXT link in the chain, so each one
  // needs its OWN `Scripts.Register` — not just Counter's.
  test('server components that transitively render a client descendant get their own script registration', async () => {
    const manifest = JSON.parse(await readFile(resolve(outDir, '.vite/manifest.json'), 'utf8'))
    const serverParentKey = Object.keys(manifest).find(k => k.endsWith('ServerParent.tsx'))!
    const serverGrandparentKey = Object.keys(manifest).find(k => k.endsWith('ServerGrandparent.tsx'))!

    const serverParentTemplate = await readFile(resolve(templatesDir, 'ServerParent.tmpl'), 'utf8')
    const serverGrandparentTemplate = await readFile(resolve(templatesDir, 'ServerGrandparent.tmpl'), 'utf8')

    expect(serverParentTemplate).toContain(`{{.Scripts.Register "/static/build/${manifest[serverParentKey].file}"}}`)
    expect(serverGrandparentTemplate).toContain(
      `{{.Scripts.Register "/static/build/${manifest[serverGrandparentKey].file}"}}`,
    )
  })

  // Anti-regression guard, unchanged by #2767: a component with genuinely
  // no client descendant anywhere must stay OUT of the Rollup graph and
  // carry no script registration at all.
  test('emits a template for the server-only component (never in the Rollup graph) with NO script registration', async () => {
    const manifest = JSON.parse(await readFile(resolve(outDir, '.vite/manifest.json'), 'utf8'))
    expect(Object.keys(manifest).some(k => k.endsWith('Greeting.tsx'))).toBe(false)

    const template = await readFile(resolve(templatesDir, 'Greeting.tmpl'), 'utf8')
    expect(template).not.toContain('Scripts.Register')
    expect(template).toContain('Hello')
  })

  test('the templates dir mirrors every discovered component, client and server-only alike', async () => {
    const files = await readdir(templatesDir)
    expect(files).toContain('Counter.tmpl')
    expect(files).toContain('SharedCounter.tmpl')
    expect(files).toContain('Greeting.tmpl')
  })

  test('writes a combined manifest.json alongside the per-component templates, keyed by component name with markedTemplate + ssrDefaults (#2494 review)', async () => {
    const manifest = JSON.parse(await readFile(resolve(templatesDir, 'manifest.json'), 'utf8'))

    // Keyed by component name (GoTemplateAdapter isn't `templatesPerComponent`,
    // so no `components` sub-map is expected — see `component-manifest.ts`).
    // Counter's own `count` signal seeds a literal SSR default even with no
    // backing prop (`ssrDefaults` covers every signal needing an in-template
    // seed, not only optional-prop-derived ones); Greeting's required `name`
    // prop reference seeds a `{ propName, value: null }` row the same way.
    expect(manifest.Counter).toEqual({ markedTemplate: 'Counter.tmpl', ssrDefaults: { count: { value: 0 } } })
    expect(manifest.Greeting).toEqual({
      markedTemplate: 'Greeting.tmpl',
      ssrDefaults: { name: { propName: 'name', value: null } },
    })
    expect('components' in manifest.Counter).toBe(false)
    // The absent-key contract itself (no entry carries `ssrDefaults: {}`)
    // is covered precisely, on fabricated input, by
    // `component-manifest.test.ts` — this test's job is just proving the
    // combined file actually lands on disk from a REAL build.
  })

  test('a production build leaves no dev-reload sentinel behind (see e2e-vite-dev.test.ts for the dev-side write)', async () => {
    const sentinel = await readFile(resolve(templatesDir, '..', '.dev', 'build-id'), 'utf8').catch(() => null)
    expect(sentinel).toBeNull()
  })
})
