// Coverage for `context.ts`'s config resolution: `findProjectConfig`'s
// vite.config.ts-first / barefoot.config.ts-fallback directory walk, and
// `createContext`'s end-to-end behavior against real fixtures of both
// kinds (plus the "vite.config.ts present but no barefoot plugin" and
// "neither file present" fallback paths this PR's blocker analysis called
// out).
//
// Fixtures that need `import { barefoot } from '@barefootjs/vite'` to
// resolve for real are created UNDER `packages/cli/` (see
// `vite-config-loader.test.ts`'s header for why: only a directory nested
// under `packages/cli/node_modules`'s workspace symlinks resolves the bare
// specifier).
import { describe, test, expect, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { createContext, findProjectConfig } from '../context'

const FIXTURE_ROOT = resolve(import.meta.dirname, '..', '..')

function makeFixtureDir(prefix: string): string {
  return mkdtempSync(resolve(FIXTURE_ROOT, `.tmp-${prefix}-`))
}

const VITE_CONFIG_WITH_BAREFOOT = [
  `import { defineConfig } from 'vite'`,
  `import { barefoot } from '@barefootjs/vite'`,
  `import { testAdapter } from '@barefootjs/jsx'`,
  ``,
  `export default defineConfig({`,
  `  plugins: [barefoot({ adapter: testAdapter, components: ['components'], templates: 'views' })],`,
  `})`,
].join('\n')

const BAREFOOT_CONFIG = [
  `export default {`,
  `  adapter: { name: 'test', extension: '.test' },`,
  `  components: ['legacy-components'],`,
  `}`,
].join('\n')

describe('findProjectConfig', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('prefers vite.config.ts over a sibling barefoot.config.ts in the same directory', () => {
    dir = makeFixtureDir('find-both')
    writeFileSync(resolve(dir, 'vite.config.ts'), VITE_CONFIG_WITH_BAREFOOT)
    writeFileSync(resolve(dir, 'barefoot.config.ts'), BAREFOOT_CONFIG)

    const found = findProjectConfig(dir)
    expect(found?.configKind).toBe('vite')
    expect(found?.configPath).toBe(resolve(dir, 'vite.config.ts'))
  })

  test('finds barefoot.config.ts when vite.config.ts does not exist', () => {
    dir = makeFixtureDir('find-barefoot-only')
    writeFileSync(resolve(dir, 'barefoot.config.ts'), BAREFOOT_CONFIG)

    const found = findProjectConfig(dir)
    expect(found?.configKind).toBe('barefoot')
    expect(found?.configPath).toBe(resolve(dir, 'barefoot.config.ts'))
  })

  test('walks up to a parent directory that has a config', () => {
    dir = makeFixtureDir('find-walk-up')
    writeFileSync(resolve(dir, 'vite.config.ts'), VITE_CONFIG_WITH_BAREFOOT)
    const nested = resolve(dir, 'a/b/c')
    mkdirSync(nested, { recursive: true })

    const found = findProjectConfig(nested)
    expect(found?.dir).toBe(dir)
  })

  test('returns null all the way to the filesystem root when nothing is found', () => {
    dir = makeFixtureDir('find-none')
    // No config file written at all.
    expect(findProjectConfig(dir)?.dir).not.toBe(dir)
  })
})

describe('createContext: resolution order', () => {
  let dir: string
  let originalCwd: string

  afterEach(() => {
    process.chdir(originalCwd)
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('vite.config.ts present: sourceDirs comes from the barefoot plugin\'s plugin.api, paths default (no `paths` option exists on the Vite side)', async () => {
    dir = makeFixtureDir('ctx-vite')
    writeFileSync(resolve(dir, 'vite.config.ts'), VITE_CONFIG_WITH_BAREFOOT)

    originalCwd = process.cwd()
    process.chdir(dir)
    const ctx = await createContext(false)

    expect(ctx.projectDir).toBe(dir)
    expect(ctx.config?.sourceDirs).toEqual(['components'])
    expect(ctx.config?.paths.components).toBe('components/ui') // DEFAULT_PATHS, unchanged
  })

  test('barefoot.config.ts fallback: still works when only that file exists (7c has not deleted it yet)', async () => {
    dir = makeFixtureDir('ctx-barefoot-only')
    writeFileSync(resolve(dir, 'barefoot.config.ts'), BAREFOOT_CONFIG)

    originalCwd = process.cwd()
    process.chdir(dir)
    const ctx = await createContext(false)

    expect(ctx.projectDir).toBe(dir)
    expect(ctx.config?.sourceDirs).toEqual(['legacy-components'])
  })

  test('vite.config.ts present but with no barefoot plugin: falls through to a sibling barefoot.config.ts', async () => {
    dir = makeFixtureDir('ctx-vite-no-plugin-fallback')
    writeFileSync(resolve(dir, 'vite.config.ts'), `export default { plugins: [] }`)
    writeFileSync(resolve(dir, 'barefoot.config.ts'), BAREFOOT_CONFIG)

    originalCwd = process.cwd()
    process.chdir(dir)
    const ctx = await createContext(false)

    expect(ctx.config?.sourceDirs).toEqual(['legacy-components'])
  })

  test('vite.config.ts present, no barefoot plugin, and no sibling barefoot.config.ts: falls through to defaults, not an exception', async () => {
    dir = makeFixtureDir('ctx-vite-no-plugin-no-fallback')
    writeFileSync(resolve(dir, 'vite.config.ts'), `export default { plugins: [] }`)

    originalCwd = process.cwd()
    process.chdir(dir)
    const ctx = await createContext(false)

    expect(ctx.projectDir).toBe(dir)
    expect(ctx.config?.sourceDirs).toBeUndefined()
    expect(ctx.config?.paths.components).toBe('components/ui')
  })

  test('neither file present anywhere above cwd: monorepo fallback (config: null)', async () => {
    dir = makeFixtureDir('ctx-neither')

    originalCwd = process.cwd()
    process.chdir(dir)
    const ctx = await createContext(false)

    // Monorepo fallback only fires when NO ancestor directory has a config
    // file either — this fixture is nested under the real repo root
    // (`packages/cli/.tmp-...`), which itself sits under a monorepo with no
    // vite.config.ts/barefoot.config.ts at its own root, so this exercises
    // the real "walked all the way up, found nothing" path rather than a
    // contrived one.
    expect(ctx.config).toBeNull()
    expect(ctx.projectDir).toBeNull()
  })
})
