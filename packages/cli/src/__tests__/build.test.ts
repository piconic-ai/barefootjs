import { describe, test, expect } from 'bun:test'
import {
  hasUseClientDirective,
  discoverComponentFiles,
  generateHash,
  resolveBuildConfigFromTs,
  collectRelativeImportDeps,
  vendorChunkFilename,
  processExternals,
  processBundleEntries,
  computeGlobalHash,
} from '../lib/build'
import { emptyCache, type BuildCache, type CacheEntry } from '../lib/build-cache'
import { mkdirSync, writeFileSync, rmSync, existsSync, statSync, readFileSync, realpathSync } from 'fs'
import { resolve } from 'path'
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
