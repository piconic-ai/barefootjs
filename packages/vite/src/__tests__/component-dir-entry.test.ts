/**
 * `components` entries widened from `string[]` to `(string | ComponentDirEntry)[]`
 * (`types.ts`) — per-directory `cssLayerPrefix`/`skipDirs` riding on the
 * `components` entry itself instead of a 4th/5th top-level plugin option.
 * See `types.ts`'s docstring and `plugin.ts`'s `normalizeComponents`/
 * `entryForPath`/`isSkippedByEntry` for the mechanics these tests pin:
 *
 *   - a plain string entry stays exactly equivalent to `{ dir: string }`
 *   - `cssLayerPrefix` reaches compiled output (template AND, for a
 *     `'use client'` file, the hydration template embedded in client JS)
 *     only for files under the entry that set it
 *   - `skipDirs` excludes matching subdirectories from BOTH discovery (the
 *     eager pass) and the `transform`/watcher gate (the graph pass) — a
 *     half-fix on just one side is exactly what bit `site/ui`'s
 *     `PageNavigation.tsx` (imported by pages from a `shared/` dir)
 *   - precedence: a file reachable under more than one `components` entry
 *     takes the FIRST entry's options, matching `buildChildNameIndex`'s
 *     already-documented first-writer-wins rule
 */
import { describe, test, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { testAdapter } from '@barefootjs/jsx'
import { barefoot } from '../plugin.ts'

// biome-ignore lint: hooks are called directly, bypassing Vite's own
// dispatch/typing — casting to `any` is the standard way to unit-test a
// Vite plugin's hooks in isolation (same convention as `plugin.test.ts`).
type AnyPlugin = any

/** Drives `config` → `configResolved` → (fabricated empty manifest) →
 * `writeBundle`, the same minimal sequence `plugin.test.ts`'s writeBundle
 * describe block uses. */
async function driveBuild(plugin: AnyPlugin, dir: string): Promise<void> {
  await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
  await plugin.configResolved({ root: dir, base: '/', build: { outDir: 'dist', manifest: true } })
  await mkdir(join(dir, 'dist/.vite'), { recursive: true })
  await writeFile(join(dir, 'dist/.vite/manifest.json'), '{}')
  await plugin.writeBundle()
}

/** `config` → `configResolved` only — enough to exercise `transform`
 * without a real Vite build. */
async function driveConfig(plugin: AnyPlugin, dir: string): Promise<void> {
  await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
  await plugin.configResolved({ root: dir, base: '/', build: { outDir: 'dist', manifest: true } })
}

const ext = testAdapter.extension

describe('ComponentDirEntry: string entry ≡ { dir } entry', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('same discovery and byte-identical compiled template as a plain string entry', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-entry-string-eq-'))
    await mkdir(join(dir, 'a'), { recursive: true })
    await mkdir(join(dir, 'b'), { recursive: true })
    const source = 'export function Widget() { return <div className="bg-primary p-4">Hi</div> }'
    await writeFile(join(dir, 'a/Widget.tsx'), source)
    await writeFile(join(dir, 'b/Widget.tsx'), source)

    const templatesA = join(dir, 'views-a')
    const templatesB = join(dir, 'views-b')
    const pluginString = barefoot({ adapter: testAdapter, components: ['a'], templates: templatesA })
    const pluginObject = barefoot({ adapter: testAdapter, components: [{ dir: 'b' }], templates: templatesB })

    await driveBuild(pluginString, dir)
    await driveBuild(pluginObject, dir)

    const outString = await readFile(join(templatesA, `Widget${ext}`), 'utf8')
    const outObject = await readFile(join(templatesB, `Widget${ext}`), 'utf8')
    expect(outString).toBe(outObject)
    // Neither carries a cssLayerPrefix — the object form set none.
    expect(outString).not.toContain('layer-')
  })
})

