import { describe, test, expect } from 'bun:test'
import { mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'
import {
  ALWAYS_KEEP_RUNTIME_EXPORTS,
  buildRuntimeBundle,
  collectUsedRuntimeExports,
  isBarefootClientSpecifier,
  isEmittedRuntimeSpecifier,
  mergeRuntimeImportCollections,
} from '../lib/runtime-treeshake'

// ── isBarefootClientSpecifier ────────────────────────────────────────────

describe('isBarefootClientSpecifier', () => {
  test('matches the bare package and every subpath', () => {
    expect(isBarefootClientSpecifier('@barefootjs/client')).toBe(true)
    expect(isBarefootClientSpecifier('@barefootjs/client/runtime')).toBe(true)
    expect(isBarefootClientSpecifier('@barefootjs/client/reactive')).toBe(true)
    expect(isBarefootClientSpecifier('@barefootjs/client/build')).toBe(true)
  })

  test('does not match unrelated or partially-overlapping specifiers', () => {
    expect(isBarefootClientSpecifier('@barefootjs/chart')).toBe(false)
    expect(isBarefootClientSpecifier('@barefootjs/client-extra')).toBe(false)
    expect(isBarefootClientSpecifier('some-other-package')).toBe(false)
  })
})

// ── isEmittedRuntimeSpecifier ────────────────────────────────────────────

describe('isEmittedRuntimeSpecifier', () => {
  test('matches the bare package and every subpath (like isBarefootClientSpecifier)', () => {
    expect(isEmittedRuntimeSpecifier('@barefootjs/client')).toBe(true)
    expect(isEmittedRuntimeSpecifier('@barefootjs/client/runtime')).toBe(true)
    expect(isEmittedRuntimeSpecifier('@barefootjs/client/reactive')).toBe(true)
  })

  test('matches the emitted relative barefoot.js path at any nesting depth', () => {
    expect(isEmittedRuntimeSpecifier('./barefoot.js')).toBe(true)
    expect(isEmittedRuntimeSpecifier('../barefoot.js')).toBe(true)
    expect(isEmittedRuntimeSpecifier('../../barefoot.js')).toBe(true)
    expect(isEmittedRuntimeSpecifier('../../../barefoot.js')).toBe(true)
  })

  test('does not match unrelated or partially-overlapping specifiers', () => {
    expect(isEmittedRuntimeSpecifier('@barefootjs/chart')).toBe(false)
    expect(isEmittedRuntimeSpecifier('@barefootjs/client-extra')).toBe(false)
    expect(isEmittedRuntimeSpecifier('some-other-package')).toBe(false)
    // A relative path that merely ends in a differently-named file, or that
    // has extra path segments after barefoot.js, is not the runtime bundle.
    expect(isEmittedRuntimeSpecifier('./barefoot.css')).toBe(false)
    expect(isEmittedRuntimeSpecifier('./my-barefoot.js')).toBe(false)
    expect(isEmittedRuntimeSpecifier('../barefoot.js/index.js')).toBe(false)
    expect(isEmittedRuntimeSpecifier('barefoot.js')).toBe(false)
  })
})

// ── collectUsedRuntimeExports ────────────────────────────────────────────

describe('collectUsedRuntimeExports', () => {
  test('collects named imports from the bare package specifier', () => {
    const result = collectUsedRuntimeExports(
      `import { createSignal, createEffect } from '@barefootjs/client'\ncreateSignal(0)\n`
    )
    expect([...result.names].sort()).toEqual(['createEffect', 'createSignal'])
    expect(result.unsafe).toBe(false)
  })

  test('collects named imports from /runtime and /reactive subpaths', () => {
    const a = collectUsedRuntimeExports(`import { hydrate } from '@barefootjs/client/runtime'\n`)
    const b = collectUsedRuntimeExports(`import { createMemo } from '@barefootjs/client/reactive'\n`)
    expect([...a.names]).toEqual(['hydrate'])
    expect([...b.names]).toEqual(['createMemo'])
  })

  test('collects named imports from the emitted relative ../barefoot.js path (warm-cache rebuild, #2309)', () => {
    // A cached component's on-disk client JS was already rewritten by step 6c
    // on a prior build to import the runtime via a relative `../barefoot.js`
    // path. The collector must still see its runtime imports — otherwise a
    // warm-cache rebuild drops exports only cached components use.
    const result = collectUsedRuntimeExports(
      `import { $, $t, __bfSlot, createComponent, hydrate } from '../barefoot.js'\nhydrate('Reader', () => {})\n`
    )
    expect([...result.names].sort()).toEqual(['$', '$t', '__bfSlot', 'createComponent', 'hydrate'])
    expect(result.unsafe).toBe(false)
  })

  test('collects named imports from a nested ./barefoot.js path', () => {
    const result = collectUsedRuntimeExports(
      `import { insert } from './barefoot.js'\n`
    )
    expect([...result.names]).toEqual(['insert'])
  })

  test('a minified cached file (no whitespace) importing from ../barefoot.js still collects names', () => {
    const result = collectUsedRuntimeExports(
      `import{__bfSlot as s,hydrate as h}from"../barefoot.js";h("X",()=>{});\n`
    )
    expect([...result.names].sort()).toEqual(['__bfSlot', 'hydrate'])
    expect(result.unsafe).toBe(false)
  })

  test('does not false-match a relative path that is not the runtime bundle', () => {
    const result = collectUsedRuntimeExports(
      `import { helper } from './barefoot-utils.js'\nimport { other } from './lib/barefoot.js/mod.js'\n`
    )
    expect(result.names.size).toBe(0)
    expect(result.unsafe).toBe(false)
  })

  test('resolves aliased named imports to the original (imported) name', () => {
    const result = collectUsedRuntimeExports(
      `import { createSignal as sig } from '@barefootjs/client'\n`
    )
    expect([...result.names]).toEqual(['createSignal'])
  })

  test('handles a multi-line import clause with a trailing comma', () => {
    const code = [
      `import {`,
      `  createSignal,`,
      `  createEffect,`,
      `  onMount,`,
      `} from '@barefootjs/client'`,
      ``,
    ].join('\n')
    expect([...collectUsedRuntimeExports(code).names].sort()).toEqual(['createEffect', 'createSignal', 'onMount'])
  })

  test('ignores `import type` (type-only imports contribute nothing at runtime)', () => {
    const result = collectUsedRuntimeExports(
      `import type { Signal } from '@barefootjs/client'\n`
    )
    expect(result.names.size).toBe(0)
    expect(result.unsafe).toBe(false)
  })

  test('ignores individually-marked type-only named bindings', () => {
    const result = collectUsedRuntimeExports(
      `import { createSignal, type Signal } from '@barefootjs/client'\n`
    )
    expect([...result.names]).toEqual(['createSignal'])
  })

  test('does not false-match a specifier that only appears inside a comment', () => {
    const result = collectUsedRuntimeExports(
      `// import { createEffect } from '@barefootjs/client'\nconst x = 1\n`
    )
    expect(result.names.size).toBe(0)
    expect(result.unsafe).toBe(false)
  })

  test('does not false-match a specifier that only appears inside a string literal', () => {
    const result = collectUsedRuntimeExports(
      `const snippet = "import { createEffect } from '@barefootjs/client'"\n`
    )
    expect(result.names.size).toBe(0)
    expect(result.unsafe).toBe(false)
  })

  test('side-effect import contributes no names and is not unsafe', () => {
    const result = collectUsedRuntimeExports(`import '@barefootjs/client/runtime'\n`)
    expect(result.names.size).toBe(0)
    expect(result.unsafe).toBe(false)
  })

  test('flags a namespace import as unsafe', () => {
    const result = collectUsedRuntimeExports(`import * as bf from '@barefootjs/client'\nbf.createSignal(0)\n`)
    expect(result.unsafe).toBe(true)
    expect(result.reasons[0]).toContain('namespace import')
  })

  test('flags a default import as unsafe', () => {
    const result = collectUsedRuntimeExports(`import bf from '@barefootjs/client'\n`)
    expect(result.unsafe).toBe(true)
    expect(result.reasons[0]).toContain('default import')
  })

  test('flags a default import combined with named bindings as unsafe (and still collects the named ones)', () => {
    const result = collectUsedRuntimeExports(`import bf, { createSignal } from '@barefootjs/client'\n`)
    expect(result.unsafe).toBe(true)
    expect([...result.names]).toEqual(['createSignal'])
  })

  test('flags a dynamic import() of the runtime as unsafe', () => {
    const result = collectUsedRuntimeExports(`async function f() { const m = await import('@barefootjs/client/runtime'); m.hydrate() }\n`)
    expect(result.unsafe).toBe(true)
    expect(result.reasons[0]).toContain('dynamic import')
  })

  test('ignores imports from unrelated packages entirely', () => {
    const result = collectUsedRuntimeExports(
      `import { z } from 'zod'\nimport { Button } from '@ui/components/ui/button'\n`
    )
    expect(result.names.size).toBe(0)
    expect(result.unsafe).toBe(false)
  })

  test('a source with no @barefootjs/client text short-circuits cleanly', () => {
    const result = collectUsedRuntimeExports(`export function f() { return 1 }\n`)
    expect(result.names.size).toBe(0)
    expect(result.unsafe).toBe(false)
  })
})

// ── mergeRuntimeImportCollections ────────────────────────────────────────

describe('mergeRuntimeImportCollections', () => {
  test('unions names across collections', () => {
    const a = collectUsedRuntimeExports(`import { createSignal } from '@barefootjs/client'\n`)
    const b = collectUsedRuntimeExports(`import { createEffect } from '@barefootjs/client'\n`)
    const merged = mergeRuntimeImportCollections([a, b])
    expect([...merged.names].sort()).toEqual(['createEffect', 'createSignal'])
    expect(merged.unsafe).toBe(false)
  })

  test('propagates unsafe + reasons from any collection', () => {
    const safe = collectUsedRuntimeExports(`import { createSignal } from '@barefootjs/client'\n`)
    const unsafe = collectUsedRuntimeExports(`import * as bf from '@barefootjs/client'\n`)
    const merged = mergeRuntimeImportCollections([safe, unsafe])
    expect(merged.unsafe).toBe(true)
    expect(merged.reasons.length).toBe(1)
    expect([...merged.names]).toEqual(['createSignal'])
  })

  test('merging zero collections is safe and empty', () => {
    const merged = mergeRuntimeImportCollections([])
    expect(merged.names.size).toBe(0)
    expect(merged.unsafe).toBe(false)
  })
})

// ── ALWAYS_KEEP_RUNTIME_EXPORTS ──────────────────────────────────────────

describe('ALWAYS_KEEP_RUNTIME_EXPORTS', () => {
  test('covers the documented public mount API', () => {
    for (const name of ['render', 'hydrate', 'flushHydration', 'rehydrateAll', 'rehydrateScope', 'disposeScope', 'setupStreaming']) {
      expect(ALWAYS_KEEP_RUNTIME_EXPORTS).toContain(name)
    }
  })
})

// ── buildRuntimeBundle ───────────────────────────────────────────────────

describe('buildRuntimeBundle', () => {
  function makeTmpDir(label: string) {
    const dir = resolve(tmpdir(), `bf-test-runtime-bundle-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(dir, { recursive: true })
    return realpathSync(dir)
  }

  // A tiny synthetic "runtime dist" with several independent, side-effect-free
  // top-level exports — enough to prove esbuild's DCE drops unreferenced ones
  // without needing the real (much larger) @barefootjs/client dist file.
  function writeFixtureRuntime(dir: string): string {
    const path = resolve(dir, 'fixture-runtime.js')
    writeFileSync(
      path,
      [
        `export function keepMe() { return 'kept-fn-body-marker' }`,
        `export function alsoKeepMe() { return 'also-kept-fn-body-marker' }`,
        `export function dropMe() { return 'dropped-fn-body-marker' }`,
        `export function alsoDropMe() { return 'also-dropped-fn-body-marker' }`,
        ``,
      ].join('\n'),
    )
    return path
  }

  test('keeps only the requested exports (and drops the rest via DCE)', async () => {
    const dir = makeTmpDir('basic')
    try {
      const entrySource = writeFixtureRuntime(dir)
      const bundled = await buildRuntimeBundle({
        entrySource,
        keepNames: ['keepMe', 'alsoKeepMe'],
        minify: false,
      })
      expect(bundled).toContain('kept-fn-body-marker')
      expect(bundled).toContain('also-kept-fn-body-marker')
      expect(bundled).not.toContain('dropped-fn-body-marker')
      expect(bundled).not.toContain('also-dropped-fn-body-marker')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('minify: true minifies whitespace/syntax/identifiers but keeps the exported binding name stable', async () => {
    const dir = makeTmpDir('minify')
    try {
      const entrySource = writeFixtureRuntime(dir)
      const unminified = await buildRuntimeBundle({
        entrySource,
        keepNames: ['keepMe'],
        minify: false,
      })
      const bundled = await buildRuntimeBundle({
        entrySource,
        keepNames: ['keepMe'],
        minify: true,
      })
      expect(bundled).toContain('kept-fn-body-marker')
      // The minified bundle is meaningfully smaller (whitespace + internal
      // identifiers minified) than the unminified one...
      expect(bundled.length).toBeLessThan(unminified.length)
      // ...yet the *exported* binding name is untouched — esbuild never
      // renames a re-export's public name, only its internal implementation
      // — so a consumer's `import { keepMe } from './barefoot.js'` still
      // resolves correctly regardless of internal minification.
      expect(bundled).toMatch(/\bkeepMe\b/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('writes no temp entry file at all (stdin-fed entry)', async () => {
    // The entry is fed to esbuild via stdin + resolveDir (also the
    // cross-platform fix: no absolute path inside a module specifier), so
    // the dist directory must stay untouched apart from the fixture itself.
    const dir = makeTmpDir('cleanup')
    try {
      const entrySource = writeFixtureRuntime(dir)
      await buildRuntimeBundle({ entrySource, keepNames: ['keepMe'], minify: false })
      const { readdirSync } = await import('fs')
      const entries = readdirSync(dir)
      expect(entries).toEqual([entrySource.split('/').pop()])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('rejects an empty keep set rather than emitting a syntactically-invalid entry', async () => {
    const dir = makeTmpDir('empty')
    try {
      const entrySource = writeFixtureRuntime(dir)
      await expect(
        buildRuntimeBundle({ entrySource, keepNames: [], minify: false })
      ).rejects.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
