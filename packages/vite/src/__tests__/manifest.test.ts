import { describe, test, expect } from 'bun:test'
import type { Manifest } from 'vite'
import { joinBaseAndFile, resolveScriptAssets } from '../manifest.ts'

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
