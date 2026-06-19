import { describe, test, expect } from 'bun:test'
import {
  hasUseClientDirective,
  detectMissingUseClient,
  discoverComponentFiles,
  generateHash,
  resolveBuildConfigFromTs,
  collectRelativeImportDeps,
  vendorChunkFilename,
  extractBareImports,
  processExternals,
  processBundleEntries,
  computeGlobalHash,
  buildRelativeImportRewriter,
  build,
} from '../lib/build'
import { emptyCache, loadCache, type BuildCache, type CacheEntry } from '../lib/build-cache'
import { loadEmitLedger } from '../lib/emit-ledger'
import { ASSETS_IGNORE_FILENAME } from '../lib/assets-ignore'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { mkdirSync, writeFileSync, rmSync, existsSync, statSync, readFileSync, realpathSync, unlinkSync } from 'fs'
import { resolve, relative } from 'path'
import { tmpdir } from 'os'

// ── hasUseClientDirective ────────────────────────────────────────────────

describe('hasUseClientDirective', () => {
  test('detects double-quoted directive', () => {
    expect(hasUseClientDirective('"use client"\n\nimport ...')).toBe(true)
  })

  test('detects single-quoted directive', () => {
    expect(hasUseClientDirective("'use client'\n\nimport ...")).toBe(true)
  })

  test('detects directive after block comment', () => {
    expect(hasUseClientDirective('/* license */\n"use client"')).toBe(true)
  })

  test('detects directive after line comments', () => {
    expect(hasUseClientDirective('// comment\n"use client"')).toBe(true)
  })

  test('detects directive with leading whitespace', () => {
    expect(hasUseClientDirective('  \n  "use client"')).toBe(true)
  })

  test('returns false for missing directive', () => {
    expect(hasUseClientDirective('import { foo } from "bar"')).toBe(false)
  })

  test('returns false for directive in wrong position', () => {
    expect(hasUseClientDirective('import { foo } from "bar"\n"use client"')).toBe(false)
  })

  test('returns false for empty file', () => {
    expect(hasUseClientDirective('')).toBe(false)
  })
})

// ── detectMissingUseClient ───────────────────────────────────────────────
//
// The CLI skip-gate drops files without `'use client'` before they ever
// reach the analyzer, so the analyzer's BF001 diagnostic never gets a
// chance to fire on plain `export function Foo() { createSignal(...) }`
// files. `detectMissingUseClient` is the import-side surface check that
// lets the CLI re-raise BF001 at the skip-gate instead of silently
// skipping. These tests pin both directions of the gate.

describe('detectMissingUseClient', () => {
  test('flags createSignal value import', () => {
    expect(
      detectMissingUseClient(`import { createSignal } from '@barefootjs/client'\nexport function F() { return <div /> }`),
    ).toEqual(['createSignal'])
  })

  test('flags multiple reactive imports', () => {
    const hits = detectMissingUseClient(
      `import { createSignal, createMemo, createEffect } from '@barefootjs/client'`,
    )
    expect(hits.sort()).toEqual(['createEffect', 'createMemo', 'createSignal'])
  })

  test('flags createDisposableEffect (analyzer REACTIVE_PRIMITIVES parity)', () => {
    // Aligning the skip-gate tripwire with the analyzer's actual trigger set
    // means createDisposableEffect — which the analyzer counts in
    // `ctx.effects` and therefore fires BF001 on — is no longer a silent
    // miss at the CLI surface.
    expect(
      detectMissingUseClient(`import { createDisposableEffect } from '@barefootjs/client'`),
    ).toEqual(['createDisposableEffect'])
  })

  test('flags browser-only runtime imports (useContext, provideContext, createPortal)', () => {
    // Matches `importsBrowserOnlyClientApi` in the analyzer: these names'
    // implementations live in @barefootjs/client/runtime and need the
    // compiler to rewire them, so an import alone is the BF001 trigger.
    const hits = detectMissingUseClient(
      `import { useContext, provideContext, createPortal } from '@barefootjs/client'`,
    )
    expect(hits.sort()).toEqual(['createPortal', 'provideContext', 'useContext'])
  })

  test('handles renamed bindings via `as`', () => {
    expect(
      detectMissingUseClient(`import { createSignal as sig } from '@barefootjs/client'`),
    ).toEqual(['createSignal'])
  })

  test('does NOT flag type-only `import type` (erased at compile time)', () => {
    expect(
      detectMissingUseClient(`import type { Reactive } from '@barefootjs/client'`),
    ).toEqual([])
  })

  test('does NOT flag inline `type` specifiers inside a mixed import', () => {
    // `type Reactive` is erased; the only runtime binding here is `Reactive`,
    // not a tripwire primitive, so the file is a legitimate server component.
    expect(
      detectMissingUseClient(`import { type Reactive } from '@barefootjs/client'`),
    ).toEqual([])
  })

  test('does NOT flag `untrack` (not in the analyzer trigger set)', () => {
    // `untrack` reads signals without subscribing; it doesn't populate any
    // `ctx.signals`/`effects`/etc. array, so the analyzer never raises
    // BF001 from an `untrack` import. The skip-gate must match.
    expect(
      detectMissingUseClient(`import { untrack } from '@barefootjs/client'`),
    ).toEqual([])
  })

  test('does NOT flag non-tripwire runtime imports (createContext etc.)', () => {
    // createContext on its own is server-safe; only signal/effect/memo
    // primitives require the client runtime.
    expect(
      detectMissingUseClient(`import { createContext } from '@barefootjs/client'`),
    ).toEqual([])
  })

  test('returns empty for plain server components with no @barefootjs/client import', () => {
    expect(
      detectMissingUseClient(`export function UserCard({ name }: { name: string }) { return <h3>{name}</h3> }`),
    ).toEqual([])
  })
})

// ── discoverComponentFiles ───────────────────────────────────────────────

describe('discoverComponentFiles', () => {
  const testDir = resolve(tmpdir(), `bf-test-discover-${Date.now()}`)

  test('discovers .tsx files recursively', async () => {
    mkdirSync(resolve(testDir, 'sub'), { recursive: true })
    writeFileSync(resolve(testDir, 'Button.tsx'), '"use client"')
    writeFileSync(resolve(testDir, 'sub/Input.tsx'), '"use client"')
    writeFileSync(resolve(testDir, 'Button.test.tsx'), 'test')
    writeFileSync(resolve(testDir, 'Button.preview.tsx'), 'preview')
    writeFileSync(resolve(testDir, 'styles.css'), 'css')

    const files = await discoverComponentFiles(testDir)
    const names = files.map(f => f.split('/').pop())

    expect(names).toContain('Button.tsx')
    expect(names).toContain('Input.tsx')
    expect(names).not.toContain('Button.test.tsx')
    expect(names).not.toContain('Button.preview.tsx')
    expect(names).not.toContain('styles.css')

    rmSync(testDir, { recursive: true, force: true })
  })

  test('returns empty array for non-existent directory', async () => {
    const files = await discoverComponentFiles('/tmp/nonexistent-dir-bf-test')
    expect(files).toEqual([])
  })
})

// ── generateHash ─────────────────────────────────────────────────────────

