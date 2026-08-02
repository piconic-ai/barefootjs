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
    // Greeting.tsx has no 'use client' directive — never an entry.
    expect(keys.some(k => k.endsWith('Greeting.tsx'))).toBe(false)
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
})
