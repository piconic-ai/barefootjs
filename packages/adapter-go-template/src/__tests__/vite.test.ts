/**
 * Coverage of `@barefootjs/go-template/vite`'s `barefoot()`:
 *
 * - one real `vite build()` end to end (mirrors `packages/vite`'s own
 *   `e2e-vite-build.test.ts` rigor — a plugin that only passes mocked unit
 *   tests hasn't been shown to work) against a checked-in fixture (not a
 *   system tmpdir) so `@barefootjs/client` resolves through the
 *   monorepo's real node_modules symlinks;
 * - the `afterEmit`-driven `components.go` combining behavior (empty
 *   `types`, write-if-changed) exercised by calling the returned plugin's
 *   own hooks directly, same style as `packages/vite`'s `plugin.test.ts` —
 *   `compileCanonical` never resolves `@barefootjs/client` as a real
 *   import (it's plain JSX→JS codegen, not a module load), so these don't
 *   need the fixture's real dependency graph at all.
 */
import { describe, test, expect, afterEach } from 'bun:test'
import { build } from 'vite'
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { barefoot, barefoot as defaultBarefoot } from '../vite.ts'

// biome-ignore lint: hooks are called directly, bypassing Vite's own
// dispatch/typing — the same cast `packages/vite/src/__tests__/
// plugin.test.ts` uses to unit-test a Vite plugin's hooks in isolation.
type AnyPlugin = any

const FIXTURE_ROOT = resolve(import.meta.dirname, '../../e2e-fixture')

describe('@barefootjs/go-template/vite: real vite build', () => {
  afterEach(async () => {
    await rm(join(FIXTURE_ROOT, 'components.go'), { force: true })
  })

  test('exports the same function as both named `barefoot` and default', () => {
    expect(defaultBarefoot).toBe(barefoot)
  })

  test('returns a single-element plugin array when `assets` is omitted', () => {
    const plugins = barefoot({ components: ['src/components'], templates: 'views' })
    expect(plugins).toHaveLength(1)
  })

  test('writes a compilable combined components.go after `vite build`, using the SAME combineGoTypes as ./build', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'barefoot-go-vite-dist-'))
    const templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-go-vite-views-'))

    try {
      await build({
        configFile: false,
        root: FIXTURE_ROOT,
        base: '/static/build/',
        logLevel: 'warn',
        build: { outDir, emptyOutDir: true },
        plugins: [
          barefoot({
            components: ['src/components'],
            templates: templatesDir,
            packageName: 'main',
            typesOutputFile: 'components.go',
          }),
        ],
      })

      // Template got its scriptAssets baked in, same as core alone would do.
      const template = await readFile(join(templatesDir, 'Counter.tmpl'), 'utf8')
      expect(template).toContain('Scripts.Register')

      // components.go exists, is combined (one package header, randomID
      // defined), and compiles-shaped (no per-component leftover headers).
      const componentsGo = await readFile(join(FIXTURE_ROOT, 'components.go'), 'utf8')
      expect(componentsGo).toContain('package main')
      expect(componentsGo).toContain('func randomID(n int) string {')
      expect(componentsGo).toContain('CounterProps')
      expect(componentsGo.match(/^package main$/gm)).toHaveLength(1)
    } finally {
      await rm(outDir, { recursive: true, force: true })
      await rm(templatesDir, { recursive: true, force: true })
    }
  }, 60_000)

  test('`assets` resolves a non-component entry\'s manifest-hashed URL into a generated Go asset map', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'barefoot-go-vite-dist-assets-'))
    const templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-go-vite-views-assets-'))
    const assetsGoPath = join(FIXTURE_ROOT, 'bf_assets.go')

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

      const content = await readFile(assetsGoPath, 'utf8')
      expect(content).toContain('package main')
      expect(content).toContain(`"Bootstrap": ${JSON.stringify(expectedUrl)}`)
    } finally {
      await rm(outDir, { recursive: true, force: true })
      await rm(templatesDir, { recursive: true, force: true })
      await rm(assetsGoPath, { force: true })
    }
  }, 60_000)

  test('`assets` throws an actionable error when the entry was never registered as a Rollup input', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'barefoot-go-vite-dist-assets-missing-'))
    const templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-go-vite-views-assets-missing-'))

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
      await rm(join(FIXTURE_ROOT, 'bf_assets.go'), { force: true })
    }
  }, 60_000)
})

