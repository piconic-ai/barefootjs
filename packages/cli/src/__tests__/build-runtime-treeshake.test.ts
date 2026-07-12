// Integration coverage for per-project runtime tree-shaking wired into the
// full `build()` pipeline: `runtimeBundle: 'treeshake'` (default) vs
// `'full'`, the unsafe-import fallback, `runtimeKeep`, and cache
// correctness across incremental rebuilds. Unit tests for the collector and
// the esbuild wrapper themselves live in `runtime-treeshake.test.ts`.

import { describe, test, expect } from 'bun:test'
import { mkdirSync, rmSync, realpathSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'
import { build } from '../lib/build'
import { loadCache } from '../lib/build-cache'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'

function makeTmpDir(label: string) {
  const dir = resolve(tmpdir(), `bf-test-rts-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return realpathSync(dir)
}

// The real, already-built dist (this monorepo's `packages/client` build
// output). Using the genuine runtime — instead of a hand-rolled fixture with
// a curated stub for each name — means these tests exercise the collector
// against the same client JS shape a real component compile produces
// (which imports plenty of compiler-injected helpers like `createComponent`,
// `hydrate`, `$`/`$t`, `escapeText` that no fixture would think to stub) and
// asserts tree-shaking against real, un-minified `function <name>` bodies.
const REAL_DIST = resolve(__dirname, '../../../client/dist/runtime/standalone.js')

// Self-sufficient on a clean checkout: build @barefootjs/client's dist once
// if it isn't there yet (CI jobs and fresh clones may run this suite before
// any package build). One-time cost, skipped entirely when dist exists.
if (!existsSync(REAL_DIST)) {
  const proc = Bun.spawnSync({
    cmd: ['bun', 'run', 'build'],
    cwd: resolve(__dirname, '../../../client'),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (proc.exitCode !== 0 || !existsSync(REAL_DIST)) {
    throw new Error(
      `failed to build packages/client for the runtime-treeshake integration tests:\n${proc.stderr.toString()}`,
    )
  }
}

function writeFixtureDist(projectDir: string): void {
  if (!existsSync(REAL_DIST)) {
    throw new Error(`${REAL_DIST} not found even after building packages/client`)
  }
  const runtimeDir = resolve(projectDir, 'node_modules/@barefootjs/client/dist/runtime')
  mkdirSync(runtimeDir, { recursive: true })
  writeFileSync(resolve(runtimeDir, 'standalone.js'), readFileSync(REAL_DIST, 'utf8'))
}

/** Asserts `content` contains a top-level `function <name>` declaration. */
function expectHasFn(content: string, name: string): void {
  expect(content).toContain(`function ${name}(`)
}

/** Asserts `content` does NOT contain a top-level `function <name>` declaration. */
function expectLacksFn(content: string, name: string): void {
  expect(content).not.toContain(`function ${name}(`)
}

function makeConfig(projectDir: string, outDir: string, extra: Record<string, unknown> = {}) {
  return {
    projectDir,
    adapter: new TestAdapter(),
    componentDirs: [resolve(projectDir, 'components')],
    outDir,
    minify: false,
    contentHash: false,
    clientOnly: true,
    ...extra,
  }
}

function writeComponent(projectDir: string, name: string, imports: string[]): void {
  const componentsDir = resolve(projectDir, 'components')
  mkdirSync(componentsDir, { recursive: true })
  writeFileSync(
    resolve(componentsDir, `${name}.tsx`),
    `'use client'\n` +
      `import { ${imports.join(', ')} } from '@barefootjs/client'\n` +
      `export function ${name}() {\n` +
      `  const [v, setV] = createSignal(0)\n` +
      `  ${imports.includes('createEffect') ? 'createEffect(() => { v() })' : ''}\n` +
      `  ${imports.includes('onMount') ? 'onMount(() => {})' : ''}\n` +
      `  return <button onClick={() => setV(v() + 1)}>{v()}</button>\n` +
      `}\n`,
  )
}

describe('build() runtime tree-shaking', () => {
  test('treeshake mode (default) keeps only used + always-kept exports', async () => {
    const projectDir = makeTmpDir('default-src')
    const outDir = makeTmpDir('default-out')
    try {
      writeFixtureDist(projectDir)
      writeComponent(projectDir, 'Counter', ['createSignal', 'createEffect'])

      const result = await build(makeConfig(projectDir, outDir))
      expect(result.errorCount).toBe(0)

      const runtimePath = resolve(outDir, 'components/barefoot.js')
      expect(existsSync(runtimePath)).toBe(true)
      const content = readFileSync(runtimePath, 'utf8')

      // Used by the component itself.
      expectHasFn(content, 'createSignal')
      expectHasFn(content, 'createEffect')
      // Compiler-injected component scaffolding every 'use client' component
      // needs, regardless of what the source imports.
      expectHasFn(content, 'createComponent')
      expectHasFn(content, 'hydrate')
      // Always-kept public mount API, even though no compiled component
      // calls it directly.
      expectHasFn(content, 'render')
      expectHasFn(content, 'setupStreaming')
      // Not used anywhere and not always-kept — tree-shaken out.
      expectLacksFn(content, 'onMount')
      expectLacksFn(content, 'onCleanup')
      expectLacksFn(content, 'createMemo')
      expectLacksFn(content, 'createPortal')
      expectLacksFn(content, 'reconcileList')

      // And it's meaningfully smaller than the full runtime.
      expect(content.length).toBeLessThan(readFileSync(REAL_DIST, 'utf8').length / 2)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test("runtimeBundle: 'full' copies the entire dist verbatim", async () => {
    const projectDir = makeTmpDir('full-src')
    const outDir = makeTmpDir('full-out')
    try {
      writeFixtureDist(projectDir)
      writeComponent(projectDir, 'Counter', ['createSignal'])

      const result = await build(makeConfig(projectDir, outDir, { runtimeBundle: 'full' }))
      expect(result.errorCount).toBe(0)

      const content = readFileSync(resolve(outDir, 'components/barefoot.js'), 'utf8')
      // Every runtime export present, including ones nothing imports.
      for (const name of ['onMount', 'onCleanup', 'createMemo', 'createPortal', 'reconcileList']) {
        expectHasFn(content, name)
      }
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('runtimeKeep force-keeps extra names beyond what compiled components import', async () => {
    const projectDir = makeTmpDir('keep-src')
    const outDir = makeTmpDir('keep-out')
    try {
      writeFixtureDist(projectDir)
      writeComponent(projectDir, 'Counter', ['createSignal'])

      const result = await build(makeConfig(projectDir, outDir, { runtimeKeep: ['createPortal'] }))
      expect(result.errorCount).toBe(0)

      const content = readFileSync(resolve(outDir, 'components/barefoot.js'), 'utf8')
      expectHasFn(content, 'createPortal')
      // Still tree-shaken: an unrelated, non-kept name stays out.
      expectLacksFn(content, 'createMemo')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  // A `'use client'` component's own compiled output never contains a
  // namespace/default/dynamic import of the runtime — the compiler
  // statically recognizes reactive-primitive usage (even written as
  // `bf.createSignal(...)` through a namespace import) and regenerates its
  // own normalized named-import codegen regardless of how the source wrote
  // it. The unsafe shapes this collector guards against are only reachable
  // through code the compiler doesn't rewrite: a `bundleEntries` script
  // (bundled by esbuild with `@barefootjs/client*` kept external, so
  // whatever import shape the author wrote survives verbatim).
  test('falls back to a full copy when a bundleEntries script uses an unsafe import shape (namespace import)', async () => {
    const projectDir = makeTmpDir('unsafe-src')
    const outDir = makeTmpDir('unsafe-out')
    try {
      writeFixtureDist(projectDir)
      writeComponent(projectDir, 'Counter', ['createSignal'])
      const clientDir = resolve(projectDir, 'client')
      mkdirSync(clientDir, { recursive: true })
      writeFileSync(
        resolve(clientDir, 'router-entry.ts'),
        `import * as bf from '@barefootjs/client/runtime'\n` +
          `bf.setupStreaming()\n`,
      )

      const result = await build(makeConfig(projectDir, outDir, {
        bundleEntries: [{ entry: resolve(clientDir, 'router-entry.ts'), outfile: 'router-entry.js' }],
      }))
      expect(result.errorCount).toBe(0)

      const content = readFileSync(resolve(outDir, 'components/barefoot.js'), 'utf8')
      // Fell back to full copy — every runtime export present, including
      // ones neither the component nor the router entry ever names directly.
      expectHasFn(content, 'onMount')
      expectHasFn(content, 'createMemo')
      expectHasFn(content, 'createPortal')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('no prebuilt dist found: warns and leaves barefoot.js unwritten rather than crashing', async () => {
    const projectDir = makeTmpDir('nodist-src')
    const outDir = makeTmpDir('nodist-out')
    try {
      // Deliberately do NOT call writeFixtureDist — no node_modules/@barefootjs/client.
      writeComponent(projectDir, 'Counter', ['createSignal'])

      const result = await build(makeConfig(projectDir, outDir))
      expect(result.errorCount).toBe(0)
      expect(existsSync(resolve(outDir, 'components/barefoot.js'))).toBe(false)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('incremental rebuild: unchanged imports keep a stable runtimeKeepHash; a newly-imported export regenerates barefoot.js', async () => {
    const projectDir = makeTmpDir('incr-src')
    const outDir = makeTmpDir('incr-out')
    try {
      writeFixtureDist(projectDir)
      writeComponent(projectDir, 'Counter', ['createSignal'])

      const first = await build(makeConfig(projectDir, outDir))
      expect(first.errorCount).toBe(0)
      const firstContent = readFileSync(resolve(outDir, 'components/barefoot.js'), 'utf8')
      expectLacksFn(firstContent, 'onMount')
      const cacheAfterFirst = await loadCache(outDir)
      expect(cacheAfterFirst?.runtimeKeepHash).toBeTruthy()

      // No-op rebuild: same source, same dist. The keep-hash should be
      // stable (nothing that would change barefoot.js's contents changed).
      const second = await build(makeConfig(projectDir, outDir))
      expect(second.errorCount).toBe(0)
      const cacheAfterSecond = await loadCache(outDir)
      expect(cacheAfterSecond?.runtimeKeepHash).toBe(cacheAfterFirst?.runtimeKeepHash)

      // Now a component starts importing something new. This doesn't touch
      // barefoot.config.ts, so `globalHash` is unchanged — the runtime
      // regen has to be driven by the collected keep-set changing, not by
      // cache invalidation.
      writeComponent(projectDir, 'Counter', ['createSignal', 'onMount'])
      const third = await build(makeConfig(projectDir, outDir))
      expect(third.errorCount).toBe(0)
      const thirdContent = readFileSync(resolve(outDir, 'components/barefoot.js'), 'utf8')
      expectHasFn(thirdContent, 'onMount')
      const cacheAfterThird = await loadCache(outDir)
      expect(cacheAfterThird?.runtimeKeepHash).not.toBe(cacheAfterSecond?.runtimeKeepHash)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test("'treeshake-exact' drops the always-kept public mount API not actually used", async () => {
    const projectDir = makeTmpDir('exact-src')
    const outDir = makeTmpDir('exact-out')
    try {
      writeFixtureDist(projectDir)
      writeComponent(projectDir, 'Counter', ['createSignal', 'createEffect'])

      const result = await build(makeConfig(projectDir, outDir, { runtimeBundle: 'treeshake-exact' }))
      expect(result.errorCount).toBe(0)

      const content = readFileSync(resolve(outDir, 'components/barefoot.js'), 'utf8')
      // Still kept: actually used, or compiler-injected scaffolding.
      expectHasFn(content, 'createSignal')
      expectHasFn(content, 'createEffect')
      expectHasFn(content, 'createComponent')
      expectHasFn(content, 'hydrate')
      // Dropped: part of the always-kept set under 'treeshake', but nothing
      // here actually calls them.
      expectLacksFn(content, 'render')
      expectLacksFn(content, 'setupStreaming')
      expectLacksFn(content, 'disposeScope')
      expectLacksFn(content, 'createSearchParams')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test("'treeshake-exact' + runtimeKeep restores a specific always-kept name for a hand-written page script", async () => {
    const projectDir = makeTmpDir('exact-keep-src')
    const outDir = makeTmpDir('exact-keep-out')
    try {
      writeFixtureDist(projectDir)
      writeComponent(projectDir, 'Counter', ['createSignal'])

      const result = await build(makeConfig(projectDir, outDir, {
        runtimeBundle: 'treeshake-exact',
        runtimeKeep: ['render'],
      }))
      expect(result.errorCount).toBe(0)

      const content = readFileSync(resolve(outDir, 'components/barefoot.js'), 'utf8')
      expectHasFn(content, 'render')
      // Not requested, and nothing calls it — still dropped.
      expectLacksFn(content, 'setupStreaming')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test("'treeshake-exact' with zero reachable runtime exports skips barefoot.js instead of crashing or falling back to a full copy", async () => {
    const projectDir = makeTmpDir('exact-empty-src')
    const outDir = makeTmpDir('exact-empty-out')
    try {
      writeFixtureDist(projectDir)
      // No 'use client' component and no bundleEntries — nothing in this
      // build ever imports @barefootjs/client at all.
      const componentsDir = resolve(projectDir, 'components')
      mkdirSync(componentsDir, { recursive: true })
      writeFileSync(
        resolve(componentsDir, 'Static.tsx'),
        `export function Static() {\n  return <div>hello</div>\n}\n`,
      )

      const result = await build(makeConfig(projectDir, outDir, { runtimeBundle: 'treeshake-exact' }))
      expect(result.errorCount).toBe(0)
      expect(existsSync(resolve(outDir, 'components/barefoot.js'))).toBe(false)

      // Cache still records a stable hash so a repeat build doesn't redo
      // this work or oscillate.
      const cacheAfterFirst = await loadCache(outDir)
      expect(cacheAfterFirst?.runtimeKeepHash).toBeTruthy()

      const second = await build(makeConfig(projectDir, outDir, { runtimeBundle: 'treeshake-exact' }))
      expect(second.errorCount).toBe(0)
      expect(existsSync(resolve(outDir, 'components/barefoot.js'))).toBe(false)
      const cacheAfterSecond = await loadCache(outDir)
      expect(cacheAfterSecond?.runtimeKeepHash).toBe(cacheAfterFirst?.runtimeKeepHash)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test("switching runtimeBundle from 'treeshake' to 'treeshake-exact' regenerates barefoot.js even with unchanged sources", async () => {
    const projectDir = makeTmpDir('exact-switch-src')
    const outDir = makeTmpDir('exact-switch-out')
    try {
      writeFixtureDist(projectDir)
      writeComponent(projectDir, 'Counter', ['createSignal'])

      const first = await build(makeConfig(projectDir, outDir))
      expect(first.errorCount).toBe(0)
      const firstContent = readFileSync(resolve(outDir, 'components/barefoot.js'), 'utf8')
      expectHasFn(firstContent, 'render')

      const cacheAfterFirst = await loadCache(outDir)

      const second = await build(makeConfig(projectDir, outDir, { runtimeBundle: 'treeshake-exact' }))
      expect(second.errorCount).toBe(0)
      const secondContent = readFileSync(resolve(outDir, 'components/barefoot.js'), 'utf8')
      // The mode switch actually took effect (not served from a stale cache
      // entry keyed only on the keep-set, which is identical here except for
      // the always-kept names).
      expectLacksFn(secondContent, 'render')
      const cacheAfterSecond = await loadCache(outDir)
      expect(cacheAfterSecond?.runtimeKeepHash).not.toBe(cacheAfterFirst?.runtimeKeepHash)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
