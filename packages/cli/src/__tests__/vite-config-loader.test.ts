// Coverage for `lib/vite-config-loader.ts`: real `vite.config.ts` files,
// loaded through Vite's own `loadConfigFromFile` (never text-parsed) — see
// `packages/vite/src/__tests__/plugin.test.ts`'s `plugin.api` describe for
// the producer side of `BarefootPluginApi` this consumes.
//
// Fixtures are created UNDER `packages/cli/` (not the system tmpdir, unlike
// `config-loader.test.ts`'s `barefoot.config.ts` fixtures) because these
// configs `import { barefoot } from '@barefootjs/vite'` for real —
// resolving that bare specifier needs `packages/cli/node_modules`'s
// workspace symlinks, which only Node/esbuild's upward node_modules walk
// from a nested directory provides.
import { describe, test, expect, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { PLUGIN_NAME } from '@barefootjs/vite'
import { findViteConfig, loadViteBarefootConfig } from '../lib/vite-config-loader'

// `vite-config-loader.ts` duplicates `PLUGIN_NAME` as a literal instead of
// importing it, so that no `bf` command loads `@barefootjs/vite` at
// startup just to know a string (see that constant's docstring for why
// that mattered). This pins the duplicate: if the plugin ever renames
// itself, the loader silently stops finding it in the plugin array and
// every config-dependent command falls back to defaults — a failure with
// no error message. Catch it here instead.
describe('PLUGIN_NAME literal stays in sync with @barefootjs/vite', () => {
  test('the loader looks for the name the plugin actually registers', async () => {
    const src = await Bun.file(
      resolve(import.meta.dirname, '..', 'lib', 'vite-config-loader.ts'),
    ).text()
    expect(src).toContain(`const PLUGIN_NAME = '${PLUGIN_NAME}'`)
  })
})

const FIXTURE_ROOT = resolve(import.meta.dirname, '..', '..')

function makeFixtureDir(prefix: string): string {
  return mkdtempSync(resolve(FIXTURE_ROOT, `.tmp-${prefix}-`))
}

describe('findViteConfig', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('finds vite.config.ts in a directory', () => {
    dir = makeFixtureDir('find')
    writeFileSync(resolve(dir, 'vite.config.ts'), 'export default {}')
    expect(findViteConfig(dir)).toBe(resolve(dir, 'vite.config.ts'))
  })

  test('returns null when not found', () => {
    dir = makeFixtureDir('find-missing')
    expect(findViteConfig(dir)).toBeNull()
  })
})

describe('loadViteBarefootConfig', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('reads `components` off the barefoot plugin\'s plugin.api, via a real vite.config.ts + real barefoot()', async () => {
    dir = makeFixtureDir('vite-ok')
    const configPath = resolve(dir, 'vite.config.ts')
    writeFileSync(
      configPath,
      [
        `import { defineConfig } from 'vite'`,
        `import { barefoot } from '@barefootjs/vite'`,
        `import { testAdapter } from '@barefootjs/jsx'`,
        ``,
        `export default defineConfig({`,
        `  plugins: [barefoot({ adapter: testAdapter, components: ['components', '../shared/blog'], templates: 'views' })],`,
        `})`,
      ].join('\n'),
    )

    const config = await loadViteBarefootConfig(configPath)

    expect(config).not.toBeNull()
    expect(config!.root).toBe(dir)
    expect(config!.sourceDirs).toEqual(['components', '../shared/blog'])
  })

  test('finds the barefoot plugin through a nested plugin array (an adapter\'s /vite wrapper composition shape)', async () => {
    dir = makeFixtureDir('vite-nested')
    const configPath = resolve(dir, 'vite.config.ts')
    writeFileSync(
      configPath,
      [
        `import { defineConfig } from 'vite'`,
        `import { barefoot } from '@barefootjs/vite'`,
        `import { testAdapter } from '@barefootjs/jsx'`,
        ``,
        `const companion = { name: 'unrelated-companion' }`,
        `export default defineConfig({`,
        `  plugins: [[barefoot({ adapter: testAdapter, components: ['src'], templates: 'views' }), companion]],`,
        `})`,
      ].join('\n'),
    )

    const config = await loadViteBarefootConfig(configPath)
    expect(config?.sourceDirs).toEqual(['src'])
  })

  test('returns null when vite.config.ts has no barefoot plugin at all', async () => {
    dir = makeFixtureDir('vite-no-plugin')
    const configPath = resolve(dir, 'vite.config.ts')
    writeFileSync(configPath, `export default { plugins: [{ name: 'something-else' }] }`)

    const config = await loadViteBarefootConfig(configPath)
    expect(config).toBeNull()
  })

  test('throws a loud, actionable error when the config sets `root` to somewhere other than its own directory', async () => {
    dir = makeFixtureDir('vite-root-mismatch')
    const configPath = resolve(dir, 'vite.config.ts')
    writeFileSync(
      configPath,
      [
        `import { defineConfig } from 'vite'`,
        `import { barefoot } from '@barefootjs/vite'`,
        `import { testAdapter } from '@barefootjs/jsx'`,
        ``,
        `export default defineConfig({`,
        `  root: 'nested',`,
        `  plugins: [barefoot({ adapter: testAdapter, components: ['components'], templates: 'views' })],`,
        `})`,
      ].join('\n'),
    )

    await expect(loadViteBarefootConfig(configPath)).rejects.toThrow(/does not yet support/)
  })
})
