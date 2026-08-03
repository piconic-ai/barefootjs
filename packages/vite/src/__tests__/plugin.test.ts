/**
 * Unit tests calling the plugin's own hooks directly (no real Vite build —
 * see `e2e-vite-build.test.ts` for that). Each test targets one bullet
 * from the PR's testing requirements: config-hook output shape, the
 * resolveId mapping, transform returning compiled client JS, and the
 * writeBundle→manifest→scriptAssets resolution including the `[]`
 * server-only case.
 */
import { describe, test, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { testAdapter } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '@barefootjs/go-template/adapter'
import { barefoot } from '../plugin.ts'
import type { BarefootViteOptions } from '../types.ts'

// biome-ignore lint: hooks are called directly, bypassing Vite's own
// dispatch/typing — casting to `any` is the standard way to unit-test a
// Vite plugin's hooks in isolation.
type AnyPlugin = any

function makePlugin(
  componentsDir: string,
  templatesDir: string,
  adapter: BarefootViteOptions['adapter'] = testAdapter,
): AnyPlugin {
  return barefoot({
    adapter,
    components: [componentsDir],
    templates: templatesDir,
  })
}

describe('config hook', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('sets appType custom, forces build.manifest, and keys rollupOptions.input by ONLY "use client" files', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-config-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    await writeFile(join(dir, 'src/components/Counter.tsx'), '\'use client\'\nexport function Counter() { return <div/> }')
    await writeFile(join(dir, 'src/components/Greeting.tsx'), 'export function Greeting() { return <div/> }')

    const plugin = makePlugin('src/components', 'internal/views')
    const result = await plugin.config({ root: dir }, { command: 'build', mode: 'production' })

    expect(result.appType).toBe('custom')
    expect(result.build.manifest).toBe(true)
    const inputPaths = Object.values(result.build.rollupOptions.input) as string[]
    expect(inputPaths).toEqual([resolve(dir, 'src/components/Counter.tsx')])
  })

  test('produces no entries when nothing under components has "use client"', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-config-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    await writeFile(join(dir, 'src/components/Greeting.tsx'), 'export function Greeting() { return <div/> }')

    const plugin = makePlugin('src/components', 'internal/views')
    const result = await plugin.config({ root: dir }, { command: 'build', mode: 'production' })

    expect(Object.keys(result.build.rollupOptions.input)).toEqual([])
  })

  test('fills in a localhost-only server.cors default when the user set none', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-config-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })

    const plugin = makePlugin('src/components', 'internal/views')
    const result = await plugin.config({ root: dir }, { command: 'serve', mode: 'development' })

    expect(result.server.cors).toBeDefined()
    expect(result.server.cors.origin.test('http://localhost:3010')).toBe(true)
    expect(result.server.cors.origin.test('https://evil.example.com')).toBe(false)
  })

  test('does NOT overwrite a user-supplied server.cors', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-config-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })

    const plugin = makePlugin('src/components', 'internal/views')
    const userCors = { origin: 'https://my-own-cors-policy.example.com' }
    const result = await plugin.config(
      { root: dir, server: { cors: userCors } },
      { command: 'serve', mode: 'development' },
    )

    // The plugin's `server` return has no `cors` key at all in this case —
    // Vite's config merge leaves the user's `server.cors` untouched only if
    // we don't hand it a competing value to merge in.
    expect(result.server.cors).toBeUndefined()
  })

  test('does NOT override an explicit server.cors: false (a falsy-but-set value)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-config-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })

    const plugin = makePlugin('src/components', 'internal/views')
    const result = await plugin.config(
      { root: dir, server: { cors: false } },
      { command: 'serve', mode: 'development' },
    )

    // `server.cors = false` explicitly DISABLES cors — `!false` is `true`,
    // so a naive `if (!userConfig.server?.cors)` check would wrongly treat
    // this the same as "unset" and clobber it with the localhost default.
    // The fix checks `=== undefined` specifically; this pins that.
    expect(result.server.cors).toBeUndefined()
  })
})

describe('resolveId hook', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('resolves the compiler\'s ./foo.client.js specifier back to ./foo.tsx', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-resolveid-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    await writeFile(join(dir, 'src/components/signals.tsx'), '\'use client\'\nexport const x = 1')

    const plugin = makePlugin('src/components', 'internal/views')
    const importer = join(dir, 'src/components/consumer.tsx')
    const resolved = plugin.resolveId('./signals.client.js', importer)

    expect(resolved).toBe(join(dir, 'src/components/signals.tsx'))
  })

  test('leaves a bare/alias specifier untouched (returns null)', () => {
    const plugin = makePlugin('src/components', 'internal/views')
    expect(plugin.resolveId('@/components/signals.client.js', '/a/consumer.tsx')).toBeNull()
  })
})

