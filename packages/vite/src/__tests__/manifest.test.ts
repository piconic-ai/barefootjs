import { describe, test, expect } from 'bun:test'
import type { Manifest } from 'vite'
import { joinBaseAndFile, resolvePreloadAssets, resolveScriptAssets } from '../manifest.ts'

describe('joinBaseAndFile', () => {
  test('joins a trailing-slash base with the manifest file path', () => {
    expect(joinBaseAndFile('/static/build/', 'assets/Counter-abc123.js')).toBe(
      '/static/build/assets/Counter-abc123.js',
    )
  })

  test('joins a base without a trailing slash', () => {
    expect(joinBaseAndFile('/static/build', 'assets/Counter-abc123.js')).toBe(
      '/static/build/assets/Counter-abc123.js',
    )
  })

  test('treats "./" and "" as no-prefix', () => {
    expect(joinBaseAndFile('./', 'assets/Counter-abc123.js')).toBe('assets/Counter-abc123.js')
    expect(joinBaseAndFile('', 'assets/Counter-abc123.js')).toBe('assets/Counter-abc123.js')
  })

  test('works with a full absolute-origin base', () => {
    expect(joinBaseAndFile('https://cdn.example.com/app/', 'assets/x.js')).toBe(
      'https://cdn.example.com/app/assets/x.js',
    )
  })
})

describe('resolveScriptAssets', () => {
  const manifest: Manifest = {
    'src/components/Counter.tsx': {
      file: 'assets/Counter-abc123.js',
      isEntry: true,
      imports: ['_shared.js'],
    },
    '_shared.js': {
      file: 'assets/shared-def456.js',
    },
  }

  test('resolves the single entry URL for a known manifest key', () => {
    expect(resolveScriptAssets(manifest, 'src/components/Counter.tsx', '/static/build/')).toEqual([
      '/static/build/assets/Counter-abc123.js',
    ])
  })

  test('returns [] for a manifest key with no entry — the server-only-component case', () => {
    expect(resolveScriptAssets(manifest, 'src/components/Greeting.tsx', '/static/build/')).toEqual([])
  })

  test('does NOT include shared-chunk imports — only the entry\'s own file', () => {
    const assets = resolveScriptAssets(manifest, 'src/components/Counter.tsx', '/static/build/')
    expect(assets).toHaveLength(1)
    expect(assets[0]).not.toContain('shared-def456')
  })
})

describe('resolvePreloadAssets', () => {
  const manifest: Manifest = {
    'src/components/TodoApp.tsx': {
      file: 'assets/TodoApp-CtatJ74J.js',
      isEntry: true,
      imports: ['_index.js', 'src/components/TodoItem.tsx'],
    },
    'src/components/TodoItem.tsx': {
      file: 'assets/TodoItem-abc123.js',
      imports: ['_index.js'],
    },
    '_index.js': {
      file: 'assets/index-xrhpkKRC.js',
    },
  }

  test('walks entry.imports transitively, excluding the entry\'s own file', () => {
    const assets = resolvePreloadAssets(manifest, 'src/components/TodoApp.tsx', '/static/build/')
    expect(assets).not.toContain('/static/build/assets/TodoApp-CtatJ74J.js')
    expect(assets).toContain('/static/build/assets/index-xrhpkKRC.js')
    expect(assets).toContain('/static/build/assets/TodoItem-abc123.js')
  })

  test('is breadth-first from the entry: direct imports sort before their own transitive imports', () => {
    const assets = resolvePreloadAssets(manifest, 'src/components/TodoApp.tsx', '/static/build/')
    // Entry.imports = ['_index.js', 'TodoItem.tsx'] — both direct, so both
    // precede TodoItem's own import of `_index.js` (already visited, so
    // deduped, not re-appended at the deeper level).
    expect(assets).toEqual([
      '/static/build/assets/index-xrhpkKRC.js',
      '/static/build/assets/TodoItem-abc123.js',
    ])
  })

  test('dedupes by manifest key: a chunk reachable via two paths appears once', () => {
    const diamond: Manifest = {
      'src/components/Parent.tsx': {
        file: 'assets/Parent.js',
        imports: ['src/components/ChildA.tsx', 'src/components/ChildB.tsx'],
      },
      'src/components/ChildA.tsx': {
        file: 'assets/ChildA.js',
        imports: ['_shared.js'],
      },
      'src/components/ChildB.tsx': {
        file: 'assets/ChildB.js',
        imports: ['_shared.js'],
      },
      '_shared.js': { file: 'assets/shared.js' },
    }
    const assets = resolvePreloadAssets(diamond, 'src/components/Parent.tsx', '/static/build/')
    expect(assets.filter((a) => a === '/static/build/assets/shared.js')).toHaveLength(1)
  })

  test('is cycle-safe: an import cycle does not loop forever', () => {
    const cyclic: Manifest = {
      'src/components/A.tsx': {
        file: 'assets/A.js',
        imports: ['src/components/B.tsx'],
      },
      'src/components/B.tsx': {
        file: 'assets/B.js',
        imports: ['src/components/A.tsx'],
      },
    }
    const assets = resolvePreloadAssets(cyclic, 'src/components/A.tsx', '/static/build/')
    expect(assets).toEqual(['/static/build/assets/B.js'])
  })

  test('returns [] for a manifest key with no entry', () => {
    expect(resolvePreloadAssets(manifest, 'src/components/Missing.tsx', '/static/build/')).toEqual([])
  })

  test('does NOT follow dynamicImports — only static imports are walked', () => {
    const withDynamic: Manifest = {
      'src/components/Parent.tsx': {
        file: 'assets/Parent.js',
        imports: ['_shared.js'],
        dynamicImports: ['src/components/LazyChild.tsx'],
      },
      '_shared.js': { file: 'assets/shared.js' },
      'src/components/LazyChild.tsx': { file: 'assets/LazyChild.js' },
    }
    const assets = resolvePreloadAssets(withDynamic, 'src/components/Parent.tsx', '/static/build/')
    expect(assets).toEqual(['/static/build/assets/shared.js'])
    expect(assets).not.toContain('/static/build/assets/LazyChild.js')
  })
})