describe('ComponentDirEntry: cssLayerPrefix', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('prefixes static classes in the compiled template only for the entry that set it', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-entry-css-layer-'))
    await mkdir(join(dir, 'lib'), { recursive: true })
    await mkdir(join(dir, 'app'), { recursive: true })
    await writeFile(join(dir, 'lib/Card.tsx'), 'export function Card() { return <div className="bg-primary p-4">Hi</div> }')
    await writeFile(join(dir, 'app/Panel.tsx'), 'export function Panel() { return <div className="bg-primary p-4">Hi</div> }')

    const templatesDir = join(dir, 'views')
    const plugin = barefoot({
      adapter: testAdapter,
      components: [
        { dir: 'lib', cssLayerPrefix: 'components' },
        'app',
      ],
      templates: templatesDir,
    })
    await driveBuild(plugin, dir)

    const libTpl = await readFile(join(templatesDir, `Card${ext}`), 'utf8')
    const appTpl = await readFile(join(templatesDir, `Panel${ext}`), 'utf8')

    expect(libTpl).toContain('layer-components:bg-primary')
    expect(libTpl).toContain('layer-components:p-4')
    expect(appTpl).not.toContain('layer-')
    expect(appTpl).toContain('bg-primary p-4')
  })

  test('reaches the hydration template embedded in compiled client JS too (the `transform` / graph-pass path)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-entry-css-layer-clientjs-'))
    await mkdir(join(dir, 'lib'), { recursive: true })
    const clientSource = [
      '\'use client\'',
      'import { createSignal } from \'@barefootjs/client\'',
      'export function Counter() {',
      '  const [count, setCount] = createSignal(0)',
      '  return <div className="bg-primary p-4"><button onClick={() => setCount(count() + 1)}>{count()}</button></div>',
      '}',
    ].join('\n')
    await writeFile(join(dir, 'lib/Counter.tsx'), clientSource)

    const plugin = barefoot({
      adapter: testAdapter,
      components: [{ dir: 'lib', cssLayerPrefix: 'components' }],
      templates: join(dir, 'views'),
    })
    await driveConfig(plugin, dir)

    const out = plugin.transform(clientSource, join(dir, 'lib/Counter.tsx'))
    expect(out).not.toBeNull()
    expect(out.code).toContain('layer-components:bg-primary')
    expect(out.code).toContain('layer-components:p-4')
  })
})

describe('ComponentDirEntry: skipDirs', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('excludes files under a matching subdirectory name from discovery (the eager pass)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-entry-skipdirs-discovery-'))
    await mkdir(join(dir, 'src/components/shared'), { recursive: true })
    await writeFile(join(dir, 'src/components/Page.tsx'), 'export function Page() { return <p>Hi</p> }')
    await writeFile(join(dir, 'src/components/shared/Helper.tsx'), 'export function Helper() { return <p>Hi</p> }')

    const templatesDir = join(dir, 'views')
    const plugin = barefoot({
      adapter: testAdapter,
      components: [{ dir: 'src/components', skipDirs: ['shared'] }],
      templates: templatesDir,
    })
    await driveBuild(plugin, dir)

    const emitted = await readdir(templatesDir)
    expect(emitted).toContain(`Page${ext}`)
    expect(emitted).not.toContain(`Helper${ext}`)
  })

  test('also gates the transform path — a file under a skipped subdir is not a component at all, even if directly imported', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-entry-skipdirs-transform-'))
    await mkdir(join(dir, 'src/components/shared'), { recursive: true })

    const clientTemplate = (name: string) => [
      '\'use client\'',
      'import { createSignal } from \'@barefootjs/client\'',
      `export function ${name}() {`,
      '  const [x, setX] = createSignal(0)',
      '  return <button onClick={() => setX(x() + 1)}>{x()}</button>',
      '}',
    ].join('\n')

    await writeFile(join(dir, 'src/components/Page.tsx'), clientTemplate('Page'))
    // Lives inside the skipped `shared/` dir but is still a normal relative
    // import target from a non-skipped sibling — the exact shape that used
    // to reach `transform` anyway (discovery skips it, but nothing gated
    // the graph pass) and got compiled despite being "skipped".
    await writeFile(join(dir, 'src/components/shared/PageNavigation.tsx'), clientTemplate('PageNavigation'))

    const plugin = barefoot({
      adapter: testAdapter,
      components: [{ dir: 'src/components', skipDirs: ['shared'] }],
      templates: join(dir, 'views'),
    })
    await driveConfig(plugin, dir)

    const pageOut = plugin.transform(clientTemplate('Page'), join(dir, 'src/components/Page.tsx'))
    expect(pageOut).not.toBeNull()

    const skippedOut = plugin.transform(
      clientTemplate('PageNavigation'),
      join(dir, 'src/components/shared/PageNavigation.tsx'),
    )
    expect(skippedOut).toBeNull()
  })
})

describe('ComponentDirEntry: precedence', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('a file reachable under two entries (an outer dir and a nested dir both configured) takes the FIRST entry\'s cssLayerPrefix', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-entry-precedence-'))
    await mkdir(join(dir, 'src/nested'), { recursive: true })
    await writeFile(join(dir, 'src/nested/Card.tsx'), 'export function Card() { return <div className="bg-primary">Hi</div> }')

    const templatesDir = join(dir, 'views')
    const plugin = barefoot({
      adapter: testAdapter,
      components: [
        { dir: 'src', cssLayerPrefix: 'outer' },
        { dir: 'src/nested', cssLayerPrefix: 'inner' },
      ],
      templates: templatesDir,
    })
    await driveBuild(plugin, dir)

    // Emitted at `nested/Card...` — `planEmits` mirrors the file's position
    // under whichever `componentDirs` entry contains it, and since `src`
    // (the FIRST entry) also matches, that's `src`'s own relative position
    // (`nested/Card.tsx`), not `src/nested`'s.
    const tpl = await readFile(join(templatesDir, 'nested', `Card${ext}`), 'utf8')
    expect(tpl).toContain('layer-outer:bg-primary')
    expect(tpl).not.toContain('layer-inner:')
  })
})
