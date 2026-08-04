/**
 * Coverage of `@barefootjs/hono/vite`'s `barefoot()`:
 *
 * - one real `vite build()` end to end (mirrors `@barefootjs/go-template/
 *   vite`'s own `vite.test.ts` rigor — a plugin that only passes mocked
 *   unit tests hasn't been shown to work) against a checked-in fixture
 *   (not a system tmpdir) so `@barefootjs/client` resolves through the
 *   monorepo's real node_modules symlinks;
 * - the `assets` → generated `bf-assets.ts` behavior, exercised the same
 *   way (a real build, since it needs the real manifest Vite writes).
 *
 * Unlike Go, there is no `afterEmit`-driven combination step to test here
 * (see `vite.ts`'s module docstring) — Hono's SSR template is
 * self-contained per component, so `barefoot()` always returns a
 * single-element array unless `assets` is set.
 */
import { describe, test, expect } from 'bun:test'
import { build } from 'vite'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { barefoot, barefoot as defaultBarefoot } from '../vite.ts'

const FIXTURE_ROOT = resolve(import.meta.dirname, '../../e2e-fixture')

describe('@barefootjs/hono/vite: real vite build', () => {
  test('exports the same function as both named `barefoot` and default', () => {
    expect(defaultBarefoot).toBe(barefoot)
  })

  test('returns a single-element plugin array when `assets` is omitted', () => {
    const plugins = barefoot({ components: ['src/components'], templates: 'views' })
    expect(plugins).toHaveLength(1)
  })

  // Reconnaissance PR (bf#future-07a): core's `barefoot()` attaches
  // `api.options` (see `@barefootjs/vite`'s `BarefootPluginApi`) to the SAME
  // plugin object this wrapper returns unchanged as `plugins[0]` — this
  // pins that composition doesn't lose it, for either array shape (`assets`
  // omitted vs. present, which adds a SECOND, unrelated companion plugin).
  test('surfaces core\'s plugin.api.options unchanged on the returned plugin, with the HonoAdapter it constructed', () => {
    const plugins = barefoot({ components: ['src/components', '../shared/blog'], templates: 'views' }) as any[]
    const core = plugins[0]
    expect(core.name).toBe('barefoot')
    expect(core.api.options.components).toEqual(['src/components', '../shared/blog'])
    expect(core.api.options.templates).toBe('views')
    expect(core.api.options.adapter.constructor.name).toBe('HonoAdapter')
  })

  test('writes a self-contained SSR template with scriptAssets baked in, same as core alone would do', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'barefoot-hono-vite-dist-'))
    const templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-hono-vite-views-'))

    try {
      await build({
        configFile: false,
        root: FIXTURE_ROOT,
        base: '/static/build/',
        logLevel: 'warn',
        build: { outDir, emptyOutDir: true },
        plugins: barefoot({
          components: ['src/components'],
          templates: templatesDir,
        }),
      })

      const template = await readFile(join(templatesDir, 'Counter.tsx'), 'utf8')
      // The scriptAssets-driven codegen path (see hono-adapter.ts), not the
      // legacy `addScriptCollection` post-process shape.
      expect(template).toContain('registerComponentScripts(')
      expect(template).toContain("from '@barefootjs/hono/scripts'")
      // No separate runtime registration — the shared `@barefootjs/client`
      // chunk arrives as an ESM import the bundled entry already makes.
      expect(template).not.toContain('barefoot.js')
    } finally {
      await rm(outDir, { recursive: true, force: true })
      await rm(templatesDir, { recursive: true, force: true })
    }
  }, 60_000)

  test('`assets` resolves a non-component entry\'s manifest-hashed URL into a generated `Assets` TS map', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'barefoot-hono-vite-dist-assets-'))
    const templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-hono-vite-views-assets-'))
    const assetsPath = join(FIXTURE_ROOT, 'dist/bf-assets.ts')

    try {
      await build({
        configFile: false,
        root: FIXTURE_ROOT,
        base: '/static/build/',
        logLevel: 'warn',
        build: {
          outDir,
          emptyOutDir: true,
          // Registering the non-component entry is the CALLER's job (stock
          // Vite config) — `assets` below only resolves the URL Vite
          // already bundled it to, it doesn't request the bundling.
          rollupOptions: { input: { bootstrap: resolve(FIXTURE_ROOT, 'client/bootstrap.ts') } },
        },
        plugins: barefoot({
          components: ['src/components'],
          templates: templatesDir,
          assets: { Bootstrap: 'client/bootstrap.ts' },
        }),
      })

      const manifest = JSON.parse(await readFile(join(outDir, '.vite/manifest.json'), 'utf8'))
      const expectedUrl = `/static/build/${manifest['client/bootstrap.ts'].file}`

      const content = await readFile(assetsPath, 'utf8')
      expect(content).toContain('export const Assets: Record<string, string>')
      expect(content).toContain(`"Bootstrap": ${JSON.stringify(expectedUrl)}`)
    } finally {
      await rm(outDir, { recursive: true, force: true })
      await rm(templatesDir, { recursive: true, force: true })
      await rm(join(FIXTURE_ROOT, 'dist'), { recursive: true, force: true })
    }
  }, 60_000)

  test('`assets` throws an actionable error when the entry was never registered as a Rollup input', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'barefoot-hono-vite-dist-assets-missing-'))
    const templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-hono-vite-views-assets-missing-'))

    try {
      await expect(
        build({
          configFile: false,
          root: FIXTURE_ROOT,
          base: '/static/build/',
          logLevel: 'silent',
          build: { outDir, emptyOutDir: true },
          plugins: barefoot({
            components: ['src/components'],
            templates: templatesDir,
            assets: { Bootstrap: 'client/bootstrap.ts' },
          }),
        }),
      ).rejects.toThrow(/was not found in the build manifest/)
    } finally {
      await rm(outDir, { recursive: true, force: true })
      await rm(templatesDir, { recursive: true, force: true })
      await rm(join(FIXTURE_ROOT, 'dist'), { recursive: true, force: true })
    }
  }, 60_000)
})