describe('@barefootjs/go-template/vite: afterEmit → components.go, via direct hook calls', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  async function setup(): Promise<{ plugin: AnyPlugin; templatesDir: string; componentsGoPath: string }> {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-go-vite-hooks-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    await writeFile(
      join(dir, 'src/components/Counter.tsx'),
      '\'use client\'\nimport { createSignal } from \'@barefootjs/client\'\nexport function Counter(props: { initial: number }) {\n  const [count] = createSignal(props.initial)\n  return <button>{count()}</button>\n}\n',
    )

    const templatesDir = join(dir, 'internal/views')
    const plugin: AnyPlugin = barefoot({ components: ['src/components'], templates: templatesDir })[0]
    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    plugin.configResolved({ root: dir, base: '/static/build/', build: { outDir: 'dist', manifest: true } })

    await mkdir(join(dir, 'dist/.vite'), { recursive: true })
    await writeFile(
      join(dir, 'dist/.vite/manifest.json'),
      JSON.stringify({ 'src/components/Counter.tsx': { file: 'assets/Counter-abc123.js', isEntry: true } }),
    )

    return { plugin, templatesDir, componentsGoPath: join(dir, 'components.go') }
  }

  test('combines the discovered component\'s types into components.go', async () => {
    const { plugin, componentsGoPath } = await setup()
    await plugin.writeBundle()

    const content = await readFile(componentsGoPath, 'utf8')
    expect(content).toContain('package main')
    expect(content).toContain('CounterProps')
    expect(content).toContain('func randomID(n int) string {')
  })

  test('does not write components.go when no discovered component produces `types` (ctx.types.size === 0)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-go-vite-hooks-notypes-'))
    await mkdir(join(dir, 'src/components'), { recursive: true }) // deliberately empty

    const templatesDir = join(dir, 'internal/views')
    const plugin: AnyPlugin = barefoot({ components: ['src/components'], templates: templatesDir })[0]
    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    plugin.configResolved({ root: dir, base: '/', build: { outDir: 'dist', manifest: true } })
    await mkdir(join(dir, 'dist/.vite'), { recursive: true })
    await writeFile(join(dir, 'dist/.vite/manifest.json'), '{}')

    await plugin.writeBundle()

    await expect(readFile(join(dir, 'components.go'), 'utf8')).rejects.toThrow()
  })

  test('write-if-changed: a second pass with identical output does not rewrite components.go', async () => {
    const { plugin, componentsGoPath } = await setup()

    await plugin.writeBundle()
    const firstMtime = (await stat(componentsGoPath)).mtimeMs

    await new Promise(r => setTimeout(r, 20))
    await plugin.writeBundle()
    const secondMtime = (await stat(componentsGoPath)).mtimeMs

    expect(secondMtime).toBe(firstMtime)
  })

  test('honors manualTypes and transformTypes, same as ./build\'s createConfig', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-go-vite-hooks-manual-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    await writeFile(join(dir, 'src/components/Greeting.tsx'), 'export function Greeting() { return <p>Hi</p> }\n')

    const templatesDir = join(dir, 'internal/views')
    const plugin: AnyPlugin = barefoot({
      components: ['src/components'],
      templates: templatesDir,
      // manualTypes is appended verbatim, AFTER transformTypes runs on the
      // component-derived content (see `combineGoTypes`) — matching
      // `./build`'s `createConfig` exactly, so app-specific hand-written
      // types are never mangled by a transform meant for generated code.
      manualTypes: '// app-specific hand-written type\ntype AppOnly struct{}',
      transformTypes: types => types.replace(/GreetingProps/g, 'GreetingPropsRenamed'),
    })[0]
    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    plugin.configResolved({ root: dir, base: '/', build: { outDir: 'dist', manifest: true } })
    await mkdir(join(dir, 'dist/.vite'), { recursive: true })
    await writeFile(join(dir, 'dist/.vite/manifest.json'), '{}')

    await plugin.writeBundle()

    const content = await readFile(join(dir, 'components.go'), 'utf8')
    expect(content).toContain('type AppOnly struct{}')
    expect(content).toContain('GreetingPropsRenamed')
    expect(content).not.toMatch(/\btype GreetingProps struct/)
  })
})
