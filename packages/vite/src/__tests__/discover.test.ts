import { describe, test, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildChildNameIndex, hasUseClientDirective, discoverComponentFiles, discoverComponents } from '../discover.ts'

describe('hasUseClientDirective', () => {
  test('detects a leading double-quoted directive', () => {
    expect(hasUseClientDirective('"use client"\nexport function A() {}')).toBe(true)
  })

  test('detects a leading single-quoted directive', () => {
    expect(hasUseClientDirective("'use client'\nexport function A() {}")).toBe(true)
  })

  test('skips leading block comments before the directive', () => {
    expect(hasUseClientDirective('/* c */\n\'use client\'\nexport function A() {}')).toBe(true)
  })

  test('skips leading line comments before the directive', () => {
    expect(hasUseClientDirective('// c\n\'use client\'\nexport function A() {}')).toBe(true)
  })

  test('returns false for a server-only file', () => {
    expect(hasUseClientDirective('export function A() { return <div/> }')).toBe(false)
  })

  test('returns false when the directive is not the first statement', () => {
    expect(hasUseClientDirective('const x = 1\n\'use client\'')).toBe(false)
  })
})

describe('discoverComponentFiles', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('finds nested .tsx files and skips test/spec/preview variants', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-discover-'))
    await mkdir(join(dir, 'nested'), { recursive: true })
    await writeFile(join(dir, 'A.tsx'), 'export function A() {}')
    await writeFile(join(dir, 'A.test.tsx'), 'export function A() {}')
    await writeFile(join(dir, 'A.spec.tsx'), 'export function A() {}')
    await writeFile(join(dir, 'A.preview.tsx'), 'export function A() {}')
    await writeFile(join(dir, 'nested', 'B.tsx'), 'export function B() {}')
    await writeFile(join(dir, 'not-a-component.ts'), 'export const x = 1')

    const found = await discoverComponentFiles(dir)
    const basenames = found.map(f => f.slice(dir.length + 1)).sort()
    expect(basenames).toEqual(['A.tsx', 'nested/B.tsx'])
  })

  test('returns an empty array for a missing directory', async () => {
    const found = await discoverComponentFiles(join(tmpdir(), 'does-not-exist-barefoot-vite'))
    expect(found).toEqual([])
  })
})

describe('discoverComponents', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('classifies each discovered file as client or server-only', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-discover-classify-'))
    await writeFile(join(dir, 'Client.tsx'), '\'use client\'\nexport function Client() {}')
    await writeFile(join(dir, 'Server.tsx'), 'export function Server() {}')

    const found = await discoverComponents([dir], p => Bun.file(p).text())
    const byName = Object.fromEntries(found.map(f => [f.absPath.slice(dir.length + 1), f.isClient]))
    expect(byName['Client.tsx']).toBe(true)
    expect(byName['Server.tsx']).toBe(false)
  })
})

describe('buildChildNameIndex', () => {
  test('keys \'use client\' files by their exported component names', () => {
    const index = buildChildNameIndex([
      { absPath: '/proj/components/TodoItem.tsx', isClient: true, exportedComponents: ['TodoItem'] },
      { absPath: '/proj/blog/LikeButton.tsx', isClient: true, exportedComponents: ['LikeButton'] },
    ])
    expect(index.get('TodoItem')).toBe('/proj/components/TodoItem.tsx')
    expect(index.get('LikeButton')).toBe('/proj/blog/LikeButton.tsx')
  })

  // The regression this index was rebuilt for. Keyed on the basename, an
  // `index.tsx` exporting several components resolved only as `index`, so
  // every `@bf-child:<Name>` marker into it fell through to the no-op
  // module and the child silently never hydrated.
  test('a file exporting several components is reachable by EVERY name, not by its basename', () => {
    const index = buildChildNameIndex([
      {
        absPath: '/proj/components/icon/index.tsx',
        isClient: true,
        exportedComponents: ['CopyIcon', 'CheckIcon'],
      },
    ])
    expect(index.get('CopyIcon')).toBe('/proj/components/icon/index.tsx')
    expect(index.get('CheckIcon')).toBe('/proj/components/icon/index.tsx')
    expect(index.has('index')).toBe(false)
  })

  test('first writer wins on a duplicate name, so an earlier components dir shadows a later one', () => {
    const index = buildChildNameIndex([
      { absPath: '/proj/a/Button.tsx', isClient: true, exportedComponents: ['Button'] },
      { absPath: '/proj/b/Button.tsx', isClient: true, exportedComponents: ['Button'] },
    ])
    expect(index.get('Button')).toBe('/proj/a/Button.tsx')
  })

  test('falls back to the basename when no exports were parsed, keeping the old convention working', () => {
    const index = buildChildNameIndex([
      { absPath: '/proj/components/Widget.tsx', isClient: true, exportedComponents: [] },
    ])
    expect(index.get('Widget')).toBe('/proj/components/Widget.tsx')
  })

  test('excludes server-only files — a @bf-child marker only ever names an interactive component', () => {
    const index = buildChildNameIndex([
      { absPath: '/proj/components/ServerOnly.tsx', isClient: false, exportedComponents: [] },
    ])
    expect(index.has('ServerOnly')).toBe(false)
  })

  test('accepts a .ts extension too', () => {
    const index = buildChildNameIndex([
      { absPath: '/proj/components/Widget.ts', isClient: true, exportedComponents: ['Widget'] },
    ])
    expect(index.get('Widget')).toBe('/proj/components/Widget.ts')
  })
})