describe('generateHash', () => {
  test('returns a hex string', () => {
    const hash = generateHash('hello world')
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  test('returns 8 characters', () => {
    expect(generateHash('test content')).toHaveLength(8)
  })

  test('same input produces same hash', () => {
    expect(generateHash('foo')).toBe(generateHash('foo'))
  })

  test('different input produces different hash', () => {
    expect(generateHash('foo')).not.toBe(generateHash('bar'))
  })
})

// ── resolveBuildConfigFromTs ─────────────────────────────────────────────

describe('resolveBuildConfigFromTs', () => {
  const projectDir = '/test/project'
  const mockAdapter = { name: 'mock', extension: '.mock' } as any

  test('resolves defaults', () => {
    const config = resolveBuildConfigFromTs(projectDir, { adapter: mockAdapter })

    expect(config.adapter).toBe(mockAdapter)
    expect(config.componentDirs).toEqual(['/test/project/components'])
    expect(config.outDir).toBe('/test/project/dist')
    expect(config.minify).toBe(false)
    expect(config.contentHash).toBe(false)
    expect(config.clientOnly).toBe(false)
    expect(config.transformMarkedTemplate).toBeUndefined()
  })

  test('resolves with transformMarkedTemplate hook', () => {
    const hook = (c: string) => c
    const config = resolveBuildConfigFromTs(projectDir, {
      adapter: mockAdapter,
      transformMarkedTemplate: hook,
    })

    expect(config.transformMarkedTemplate).toBe(hook)
  })

  test('applies overrides', () => {
    const config = resolveBuildConfigFromTs(
      projectDir,
      { adapter: mockAdapter, minify: false },
      { minify: true }
    )

    expect(config.minify).toBe(true)
  })

  test('resolves custom component dirs', () => {
    const config = resolveBuildConfigFromTs(projectDir, {
      adapter: mockAdapter,
      components: ['src/components', '../shared'],
    })

    expect(config.componentDirs).toEqual([
      '/test/project/src/components',
      '/test/shared',
    ])
  })

  test('resolves custom outDir', () => {
    const config = resolveBuildConfigFromTs(projectDir, {
      adapter: mockAdapter,
      outDir: 'build/output',
    })

    expect(config.outDir).toBe('/test/project/build/output')
  })

  test('passes through localImportPrefixes', () => {
    const config = resolveBuildConfigFromTs(projectDir, {
      adapter: mockAdapter,
      localImportPrefixes: ['@/', '@ui/'],
    })

    expect(config.localImportPrefixes).toEqual(['@/', '@ui/'])
  })

  test('localImportPrefixes defaults to undefined when omitted', () => {
    const config = resolveBuildConfigFromTs(projectDir, { adapter: mockAdapter })

    expect(config.localImportPrefixes).toBeUndefined()
  })
})

// ── collectRelativeImportDeps ───────────────────────────────────────────

describe('collectRelativeImportDeps', () => {
  const testDir = resolve(tmpdir(), `bf-test-collect-deps-${Date.now()}`)
  const entry = resolve(testDir, 'entry.tsx')

  function setup() {
    mkdirSync(testDir, { recursive: true })
    writeFileSync(entry, '')
  }

  function cleanup() {
    rmSync(testDir, { recursive: true, force: true })
  }

  test('resolves `./foo` to ./foo.ts when a file exists', async () => {
    setup()
    writeFileSync(resolve(testDir, 'foo.ts'), 'export const x = 1')
    const deps = await collectRelativeImportDeps(entry, `import { x } from './foo'`)
    expect(deps).toEqual([resolve(testDir, 'foo.ts')])
    cleanup()
  })

  test('resolves `./foo` to ./foo.tsx when a file exists', async () => {
    setup()
    writeFileSync(resolve(testDir, 'foo.tsx'), 'export function X() {}')
    const deps = await collectRelativeImportDeps(entry, `import { X } from './foo'`)
    expect(deps).toEqual([resolve(testDir, 'foo.tsx')])
    cleanup()
  })

  test('resolves `./dir` to ./dir/index.ts when dir exists with an index file', async () => {
    setup()
    mkdirSync(resolve(testDir, 'dir'))
    writeFileSync(resolve(testDir, 'dir/index.ts'), 'export const x = 1')
    const deps = await collectRelativeImportDeps(entry, `import { x } from './dir'`)
    expect(deps).toEqual([resolve(testDir, 'dir/index.ts')])
    cleanup()
  })

  test('skips bare directory paths without an index file (regression: EISDIR on readText)', async () => {
    setup()
    mkdirSync(resolve(testDir, 'empty'))
    const deps = await collectRelativeImportDeps(entry, `import { x } from './empty'`)
    expect(deps).toEqual([])
    cleanup()
  })

  test('ignores bare-match directory when `/index.ts` sibling exists (no EISDIR)', async () => {
    // The bare `./dir` path is a directory and must NOT be picked — the
    // collector must fall through to the `/index.ts` candidate instead.
    setup()
    mkdirSync(resolve(testDir, 'nodes'))
    writeFileSync(resolve(testDir, 'nodes/index.ts'), 'export const nodeTypes = {}')
    const deps = await collectRelativeImportDeps(entry, `import { nodeTypes } from './nodes'`)
    expect(deps).toEqual([resolve(testDir, 'nodes/index.ts')])
    cleanup()
  })

  test('skips imports that resolve to nothing', async () => {
    setup()
    const deps = await collectRelativeImportDeps(entry, `import { x } from './missing'`)
    expect(deps).toEqual([])
    cleanup()
  })

  test('ignores bare (non-relative) imports', async () => {
    setup()
    const deps = await collectRelativeImportDeps(entry, `import { x } from 'some-pkg'`)
    expect(deps).toEqual([])
    cleanup()
  })

  test('deduplicates repeated relative imports', async () => {
    setup()
    writeFileSync(resolve(testDir, 'foo.ts'), 'export const x = 1')
    const deps = await collectRelativeImportDeps(
      entry,
      `import { x } from './foo'\nimport { x as y } from './foo'`,
    )
    expect(deps).toEqual([resolve(testDir, 'foo.ts')])
    cleanup()
  })
})

// ── vendorChunkFilename ──────────────────────────────────────────────────

describe('vendorChunkFilename', () => {
  test('unscoped package', () => {
    expect(vendorChunkFilename('yjs')).toBe('yjs.js')
  })

  test('scoped package uses last segment', () => {
    expect(vendorChunkFilename('@barefootjs/xyflow')).toBe('xyflow.js')
  })

  test('scoped package with deeper path', () => {
    expect(vendorChunkFilename('@scope/pkg')).toBe('pkg.js')
  })
})

// ── resolveBuildConfigFromTs: externals ──────────────────────────────────

describe('resolveBuildConfigFromTs with externals', () => {
  const projectDir = '/test/project'
  const mockAdapter = { name: 'mock', extension: '.mock' } as any

  test('passes through externals', () => {
    const externals = { '@barefootjs/xyflow': true as const, yjs: { preload: true } }
    const config = resolveBuildConfigFromTs(projectDir, { adapter: mockAdapter, externals })
    expect(config.externals).toEqual(externals)
  })

  test('passes through externalsBasePath', () => {
    const config = resolveBuildConfigFromTs(projectDir, {
      adapter: mockAdapter,
      externalsBasePath: '/cdn/v1/',
    })
    expect(config.externalsBasePath).toBe('/cdn/v1/')
  })

  test('externals undefined by default', () => {
    const config = resolveBuildConfigFromTs(projectDir, { adapter: mockAdapter })
    expect(config.externals).toBeUndefined()
    expect(config.externalsBasePath).toBeUndefined()
  })
})

// ── extractBareImports ───────────────────────────────────────────────────

describe('extractBareImports', () => {
  test('collects static, side-effect, re-export, and dynamic specifiers', () => {
    const code = [
      `import { a } from '@barefootjs/client'`,
      `import 'side-effect-pkg'`,
      `export { b } from 'lib0/observable'`,
      `const m = await import('dynamic-pkg')`,
    ].join('\n')
    expect(extractBareImports(code).sort()).toEqual(
      ['@barefootjs/client', 'dynamic-pkg', 'lib0/observable', 'side-effect-pkg'].sort()
    )
  })

  test('excludes relative, absolute, and URL specifiers', () => {
    const code = [
      `import a from './local'`,
      `import b from '../sibling'`,
      `import c from '/abs/path'`,
      `import d from 'https://esm.sh/zod'`,
      `import e from 'bare-pkg'`,
    ].join('\n')
    expect(extractBareImports(code)).toEqual(['bare-pkg'])
  })

  test('ignores specifiers inside comments and string literals (regex would false-positive)', () => {
    const code = [
      `// import { x } from 'commented-out-pkg'`,
      `/* import y from 'block-comment-pkg' */`,
      `const s = "import z from 'string-literal-pkg'"`,
      `const t = \`import w from 'template-pkg'\``,
      `import { real } from 'real-pkg'`,
    ].join('\n')
    expect(extractBareImports(code)).toEqual(['real-pkg'])
  })

  test('dedupes repeated specifiers', () => {
    const code = [
      `import { a } from '@barefootjs/client'`,
      `import { b } from '@barefootjs/client'`,
    ].join('\n')
    expect(extractBareImports(code)).toEqual(['@barefootjs/client'])
  })
})

// ── processExternals ─────────────────────────────────────────────────────

describe('processExternals', () => {
  const mockAdapter = { name: 'mock', extension: '.mock' } as any

  function makeTmpDir() {
    const dir = resolve(tmpdir(), `bf-test-externals-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  function makeConfig(projectDir: string, outDir: string, extra: Record<string, any> = {}) {
    return {
      projectDir,
      adapter: mockAdapter,
      componentDirs: [],
      outDir,
      minify: false,
      contentHash: false,
      clientOnly: false,
      ...extra,
    }
  }

  test('returns false and emits nothing when externals is empty', async () => {
    const outDir = makeTmpDir()
    try {
      const { changed } = await processExternals(makeConfig(outDir, outDir), 'components', outDir)
      expect(changed).toBe(false)
      expect(require('fs').existsSync(resolve(outDir, 'barefoot-externals.json'))).toBe(false)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('CDN passthrough: records url in importmap, skips file copy', async () => {
    const outDir = makeTmpDir()
    try {
      const config = makeConfig(outDir, outDir, {
        externals: { lodash: { url: 'https://esm.sh/lodash@4.17.21' } },
      })
      await processExternals(config, 'components', outDir)
      const raw = require('fs').readFileSync(resolve(outDir, 'barefoot-externals.json'), 'utf8')
      const manifest = JSON.parse(raw)
      expect(manifest.importmap.imports.lodash).toBe('https://esm.sh/lodash@4.17.21')
      // CDN file should NOT be copied locally
      expect(require('fs').existsSync(resolve(outDir, 'lodash.js'))).toBe(false)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('preload: true adds URL to preloads array', async () => {
    const outDir = makeTmpDir()
    try {
      const config = makeConfig(outDir, outDir, {
        externals: { lodash: { url: 'https://esm.sh/lodash@4.17.21', preload: true } },
      })
      await processExternals(config, 'components', outDir)
      const manifest = JSON.parse(
        require('fs').readFileSync(resolve(outDir, 'barefoot-externals.json'), 'utf8')
      )
      expect(manifest.preloads).toContain('https://esm.sh/lodash@4.17.21')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('auto-dedup: @barefootjs/client* entries always added', async () => {
    const outDir = makeTmpDir()
    try {
      const config = makeConfig(outDir, outDir, {
        externals: { lodash: { url: 'https://esm.sh/lodash' } },
        externalsBasePath: '/static/components/',
      })
      await processExternals(config, 'components', outDir)
      const manifest = JSON.parse(
        require('fs').readFileSync(resolve(outDir, 'barefoot-externals.json'), 'utf8')
      )
      const { imports } = manifest.importmap
      expect(imports['@barefootjs/client']).toBe('/static/components/barefoot.js')
      expect(imports['@barefootjs/client/runtime']).toBe('/static/components/barefoot.js')
      expect(imports['@barefootjs/client/reactive']).toBe('/static/components/barefoot.js')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('html-snippet adapter emits barefoot-importmap.html from the manifest', async () => {
    const outDir = makeTmpDir()
    try {
      const config = makeConfig(outDir, outDir, {
        adapter: { name: 'mock-go', extension: '.tmpl', importMapInjection: 'html-snippet' },
        externals: { lodash: { url: 'https://esm.sh/lodash@4.17.21', preload: true } },
        externalsBasePath: '/static/components/',
      })
      await processExternals(config, 'components', outDir)

      const snippetPath = resolve(outDir, 'barefoot-importmap.html')
      expect(require('fs').existsSync(snippetPath)).toBe(true)
      const html = require('fs').readFileSync(snippetPath, 'utf8')
      // The snippet is generated from the same manifest the build writes.
      const imports = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]).imports
      expect(imports.lodash).toBe('https://esm.sh/lodash@4.17.21')
      expect(imports['@barefootjs/client']).toBe('/static/components/barefoot.js')
      expect(html).toContain('<link rel="modulepreload" href="https://esm.sh/lodash@4.17.21" crossorigin>')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('component adapter does NOT emit barefoot-importmap.html', async () => {
    const outDir = makeTmpDir()
    try {
      // mockAdapter has no importMapInjection (and a 'component' adapter would
      // also skip): the snippet is only for template-string adapters.
      const config = makeConfig(outDir, outDir, {
        adapter: { name: 'mock-hono', extension: '.tsx', importMapInjection: 'component' },
        externals: { lodash: { url: 'https://esm.sh/lodash' } },
      })
      await processExternals(config, 'components', outDir)
      // Manifest is still written for the component to consume…
      expect(require('fs').existsSync(resolve(outDir, 'barefoot-externals.json'))).toBe(true)
      // …but no static snippet.
      expect(require('fs').existsSync(resolve(outDir, 'barefoot-importmap.html'))).toBe(false)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('externals array includes all packages + dedup keys', async () => {
    const outDir = makeTmpDir()
    try {
      const config = makeConfig(outDir, outDir, {
        externals: { yjs: { url: 'https://esm.sh/yjs' } },
      })
      await processExternals(config, 'components', outDir)
      const manifest = JSON.parse(
        require('fs').readFileSync(resolve(outDir, 'barefoot-externals.json'), 'utf8')
      )
      expect(manifest.externals).toContain('yjs')
      expect(manifest.externals).toContain('@barefootjs/client')
      expect(manifest.externals).toContain('@barefootjs/client/runtime')
      expect(manifest.externals).toContain('@barefootjs/client/reactive')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('externalsBasePath defaults to /<runtimeSubdir>/', async () => {
    const outDir = makeTmpDir()
    try {
      const config = makeConfig(outDir, outDir, {
        externals: { yjs: { url: 'https://esm.sh/yjs' } },
      })
      await processExternals(config, 'components', outDir)
      const manifest = JSON.parse(
        require('fs').readFileSync(resolve(outDir, 'barefoot-externals.json'), 'utf8')
      )
      expect(manifest.importmap.imports['@barefootjs/client']).toBe('/components/barefoot.js')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('chunk with only import/main entry emits a warning', async () => {
    const projectDir = makeTmpDir()
    const outDir = makeTmpDir()
    try {
      // Create a fake package that has only an `import` field (no umd/unpkg/jsdelivr).
      const pkgDir = resolve(projectDir, 'node_modules', 'fake-pkg')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(
        resolve(pkgDir, 'package.json'),
        JSON.stringify({ name: 'fake-pkg', version: '1.0.0', exports: { '.': { import: './index.mjs' } } })
      )
      writeFileSync(resolve(pkgDir, 'index.mjs'), `import { something } from 'lib0/observable'\nexport const x = 1`)

      const config = makeConfig(projectDir, outDir, {
        externals: { 'fake-pkg': true as const },
      })

      const warnCalls: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => { warnCalls.push(args.join(' ')) }
      try {
        await processExternals(config, 'components', outDir)
      } finally {
        console.warn = originalWarn
      }

      const warningMsg = warnCalls.find(m =>
        m.includes('fake-pkg') && m.includes('import/main entry')
      )
      expect(warningMsg).toBeDefined()
      expect(warningMsg).toContain('no umd/unpkg/jsdelivr found')
      expect(warningMsg).toContain('rebundle: true')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('chunk with umd entry does NOT emit an import/main fallback warning', async () => {
    const projectDir = makeTmpDir()
    const outDir = makeTmpDir()
    try {
      // Create a fake package that has an explicit `umd` field.
      const pkgDir = resolve(projectDir, 'node_modules', 'fake-umd-pkg')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(
        resolve(pkgDir, 'package.json'),
        JSON.stringify({
          name: 'fake-umd-pkg',
          version: '1.0.0',
          exports: { '.': { umd: './dist/index.umd.js', import: './dist/index.mjs' } },
        })
      )
      mkdirSync(resolve(pkgDir, 'dist'), { recursive: true })
      writeFileSync(resolve(pkgDir, 'dist/index.umd.js'), 'var fakePkg = (function(){return {}})();')

      const config = makeConfig(projectDir, outDir, {
        externals: { 'fake-umd-pkg': true as const },
      })

      const warnCalls: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => { warnCalls.push(args.join(' ')) }
      try {
        await processExternals(config, 'components', outDir)
      } finally {
        console.warn = originalWarn
      }

      const fallbackWarning = warnCalls.find(m =>
        m.includes('fake-umd-pkg') && m.includes('import/main entry')
      )
      expect(fallbackWarning).toBeUndefined()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('rebundle: true produces self-contained ESM without bare external imports', async () => {
    const projectDir = makeTmpDir()
    const outDir = makeTmpDir()
    try {
      // dep-pkg: a simple dependency that will be inlined
      const depDir = resolve(projectDir, 'node_modules', 'dep-pkg')
      mkdirSync(depDir, { recursive: true })
      writeFileSync(resolve(depDir, 'package.json'), JSON.stringify({ name: 'dep-pkg', version: '1.0.0', main: './index.js' }))
      writeFileSync(resolve(depDir, 'index.js'), `export const INLINED = 'from-dep-pkg'`)

      // needs-rebundle: imports from dep-pkg (bare external that browsers can't resolve)
      const pkgDir = resolve(projectDir, 'node_modules', 'needs-rebundle')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(
        resolve(pkgDir, 'package.json'),
        JSON.stringify({ name: 'needs-rebundle', version: '1.0.0', exports: { '.': { import: './index.mjs' } } })
      )
      writeFileSync(resolve(pkgDir, 'index.mjs'), `import { INLINED } from 'dep-pkg'\nexport const value = INLINED`)

      const config = makeConfig(projectDir, outDir, {
        externals: { 'needs-rebundle': { rebundle: true } as const },
      })

      await processExternals(config, 'components', outDir)

      const outFile = resolve(outDir, 'needs-rebundle.js')
      expect(require('fs').existsSync(outFile)).toBe(true)
      const content = require('fs').readFileSync(outFile, 'utf8')
      // dep-pkg code must be inlined — no bare 'dep-pkg' import should remain
      expect(content).toContain('from-dep-pkg')
      expect(content).not.toMatch(/from ['"]dep-pkg['"]/)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('rebundle: true does NOT emit import/main fallback warning', async () => {
    const projectDir = makeTmpDir()
    const outDir = makeTmpDir()
    try {
      const pkgDir = resolve(projectDir, 'node_modules', 'rebundle-pkg')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(
        resolve(pkgDir, 'package.json'),
        JSON.stringify({ name: 'rebundle-pkg', version: '1.0.0', exports: { '.': { import: './index.mjs' } } })
      )
      writeFileSync(resolve(pkgDir, 'index.mjs'), `export const x = 1`)

      const config = makeConfig(projectDir, outDir, {
        externals: { 'rebundle-pkg': { rebundle: true } as const },
      })

      const warnCalls: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => { warnCalls.push(args.join(' ')) }
      try {
        await processExternals(config, 'components', outDir)
      } finally {
        console.warn = originalWarn
      }

      const fallbackWarning = warnCalls.find(m =>
        m.includes('rebundle-pkg') && m.includes('import/main entry')
      )
      expect(fallbackWarning).toBeUndefined()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('chunk whose only external is @barefootjs/client does NOT warn (#1646)', async () => {
    const projectDir = makeTmpDir()
    const outDir = makeTmpDir()
    try {
      // import/main fallback, but the only bare import is the always-importmap-
      // resolved @barefootjs/client dedup key — so the chunk is browser-ready.
      const pkgDir = resolve(projectDir, 'node_modules', 'client-only-pkg')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(
        resolve(pkgDir, 'package.json'),
        JSON.stringify({ name: 'client-only-pkg', version: '1.0.0', exports: { '.': { import: './index.mjs' } } })
      )
      writeFileSync(
        resolve(pkgDir, 'index.mjs'),
        `import { createSignal } from '@barefootjs/client'\nexport const x = createSignal(1)`
      )

      const config = makeConfig(projectDir, outDir, {
        externals: { 'client-only-pkg': true as const },
      })

      const warnCalls: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => { warnCalls.push(args.join(' ')) }
      try {
        await processExternals(config, 'components', outDir)
      } finally {
        console.warn = originalWarn
      }

      const fallbackWarning = warnCalls.find(m =>
        m.includes('client-only-pkg') && m.includes('import/main entry')
      )
      expect(fallbackWarning).toBeUndefined()
      // The chunk is still copied and recorded in the importmap.
      expect(require('fs').existsSync(resolve(outDir, 'client-only-pkg.js'))).toBe(true)
      const manifest = JSON.parse(
        require('fs').readFileSync(resolve(outDir, 'barefoot-externals.json'), 'utf8')
      )
      expect(manifest.importmap.imports['client-only-pkg']).toBe('/components/client-only-pkg.js')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('chunk still warns about non-importmap bare imports alongside @barefootjs/client (#1646)', async () => {
    const projectDir = makeTmpDir()
    const outDir = makeTmpDir()
    try {
      const pkgDir = resolve(projectDir, 'node_modules', 'mixed-pkg')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(
        resolve(pkgDir, 'package.json'),
        JSON.stringify({ name: 'mixed-pkg', version: '1.0.0', exports: { '.': { import: './index.mjs' } } })
      )
      writeFileSync(
        resolve(pkgDir, 'index.mjs'),
        `import { createSignal } from '@barefootjs/client'\nimport { obs } from 'lib0/observable'\nexport const x = createSignal(obs)`
      )

      const config = makeConfig(projectDir, outDir, {
        externals: { 'mixed-pkg': true as const },
      })

      const warnCalls: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => { warnCalls.push(args.join(' ')) }
      try {
        await processExternals(config, 'components', outDir)
      } finally {
        console.warn = originalWarn
      }

      const warningMsg = warnCalls.find(m =>
        m.includes('mixed-pkg') && m.includes('import/main entry')
      )
      expect(warningMsg).toBeDefined()
      // Only the unresolved import is reported, not @barefootjs/client.
      expect(warningMsg).toContain('lib0/observable')
      expect(warningMsg).not.toContain('@barefootjs/client')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('rebundle keeps @barefootjs/client external instead of inlining it (#1646)', async () => {
    const projectDir = makeTmpDir()
    const outDir = makeTmpDir()
    try {
      // A fake @barefootjs/client that WOULD be inlined if not marked external.
      const clientDir = resolve(projectDir, 'node_modules', '@barefootjs', 'client')
      mkdirSync(clientDir, { recursive: true })
      writeFileSync(
        resolve(clientDir, 'package.json'),
        JSON.stringify({ name: '@barefootjs/client', version: '1.0.0', main: './index.js' })
      )
      writeFileSync(resolve(clientDir, 'index.js'), `export const SHARED_RUNTIME_MARKER = 'do-not-inline'`)

      // The rebundled peer imports @barefootjs/client; it must stay a bare import.
      const pkgDir = resolve(projectDir, 'node_modules', 'rebundle-peer')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(
        resolve(pkgDir, 'package.json'),
        JSON.stringify({ name: 'rebundle-peer', version: '1.0.0', exports: { '.': { import: './index.mjs' } } })
      )
      writeFileSync(
        resolve(pkgDir, 'index.mjs'),
        `import { SHARED_RUNTIME_MARKER } from '@barefootjs/client'\nexport const value = SHARED_RUNTIME_MARKER`
      )

      const config = makeConfig(projectDir, outDir, {
        externals: { 'rebundle-peer': { rebundle: true } as const },
      })

      await processExternals(config, 'components', outDir)

      const outFile = resolve(outDir, 'rebundle-peer.js')
      expect(require('fs').existsSync(outFile)).toBe(true)
      const content = require('fs').readFileSync(outFile, 'utf8')
      // @barefootjs/client must NOT be bundled in — it resolves via the importmap.
      expect(content).not.toContain('do-not-inline')
      expect(content).toMatch(/from\s*['"]@barefootjs\/client['"]/)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})

// ── minification ────────────────────────────────────────────────────────

describe('minification does not re-introduce jsxDEV', () => {
  test('transpile(minify: true) preserves HTML in template literals', async () => {
    const { transpile } = await import('../lib/runtime')

    const clientJs = `
import { createSignal, createEffect } from '@barefootjs/client'
export function __bf_init_Counter(el, props) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  const __tpl = document.createElement('template')
  __tpl.innerHTML = \`<div class="counter"><p>\${count()}</p><button>+1</button></div>\`
  el.appendChild(__tpl.content.cloneNode(true))
}
`
    const result = transpile(clientJs, { loader: 'js', minify: true })

    expect(result).not.toContain('jsxDEV')
    expect(result).not.toContain('jsx(')
    expect(result).toContain('innerHTML')
    expect(result).toContain('counter')
    // Hydration hook identifier must survive minification
    expect(result).toContain('__bf_init_Counter')
  })
})

// ── computeGlobalHash ─────────────────────────────────────────────────────

describe('computeGlobalHash', () => {
  const mockAdapter = { name: 'mock', extension: '.mock' } as any

  function makeTmpDir(label = 'global-hash') {
    const dir = resolve(tmpdir(), `bf-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(dir, { recursive: true })
    return realpathSync(dir)
  }

  function makeConfig(projectDir: string, extra: Record<string, any> = {}) {
    return {
      projectDir,
      adapter: mockAdapter,
      componentDirs: [],
      outDir: projectDir,
      minify: false,
      contentHash: false,
      clientOnly: false,
      ...extra,
    } as any
  }

  test('is stable across calls when nothing changes', async () => {
    const projectDir = makeTmpDir()
    try {
      writeFileSync(resolve(projectDir, 'bun.lock'), 'lockfile contents v1\n')
      const config = makeConfig(projectDir)
      const h1 = await computeGlobalHash(config)
      const h2 = await computeGlobalHash(config)
      expect(h1).toBe(h2)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  // Regression: piconic-ai/barefootjs#1179 — bumping a git-ref dependency via
  // `bun install` rewrote bun.lock but did not invalidate the build cache,
  // so stale `*.client.js` bundles missing new hydrations were served.
  test('changes when lockfile content changes', async () => {
    const projectDir = makeTmpDir()
    try {
      const lockPath = resolve(projectDir, 'bun.lock')
      writeFileSync(lockPath, 'lockfile contents v1\n')
      const config = makeConfig(projectDir)
      const before = await computeGlobalHash(config)

      writeFileSync(lockPath, 'lockfile contents v2\n')
      const after = await computeGlobalHash(config)
      expect(after).not.toBe(before)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test('differs when lockfile filename differs but content is identical', async () => {
    // bun.lock vs yarn.lock with the same bytes still represents a different
    // package manager state, so the hash must distinguish them.
    const dirA = makeTmpDir('lock-a')
    const dirB = makeTmpDir('lock-b')
    try {
      writeFileSync(resolve(dirA, 'bun.lock'), 'identical-bytes\n')
      writeFileSync(resolve(dirB, 'yarn.lock'), 'identical-bytes\n')
      const hA = await computeGlobalHash(makeConfig(dirA))
      const hB = await computeGlobalHash(makeConfig(dirB))
      expect(hA).not.toBe(hB)
    } finally {
      rmSync(dirA, { recursive: true, force: true })
      rmSync(dirB, { recursive: true, force: true })
    }
  })

  test('finds lockfile in a parent directory (monorepo workspace)', async () => {
    const root = makeTmpDir('monorepo')
    try {
      const lockPath = resolve(root, 'bun.lock')
      writeFileSync(lockPath, 'workspace lock v1\n')
      const pkgDir = resolve(root, 'packages/inner')
      mkdirSync(pkgDir, { recursive: true })

      const config = makeConfig(realpathSync(pkgDir))
      const before = await computeGlobalHash(config)

      // Mutating the workspace-root lockfile must still invalidate.
      writeFileSync(lockPath, 'workspace lock v2\n')
      const after = await computeGlobalHash(config)
      expect(after).not.toBe(before)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('returns a well-formed, stable hash regardless of lockfile presence', async () => {
    // We deliberately do not assert anything about *which* lockfile is mixed
    // in here: the temp directory lives outside any project, but the walk-up
    // search may still pick up a lockfile higher in the filesystem on some
    // hosts. The contract this test pins down is that the result is a stable
    // hex hash — the change-detection assertions above cover invalidation.
    const projectDir = makeTmpDir('no-lock-asserted')
    try {
      const config = makeConfig(projectDir)
      const h = await computeGlobalHash(config)
      expect(h).toMatch(/^[0-9a-f]+$/)
      expect(await computeGlobalHash(config)).toBe(h)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})

// ── processBundleEntries ──────────────────────────────────────────────────────

describe('processBundleEntries', () => {
  const mockAdapter = { name: 'mock', extension: '.mock' } as any

  function makeTmpDir(label = 'bundle-entries') {
    const dir = resolve(tmpdir(), `bf-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(dir, { recursive: true })
    // Resolve symlinks (e.g. /tmp → /private/tmp on macOS) so paths match
    // what esbuild's metafile reports.
    return realpathSync(dir)
  }

  function makeConfig(projectDir: string, outDir: string, extra: Record<string, any> = {}) {
    return {
      projectDir,
      adapter: mockAdapter,
      componentDirs: [],
      outDir,
      minify: false,
      contentHash: false,
      clientOnly: false,
      ...extra,
    } as any
  }

  test('returns false and writes nothing when bundleEntries is empty', async () => {
    const outDir = makeTmpDir()
    try {
      const config = makeConfig(outDir, outDir)
      const cache: BuildCache = emptyCache('global-hash')
      const nextEntries: Record<string, CacheEntry> = {}
      const changed = await processBundleEntries(config, outDir, 'components', [], cache, nextEntries, false)
      expect(changed).toBe(false)
      expect(Object.keys(nextEntries).length).toBe(0)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('first build: emits output and records cache entry with deps', async () => {
    const projectDir = makeTmpDir('src')
    const outDir = makeTmpDir('out')
    try {
      const helperPath = resolve(projectDir, 'helper.ts')
      const entryPath = resolve(projectDir, 'entry.ts')
      writeFileSync(helperPath, 'export const FOO = 1\n')
      writeFileSync(entryPath, `import { FOO } from './helper'\nexport const X = FOO + 1\n`)

      const config = makeConfig(projectDir, outDir, {
        bundleEntries: [{ entry: entryPath, outfile: 'entry.js' }],
      })
      const cache: BuildCache = emptyCache('global-hash')
      const nextEntries: Record<string, CacheEntry> = {}

      const changed = await processBundleEntries(config, outDir, 'components', [], cache, nextEntries, false)
      expect(changed).toBe(true)

      const outPath = resolve(outDir, 'entry.js')
      expect(existsSync(outPath)).toBe(true)
      const outContent = readFileSync(outPath, 'utf8')
      // helper.ts should be inlined
      expect(outContent).toContain('FOO')

      const cacheKey = `bundle:${entryPath}`
      expect(nextEntries[cacheKey]).toBeDefined()
      // Entry source + helper should both be tracked as deps.
      expect(nextEntries[cacheKey].deps[entryPath]).toBeDefined()
      expect(nextEntries[cacheKey].deps[helperPath]).toBeDefined()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('keeps @barefootjs/client* external implicitly (no externals configured)', async () => {
    const projectDir = makeTmpDir('src')
    const outDir = makeTmpDir('out')
    try {
      const entryPath = resolve(projectDir, 'entry.ts')
      // A router-entry-style bootstrap importing all three `@barefootjs/client*`
      // specifiers and using each binding, so esbuild can't tree-shake the
      // imports away before we assert they were kept external.
      writeFileSync(
        entryPath,
        [
          `import { createSignal } from '@barefootjs/client'`,
          `import { setupStreaming } from '@barefootjs/client/runtime'`,
          `import { createEffect } from '@barefootjs/client/reactive'`,
          `export const s = createSignal(0)`,
          `setupStreaming()`,
          `createEffect(() => s)`,
        ].join('\n') + '\n',
      )

      const config = makeConfig(projectDir, outDir, {
        bundleEntries: [{ entry: entryPath, outfile: 'entry.js' }],
      })
      const cache: BuildCache = emptyCache('global-hash')
      const nextEntries: Record<string, CacheEntry> = {}

      // allExternals is empty (no `externals` config), yet the bundler must
      // still leave every `@barefootjs/client*` import external rather than
      // trying to inline/resolve them — otherwise the reactive runtime forks.
      const changed = await processBundleEntries(config, outDir, 'components', [], cache, nextEntries, false)
      expect(changed).toBe(true)

      const outContent = readFileSync(resolve(outDir, 'entry.js'), 'utf8')
      // Each specifier must survive verbatim as an external import. Match the
      // closing quote so `@barefootjs/client` doesn't spuriously pass on the
      // `/runtime` and `/reactive` substrings.
      expect(outContent).toMatch(/['"]@barefootjs\/client['"]/)
      expect(outContent).toMatch(/['"]@barefootjs\/client\/runtime['"]/)
      expect(outContent).toMatch(/['"]@barefootjs\/client\/reactive['"]/)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('cache hit: skips rebuild when source and deps unchanged', async () => {
    const projectDir = makeTmpDir('src')
    const outDir = makeTmpDir('out')
    try {
      const entryPath = resolve(projectDir, 'entry.ts')
      writeFileSync(entryPath, 'export const X = 1\n')

      const config = makeConfig(projectDir, outDir, {
        bundleEntries: [{ entry: entryPath, outfile: 'entry.js' }],
      })

      // First build populates the cache.
      const cache1: BuildCache = emptyCache('global-hash')
      const entries1: Record<string, CacheEntry> = {}
      await processBundleEntries(config, outDir, 'components', [], cache1, entries1, false)

      const outPath = resolve(outDir, 'entry.js')
      const mtime1 = statSync(outPath).mtimeMs

      // Second run with the populated cache and no source change should reuse.
      const cache2: BuildCache = { globalHash: 'global-hash', entries: entries1 }
      const entries2: Record<string, CacheEntry> = {}
      await new Promise((r) => setTimeout(r, 20)) // ensure a distinguishable mtime if rebuilt
      const changed = await processBundleEntries(config, outDir, 'components', [], cache2, entries2, false)

      expect(changed).toBe(false)
      const mtime2 = statSync(outPath).mtimeMs
      expect(mtime2).toBe(mtime1)
      // Cache entry carried forward.
      const cacheKey = `bundle:${entryPath}`
      expect(entries2[cacheKey]).toBe(entries1[cacheKey])
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('cache miss: dep change invalidates cache and rebuilds', async () => {
    const projectDir = makeTmpDir('src')
    const outDir = makeTmpDir('out')
    try {
      const helperPath = resolve(projectDir, 'helper.ts')
      const entryPath = resolve(projectDir, 'entry.ts')
      writeFileSync(helperPath, 'export const MSG = "original"\n')
      writeFileSync(entryPath, `import { MSG } from './helper'\nexport const X = MSG\n`)

      const config = makeConfig(projectDir, outDir, {
        bundleEntries: [{ entry: entryPath, outfile: 'entry.js' }],
      })

      // First build.
      const cache1: BuildCache = emptyCache('global-hash')
      const entries1: Record<string, CacheEntry> = {}
      await processBundleEntries(config, outDir, 'components', [], cache1, entries1, false)
      const outBefore = readFileSync(resolve(outDir, 'entry.js'), 'utf8')
      expect(outBefore).toContain('original')

      // Change a transitive dep, not the entry itself.
      writeFileSync(helperPath, 'export const MSG = "updated"\n')

      const cache2: BuildCache = { globalHash: 'global-hash', entries: entries1 }
      const entries2: Record<string, CacheEntry> = {}
      const changed = await processBundleEntries(config, outDir, 'components', [], cache2, entries2, false)
      expect(changed).toBe(true)

      const outAfter = readFileSync(resolve(outDir, 'entry.js'), 'utf8')
      expect(outAfter).toContain('updated')
      expect(outAfter).not.toContain('original')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('cache miss: rebuilds when output file is missing even if cache says fresh', async () => {
    const projectDir = makeTmpDir('src')
    const outDir = makeTmpDir('out')
    try {
      const entryPath = resolve(projectDir, 'entry.ts')
      writeFileSync(entryPath, 'export const X = 1\n')

      const config = makeConfig(projectDir, outDir, {
        bundleEntries: [{ entry: entryPath, outfile: 'entry.js' }],
      })

      // First build.
      const cache1: BuildCache = emptyCache('global-hash')
      const entries1: Record<string, CacheEntry> = {}
      await processBundleEntries(config, outDir, 'components', [], cache1, entries1, false)

      // Simulate a user deleting the output — cache is fresh, file is gone.
      rmSync(resolve(outDir, 'entry.js'))

      const cache2: BuildCache = { globalHash: 'global-hash', entries: entries1 }
      const entries2: Record<string, CacheEntry> = {}
      const changed = await processBundleEntries(config, outDir, 'components', [], cache2, entries2, false)
      expect(changed).toBe(true)
      expect(existsSync(resolve(outDir, 'entry.js'))).toBe(true)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('force: true rebuilds everything regardless of cache', async () => {
    const projectDir = makeTmpDir('src')
    const outDir = makeTmpDir('out')
    try {
      const entryPath = resolve(projectDir, 'entry.ts')
      writeFileSync(entryPath, 'export const X = 1\n')

      const config = makeConfig(projectDir, outDir, {
        bundleEntries: [{ entry: entryPath, outfile: 'entry.js' }],
      })

      const cache1: BuildCache = emptyCache('global-hash')
      const entries1: Record<string, CacheEntry> = {}
      await processBundleEntries(config, outDir, 'components', [], cache1, entries1, false)

      const cache2: BuildCache = { globalHash: 'global-hash', entries: entries1 }
      const entries2: Record<string, CacheEntry> = {}
      const changed = await processBundleEntries(config, outDir, 'components', [], cache2, entries2, true)
      expect(changed).toBe(true)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})

// ── buildRelativeImportRewriter ──────────────────────────────────────────
//
// Re-anchoring guarantees a Hono scaffold's `public/components/ui/<comp>/
// index.tsx` emit type-checks against the same files the user-authored
// `components/ui/<comp>/index.tsx` resolved (#1453). The Hono layout uses
// `outDir = public/` and `componentDirs = ['components']`, so the depth
// shift is +1 across the project root — but the component-to-component
// case must stay at the same relative depth because both ends are
// mirrored.
//
// Note: the rewriter operates on the IMPORT SPECIFIER STRING directly —
// the compiler hands it each `ImportInfo.source` (and matching
// `export … from '…'` block source) one at a time. There's no
// emit-text regex involved, so JSDoc `@example` blocks containing
// import-shaped code, template literals, and other source-level
// incidentals stay untouched.

describe('buildRelativeImportRewriter', () => {
  // Standard Hono scaffold layout. `<root>/components/ui/button/index.tsx`
  // is emitted to `<root>/public/components/ui/button/index.tsx`; the
  // project root contains `<root>/types/index.tsx` (not mirrored).
  const ROOT = '/proj'
  const sourcePath = `${ROOT}/components/ui/button/index.tsx`
  const outputPath = `${ROOT}/public/components/ui/button/index.tsx`
  const componentDirs = [`${ROOT}/components`]
  const templatesOutDir = `${ROOT}/public/components`
  const rewrite = buildRelativeImportRewriter(sourcePath, outputPath, componentDirs, templatesOutDir)

  test('rewrites non-component relative imports to include the extra depth', () => {
    // `../../../types` is correct from the SOURCE position but resolves
    // to the non-existent `public/types/` from the EMIT position — needs
    // one more `..` so it points back at `<root>/types`.
    expect(rewrite('../../../types')).toBe('../../../../types')
  })

  test('preserves sibling-component imports unchanged', () => {
    // Both ends of `../slot` are mirrored under `public/components/ui/`,
    // so the relative form stays valid by construction. Rewriting it
    // would resolve to a wrong location.
    expect(rewrite('../slot')).toBe('../slot')
  })

  test('handles same-dir imports (`./helpers`)', () => {
    expect(rewrite('./helpers')).toBe('./helpers')
  })

  test('component imports nested deeper under `componentDirs`', () => {
    // `../forms/input` resolves to `<root>/components/ui/forms/input`,
    // mirrored at `<root>/public/components/ui/forms/input`. From the
    // emit dir, the relative path is identical to the source's.
    expect(rewrite('../forms/input')).toBe('../forms/input')
  })

  test('non-component path above the project root', () => {
    // `../../../../shared` resolves to `<root>/../shared`. Re-relativised
    // from `<root>/public/components/ui/button/` it becomes
    // `../../../../../shared`.
    expect(rewrite('../../../../shared')).toBe('../../../../../shared')
  })

  test('caller is responsible for guarding bare specifiers', () => {
    // The compiler / `rewriteImportsForTemplate` skip non-`.` paths
    // before calling in — but for direct unit-test use the helper
    // still returns a relative path computed from whatever you pass.
    // This documents the contract.
    const out = rewrite('@barefootjs/jsx')
    // `@barefootjs/jsx` is not under any componentDir and resolves
    // against sourceDir → `<root>/components/ui/button/@barefootjs/jsx`,
    // a clearly-bogus path. Production code never hits this branch.
    expect(out.startsWith('.')).toBe(true)
  })
})

// ── orphan output cleanup ────────────────────────────────────────────────
//
// Regression: piconic-ai/barefootjs#1455 — the cleanup pass walked
// `cache.entries` to discover which outputs a now-deleted source had
// previously emitted. Whenever the cache was wiped (`--force`, or any
// globalHash change from a `bun install` / `barefoot.config.ts` edit)
// `cache.entries` was `{}`, so orphan outputs survived rebuilds and
// accumulated in `outDir`. Cleanup now consults a durable emit ledger
// (`.bfemit.json`) that lives alongside the cache but isn't tied to its
// invalidation lifecycle.

describe('build() orphan output cleanup', () => {
  function makeTmpDir(label = 'orphans') {
    const dir = resolve(tmpdir(), `bf-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(dir, { recursive: true })
    return realpathSync(dir)
  }

  function makeBuildConfig(projectDir: string, outDir: string) {
    return {
      projectDir,
      adapter: new TestAdapter(),
      componentDirs: [resolve(projectDir, 'components')],
      outDir,
      minify: false,
      contentHash: false,
      clientOnly: true,
    }
  }

  // Reproducer of the original bug. A previous build emits a client JS
  // file for a `'use client'` component; the source is then deleted and a
  // `--force` rebuild runs. Before the fix, the orphan `.client.js`
  // survived because the cache was empty under `--force`.
  test('removes orphan outputs after source deletion with --force', async () => {
    const projectDir = makeTmpDir('force-cleanup-src')
    const outDir = makeTmpDir('force-cleanup-out')
    try {
      const componentsDir = resolve(projectDir, 'components')
      mkdirSync(componentsDir, { recursive: true })
      const phantomPath = resolve(componentsDir, 'Phantom.tsx')
      writeFileSync(
        phantomPath,
        `'use client'\n` +
          `import { createSignal } from '@barefootjs/client'\n` +
          `export function Phantom() {\n` +
          `  const [v, setV] = createSignal(0)\n` +
          `  return <button onClick={() => setV(v() + 1)}>{v()}</button>\n` +
          `}\n`,
      )

      const config = makeBuildConfig(projectDir, outDir)
      const firstBuild = await build(config)
      expect(firstBuild.errorCount).toBe(0)

      // Find the emitted client JS — output naming includes a `.client.js`
      // suffix under `clientJsSubdir`. The exact path is taken from the
      // ledger that the build just wrote, so this stays robust against
      // adapter-specific output layouts.
      const ledger = await loadEmitLedger(outDir, projectDir)
      expect(ledger).not.toBeNull()
      const phantomOutputs = ledger!.entries[phantomPath]
      expect(phantomOutputs).toBeDefined()
      expect(phantomOutputs.length).toBeGreaterThan(0)
      for (const rel of phantomOutputs) {
        expect(existsSync(resolve(outDir, rel))).toBe(true)
      }

      // Delete the source and rebuild with --force. The cache file gets
      // discarded by --force, so the pre-fix cleanup pass would see an
      // empty `cache.entries` and skip the orphan deletion.
      unlinkSync(phantomPath)
      const secondBuild = await build(config, { force: true })
      expect(secondBuild.errorCount).toBe(0)

      // The previously-emitted outputs are gone, and the ledger no longer
      // claims ownership of them.
      for (const rel of phantomOutputs) {
        expect(existsSync(resolve(outDir, rel))).toBe(false)
      }
      const ledgerAfter = await loadEmitLedger(outDir, projectDir)
      expect(ledgerAfter!.entries[phantomPath]).toBeUndefined()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  // The other half of the regression: a `bun install` / config edit
  // changes the globalHash between builds, which fires the same
  // `emptyCache(globalHash)` branch as `--force`. The ledger must survive
  // the cache-invalidation hop so the cleanup pass still sees what was on
  // disk before.
  test('removes orphan outputs after source deletion when globalHash changes', async () => {
    const projectDir = makeTmpDir('hash-cleanup-src')
    const outDir = makeTmpDir('hash-cleanup-out')
    try {
      const componentsDir = resolve(projectDir, 'components')
      mkdirSync(componentsDir, { recursive: true })
      const phantomPath = resolve(componentsDir, 'Phantom.tsx')
      writeFileSync(
        phantomPath,
        `'use client'\n` +
          `import { createSignal } from '@barefootjs/client'\n` +
          `export function Phantom() {\n` +
          `  const [v, setV] = createSignal(0)\n` +
          `  return <button onClick={() => setV(v() + 1)}>{v()}</button>\n` +
          `}\n`,
      )
      // Seed a lockfile so the first build picks it up into the global
      // hash; mutating it later flips the hash and forces an
      // `emptyCache(globalHash)`, mirroring the real `bun install` flow.
      const lockPath = resolve(projectDir, 'bun.lock')
      writeFileSync(lockPath, 'lock v1\n')

      const config = makeBuildConfig(projectDir, outDir)
      await build(config)
      const ledger = await loadEmitLedger(outDir, projectDir)
      const phantomOutputs = ledger!.entries[phantomPath]
      expect(phantomOutputs).toBeDefined()

      // Trip the global hash AND delete the source. The cache is loaded
      // but discarded by the globalHash mismatch — only the ledger keeps
      // ownership of the prior outputs.
      writeFileSync(lockPath, 'lock v2\n')
      unlinkSync(phantomPath)
      await build(config)

      for (const rel of phantomOutputs) {
        expect(existsSync(resolve(outDir, rel))).toBe(false)
      }
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  // Migration path: a user upgrading from a pre-ledger CLI version will
  // have a `.buildcache.json` on disk but no `.bfemit.json`. The first
  // post-upgrade build must still prune their pre-existing orphans by
  // bootstrapping the ledger from the cache file. Without this, the only
  // way to clean up would be a manual `rm -rf`.
  test('bootstraps from .buildcache.json when no ledger exists yet', async () => {
    const projectDir = makeTmpDir('bootstrap-src')
    const outDir = makeTmpDir('bootstrap-out')
    try {
      const componentsDir = resolve(projectDir, 'components')
      mkdirSync(componentsDir, { recursive: true })
      const phantomPath = resolve(componentsDir, 'Phantom.tsx')
      writeFileSync(
        phantomPath,
        `'use client'\n` +
          `import { createSignal } from '@barefootjs/client'\n` +
          `export function Phantom() {\n` +
          `  const [v, setV] = createSignal(0)\n` +
          `  return <button>{v()}</button>\n` +
          `}\n`,
      )

      const config = makeBuildConfig(projectDir, outDir)
      await build(config)

      // Simulate the upgrade scenario: cache file exists from the old CLI
      // version, but ledger file does not.
      const ledger = await loadEmitLedger(outDir, projectDir)
      const phantomOutputs = ledger!.entries[phantomPath]
      rmSync(resolve(outDir, '.bfemit.json'))
      expect(await loadCache(outDir)).not.toBeNull()

      // Delete the source — under the old behavior this would orphan
      // outputs on the next build. The new build bootstraps the missing
      // ledger from the cache file and prunes them.
      unlinkSync(phantomPath)
      await build(config)

      for (const rel of phantomOutputs) {
        expect(existsSync(resolve(outDir, rel))).toBe(false)
      }
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  // A `--force` build that hits a compile error on a previously-good
  // component must NOT delete that component's previously-emitted
  // outputs. Before the fix, `--force` reset `cache.entries` to empty,
  // so the failure-handler's cached-entry preservation didn't fire,
  // and the ledger-driven cleanup pass then orphaned the prior outputs
  // — turning a single transient compile error into a broken-build
  // cascade. See PR #1469 review.
  test('preserves prior outputs when --force rebuild hits a compile error', async () => {
    const projectDir = makeTmpDir('failure-preserve-src')
    const outDir = makeTmpDir('failure-preserve-out')
    try {
      const componentsDir = resolve(projectDir, 'components')
      mkdirSync(componentsDir, { recursive: true })
      const counterPath = resolve(componentsDir, 'Counter.tsx')
      // Compiles cleanly on the first build.
      const goodSrc =
        `'use client'\n` +
        `import { createSignal } from '@barefootjs/client'\n` +
        `export function Counter() {\n` +
        `  const [v, setV] = createSignal(0)\n` +
        `  return <button onClick={() => setV(v() + 1)}>{v()}</button>\n` +
        `}\n`
      writeFileSync(counterPath, goodSrc)

      const config = makeBuildConfig(projectDir, outDir)
      const firstBuild = await build(config)
      expect(firstBuild.errorCount).toBe(0)

      const ledger = await loadEmitLedger(outDir, projectDir)
      const counterOutputs = ledger!.entries[counterPath]
      expect(counterOutputs).toBeDefined()
      expect(counterOutputs.length).toBeGreaterThan(0)
      for (const rel of counterOutputs) {
        expect(existsSync(resolve(outDir, rel))).toBe(true)
      }

      // Break the source. An inline JSX callback capturing a loop
      // variable from the surrounding scope trips BF023 — a real
      // analyzer-emitted error that flows through `result.errors` and
      // returns `kind: 'error'` from compileEntry. The prior outputs
      // on disk are the build's last-known-good emit and must survive
      // — the dev's browser may still be requesting them.
      writeFileSync(
        counterPath,
        `'use client'\n` +
          `import { createSignal } from '@barefootjs/client'\n` +
          `export function Counter() {\n` +
          `  const arr = [1, 2, 3]\n` +
          `  return <div>{arr.map(item => <button onClick={() => console.log(item)}>{item}</button>)}</div>\n` +
          `}\n`,
      )
      const failingBuild = await build(config, { force: true })
      expect(failingBuild.errorCount).toBeGreaterThan(0)

      for (const rel of counterOutputs) {
        expect(existsSync(resolve(outDir, rel))).toBe(true)
      }
      // Ownership claim survives in the ledger too, so the next build
      // (whether it succeeds, fails again, or the user actually
      // deletes the source) keeps the prune pass authoritative.
      const ledgerAfter = await loadEmitLedger(outDir, projectDir)
      expect(ledgerAfter!.entries[counterPath]).toEqual(counterOutputs)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  // Defence-in-depth: `.bfemit.json` is an on-disk input that the build
  // re-reads every run. If a corrupted or tampered file claimed
  // ownership of a path that escapes `outDir` (absolute path, `../`
  // traversal), the cleanup pass must refuse to unlink it. The ledger
  // only ever owns files the build itself emitted, and those are
  // always under `outDir`.
  test('refuses to unlink paths that escape outDir', async () => {
    const projectDir = makeTmpDir('containment-src')
    const outDir = makeTmpDir('containment-out')
    // The "victim" lives in a separate tmp dir so a buggy cleanup pass
    // would actually delete a real file. Stays out of both projectDir
    // and outDir.
    const victimDir = makeTmpDir('containment-victim')
    const victimPath = resolve(victimDir, 'precious.txt')
    writeFileSync(victimPath, 'must survive\n')
    try {
      mkdirSync(resolve(projectDir, 'components'), { recursive: true })
      const config = makeBuildConfig(projectDir, outDir)
      // Initial build seeds the ledger so save logic is exercised.
      await build(config)

      // Hand-craft a ledger pointing at a traversal target and an
      // absolute path. Both should be rejected.
      const traversal = relative(outDir, victimPath)
      writeFileSync(
        resolve(outDir, '.bfemit.json'),
        JSON.stringify({
          version: 1,
          entries: {
            '/abs/Tampered.tsx': [traversal, victimPath],
          },
        }),
      )

      const warnings: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')) }
      try {
        await build(config)
      } finally {
        console.warn = originalWarn
      }

      expect(existsSync(victimPath)).toBe(true)
      const refused = warnings.filter(w => w.includes('out-of-tree'))
      expect(refused.length).toBeGreaterThanOrEqual(1)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
      rmSync(victimDir, { recursive: true, force: true })
    }
  })
})

// ── .assetsignore for Cloudflare Workers ─────────────────────────────────
//
// Regression: piconic-ai/barefootjs#1651 — `bf build` writes browser-served
// and server/build-only files into the same outDir, so a Workers
// `assets.directory` deploy uploaded the SSR `.tsx` templates and build
// internals as public assets. The build now maintains a `.assetsignore`
// (only when a wrangler config marks the project as Workers-bound).

describe('build() Cloudflare Workers .assetsignore', () => {
  function makeTmpDir(label = 'assetsignore') {
    const dir = resolve(tmpdir(), `bf-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(dir, { recursive: true })
    return realpathSync(dir)
  }

  function makeConfig(projectDir: string, outDir: string) {
    return {
      projectDir,
      adapter: new TestAdapter(),
      componentDirs: [resolve(projectDir, 'components')],
      outDir,
      minify: false,
      contentHash: false,
      clientOnly: false,
    }
  }

  function writeCounter(projectDir: string) {
    const componentsDir = resolve(projectDir, 'components')
    mkdirSync(componentsDir, { recursive: true })
    writeFileSync(
      resolve(componentsDir, 'Counter.tsx'),
      `'use client'\n` +
        `import { createSignal } from '@barefootjs/client'\n` +
        `export function Counter() {\n` +
        `  const [v, setV] = createSignal(0)\n` +
        `  return <button onClick={() => setV(v() + 1)}>{v()}</button>\n` +
        `}\n`,
    )
  }

  test('emits .assetsignore listing server-only outputs when a wrangler config is present', async () => {
    const projectDir = makeTmpDir('wrangler-src')
    const outDir = makeTmpDir('wrangler-out')
    try {
      writeCounter(projectDir)
      writeFileSync(resolve(projectDir, 'wrangler.toml'), 'name = "demo"\n')

      const result = await build(makeConfig(projectDir, outDir))
      expect(result.errorCount).toBe(0)

      const ignorePath = resolve(outDir, ASSETS_IGNORE_FILENAME)
      expect(existsSync(ignorePath)).toBe(true)
      const raw = readFileSync(ignorePath, 'utf8')

      // Server/build-only outputs are listed.
      expect(raw).toContain('.dev/')
      expect(raw).toContain('.bfemit.json')
      expect(raw).toContain('.buildcache.json')
      expect(raw).toContain('components/manifest.json')

      // The SSR template (taken from the manifest) is listed; the
      // browser-served client JS for the same component is not.
      const templateRel = result.manifest.Counter.markedTemplate
      expect(templateRel).toBeTruthy()
      expect(raw).toContain(templateRel)
      const clientRel = result.manifest.Counter.clientJs
      expect(clientRel).toBeTruthy()
      expect(raw.split('\n')).not.toContain(clientRel)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('does not emit .assetsignore for a non-Workers project', async () => {
    const projectDir = makeTmpDir('no-wrangler-src')
    const outDir = makeTmpDir('no-wrangler-out')
    try {
      writeCounter(projectDir)

      const result = await build(makeConfig(projectDir, outDir))
      expect(result.errorCount).toBe(0)
      expect(existsSync(resolve(outDir, ASSETS_IGNORE_FILENAME))).toBe(false)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
