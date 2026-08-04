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
import { barefoot, PLUGIN_NAME } from '../plugin.ts'
import type { BarefootPluginApi, BarefootViteOptions } from '../types.ts'

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

describe('plugin.api', () => {
  // Reconnaissance PR (bf#future-07a): `bf`'s CLI reads this to derive
  // `sourceDirs` from `vite.config.ts` without parsing it as text — see
  // `packages/cli/src/context.ts` and `BarefootPluginApi`'s docstring.
  test('exposes the exact options object under plugin.name === PLUGIN_NAME, with no Vite lifecycle hook run first', () => {
    const options: BarefootViteOptions = {
      adapter: testAdapter,
      components: ['src/components', '../shared/blog'],
      templates: 'internal/views',
    }
    const plugin = barefoot(options) as AnyPlugin

    expect(plugin.name).toBe(PLUGIN_NAME)
    expect(PLUGIN_NAME).toBe('barefoot')
    const api = plugin.api as BarefootPluginApi
    expect(api.options).toBe(options)
    expect(api.options.components).toEqual(['src/components', '../shared/blog'])
  })

  test('the `templates` option omitted (CSR degenerate case) still surfaces via api.options', () => {
    const plugin = barefoot({ adapter: testAdapter, components: ['src'] }) as AnyPlugin
    expect((plugin.api as BarefootPluginApi).options.templates).toBeUndefined()
  })
})

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

  test('resolves a @bf-child: marker to the named child\'s real absolute path once discovered', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-resolveid-bfchild-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    await writeFile(join(dir, 'src/components/Parent.tsx'), '\'use client\'\nexport function Parent() { return <div/> }')
    await writeFile(join(dir, 'src/components/Child.tsx'), '\'use client\'\nexport function Child() { return <div/> }')

    const plugin = makePlugin('src/components', 'internal/views')
    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    await plugin.configResolved({ root: dir, base: '/', build: { outDir: 'dist', manifest: true } })

    const resolved = plugin.resolveId('/* @bf-child:Child */', join(dir, 'src/components/Parent.tsx'))
    expect(resolved).toBe(join(dir, 'src/components/Child.tsx'))
  })

  test('falls back to the shared no-op virtual module for an unresolvable @bf-child: name', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-resolveid-bfchild-unknown-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })

    const plugin = makePlugin('src/components', 'internal/views')
    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    await plugin.configResolved({ root: dir, base: '/', build: { outDir: 'dist', manifest: true } })

    const resolved = plugin.resolveId('/* @bf-child:Nonexistent */', join(dir, 'src/components/Parent.tsx'))
    expect(resolved).toEqual({ id: '\0barefoot-bf-child-noop', moduleSideEffects: false })

    // `load` serves that id as an empty module — Rollup's own tree-shaking
    // (moduleSideEffects: false) then elides the bare import entirely.
    expect(plugin.load('\0barefoot-bf-child-noop')).toBe('')
    expect(plugin.load('/some/other/module.tsx')).toBeNull()
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

  test('does not refuse (BF103) a sibling-imported child rendered inside a .map() loop — the eager pass always registers every template together (#gin-migration)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-writebundle-bf103-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    await writeFile(join(dir, 'src/components/Row.tsx'), '\'use client\'\nexport function Row(props: { label: string }) { return <li>{props.label}</li> }')
    await writeFile(
      join(dir, 'src/components/List.tsx'),
      [
        '\'use client\'',
        'import { createSignal } from \'@barefootjs/client\'',
        'import { Row } from \'./Row\'',
        'export function List() {',
        '  const [items] = createSignal([{ id: 1, label: \'a\' }])',
        '  return <ul>{items().map(item => <Row key={item.id} label={item.label} />)}</ul>',
        '}',
      ].join('\n'),
    )

    const templatesDir = join(dir, 'internal/views')
    const adapter = new GoTemplateAdapter({ packageName: 'main' })
    const plugin = makePlugin('src/components', 'internal/views', adapter)
    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    plugin.configResolved({ root: dir, base: '/', build: { outDir: 'dist', manifest: true } })
    await mkdir(join(dir, 'dist/.vite'), { recursive: true })
    await writeFile(join(dir, 'dist/.vite/manifest.json'), '{}')

    // Would throw `[barefoot] compile failed: ... BF103` without
    // `siblingTemplatesRegistered: true` on the compileJSX calls.
    await expect(plugin.writeBundle()).resolves.toBeUndefined()

    const listTpl = await readFile(join(templatesDir, `List${adapter.extension}`), 'utf8')
    expect(listTpl).toContain('{{template "Row"')
  })
})

describe('afterEmit', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('writeBundle calls afterEmit once with mode "build", per-file types, and resolved dir paths', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-aftertemit-build-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    await writeFile(
      join(dir, 'src/components/Counter.tsx'),
      '\'use client\'\nimport { createSignal } from \'@barefootjs/client\'\nexport function Counter() {\n  const [count, setCount] = createSignal(0)\n  return <button onClick={() => setCount(count() + 1)}>{count()}</button>\n}\n',
    )

    const templatesDir = join(dir, 'internal/views')
    const adapter = new GoTemplateAdapter({ packageName: 'main' })
    const calls: unknown[] = []
    const plugin = barefoot({
      adapter,
      components: ['src/components'],
      templates: templatesDir,
      afterEmit: async ctx => { calls.push(ctx) },
    })
    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    plugin.configResolved({
      root: dir,
      base: '/static/build/',
      build: { outDir: 'dist', manifest: true },
    })

    await mkdir(join(dir, 'dist/.vite'), { recursive: true })
    await writeFile(
      join(dir, 'dist/.vite/manifest.json'),
      JSON.stringify({
        'src/components/Counter.tsx': { file: 'assets/Counter-abc123.js', isEntry: true },
      }),
    )

    await plugin.writeBundle()

    expect(calls).toHaveLength(1)
    const ctx = calls[0] as {
      types: Map<string, string>
      projectDir: string
      templatesDir: string
      outDir: string
      mode: string
    }
    expect(ctx.mode).toBe('build')
    expect(ctx.projectDir).toBe(dir)
    expect(ctx.templatesDir).toBe(templatesDir)
    expect(ctx.outDir).toBe(join(dir, 'dist'))
    expect(ctx.types.size).toBe(1)
    const [[key, content]] = ctx.types
    expect(key).toBe(join(dir, 'src/components/Counter.tsx'))
    expect(content).toContain('CounterProps')
    // Never handed emitted client JS — narrow by construction, not just by
    // convention. `ctx` has no field that could carry it.
    expect(Object.keys(ctx).sort()).toEqual(['mode', 'outDir', 'projectDir', 'templatesDir', 'types'])
  })

  test('writeBundle does not call afterEmit when the option is omitted', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-aftertemit-omitted-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    await writeFile(join(dir, 'src/components/Greeting.tsx'), 'export function Greeting() { return <p>Hi</p> }')

    const plugin = makePlugin('src/components', join(dir, 'internal/views'), new GoTemplateAdapter({ packageName: 'main' }))
    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    plugin.configResolved({ root: dir, base: '/', build: { outDir: 'dist', manifest: true } })
    await mkdir(join(dir, 'dist/.vite'), { recursive: true })
    await writeFile(join(dir, 'dist/.vite/manifest.json'), '{}')

    // Would throw if the plugin unconditionally called a non-existent
    // afterEmit — this just needs to not blow up.
    await expect(plugin.writeBundle()).resolves.toBeUndefined()
  })
})