describe('transform hook', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  async function setup() {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-transform-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    const plugin = makePlugin('src/components', 'internal/views')
    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    plugin.configResolved({
      root: dir,
      base: '/',
      build: { outDir: 'dist', manifest: true },
    })
    return plugin
  }

  test('returns compiled client JS (not raw JSX) for a "use client" .tsx under components', async () => {
    const plugin = await setup()
    const source = '\'use client\'\nimport { createSignal } from \'@barefootjs/client\'\nexport function Counter() {\n  const [count, setCount] = createSignal(0)\n  return <button onClick={() => setCount(count() + 1)}>{count()}</button>\n}\n'
    const id = join(dir, 'src/components/Counter.tsx')

    const out = plugin.transform(source, id)

    expect(out).not.toBeNull()
    expect(out.code).toContain('createSignal')
    expect(out.code).not.toContain('use client')
    // The compiled output is plain JS: any JSX syntax that remains only
    // does so as a quoted string inside the hydration template literal
    // (`template: (_p) => \`<button ...>\``), never as a live JSX
    // expression the browser would need a JSX transform to parse.
    expect(out.code).toContain('hydrate(')
    expect(out.code).toMatch(/template:\s*\(_p\) => `<button/)
  })

  test('returns null for a .tsx file outside the configured components dirs', async () => {
    const plugin = await setup()
    const out = plugin.transform('export function X() { return <div/> }', join(dir, 'Outside.tsx'))
    expect(out).toBeNull()
  })

  test('returns null for a non-.tsx file', async () => {
    const plugin = await setup()
    const out = plugin.transform('export const x = 1', join(dir, 'src/components/util.ts'))
    expect(out).toBeNull()
  })
})

describe('writeBundle: manifest → scriptAssets resolution', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('bakes the manifest-resolved URL into the template for a "use client" component, and emits no script registration for a server-only one', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-writebundle-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    await writeFile(
      join(dir, 'src/components/Counter.tsx'),
      '\'use client\'\nimport { createSignal } from \'@barefootjs/client\'\nexport function Counter() {\n  const [count, setCount] = createSignal(0)\n  return <button onClick={() => setCount(count() + 1)}>{count()}</button>\n}\n',
    )
    await writeFile(
      join(dir, 'src/components/Greeting.tsx'),
      'export function Greeting() { return <p>Hi</p> }',
    )

    const templatesDir = join(dir, 'internal/views')
    // GoTemplateAdapter, not testAdapter: script registration ({{.Scripts
    // .Register "..."}}}) is exactly the surface this test asserts on, and
    // testAdapter (used elsewhere in this file for cheap transform/resolveId
    // coverage) doesn't implement `scriptAssets` at all — see PR1's
    // changeset, which wires scriptAssets into every DSL-template adapter
    // but not the CSR-oriented test adapter.
    const adapter = new GoTemplateAdapter({ packageName: 'main' })
    const plugin = makePlugin('src/components', 'internal/views', adapter)
    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    plugin.configResolved({
      root: dir,
      base: '/static/build/',
      build: { outDir: 'dist', manifest: true },
    })

    // Fabricate the manifest Vite would have written by the time
    // `writeBundle` fires — this test targets scriptAssets resolution in
    // isolation, without paying for a real Vite build (see
    // e2e-vite-build.test.ts for that).
    await mkdir(join(dir, 'dist/.vite'), { recursive: true })
    await writeFile(
      join(dir, 'dist/.vite/manifest.json'),
      JSON.stringify({
        'src/components/Counter.tsx': { file: 'assets/Counter-abc123.js', isEntry: true },
      }),
    )

    await plugin.writeBundle()

    const counterTpl = await readFile(join(templatesDir, `Counter${adapter.extension}`), 'utf8')
    const greetingTpl = await readFile(join(templatesDir, `Greeting${adapter.extension}`), 'utf8')

    expect(counterTpl).toContain('{{.Scripts.Register "/static/build/assets/Counter-abc123.js"}}')
    // Server-only: never in the manifest → scriptAssets resolves to [] →
    // no script registration text at all.
    expect(greetingTpl).not.toContain('Scripts.Register')
    expect(greetingTpl).toContain('Hi')
  })
})
