import { describe, test, expect } from 'bun:test'
import {
  hasUseClientDirective,
  discoverComponentFiles,
  generateHash,
  resolveBuildConfigFromTs,
  collectRelativeImportDeps,
} from '../lib/build'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
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
