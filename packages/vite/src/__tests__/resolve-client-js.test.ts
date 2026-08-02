import { describe, test, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveClientJsSpecifier } from '../resolve-client-js.ts'

describe('resolveClientJsSpecifier', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('maps a relative ./foo.client.js specifier back to ./foo.tsx', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-resolve-'))
    await writeFile(join(dir, 'signals.tsx'), '\'use client\'\nexport const x = 1')
    const importer = join(dir, 'consumer.tsx')

    const resolved = resolveClientJsSpecifier('./signals.client.js', importer)
    expect(resolved).toBe(join(dir, 'signals.tsx'))
  })

  test('maps a ../ relative specifier from a nested importer', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-resolve-'))
    await mkdir(join(dir, 'nested'), { recursive: true })
    await writeFile(join(dir, 'signals.tsx'), '\'use client\'\nexport const x = 1')
    const importer = join(dir, 'nested', 'consumer.tsx')

    const resolved = resolveClientJsSpecifier('../signals.client.js', importer)
    expect(resolved).toBe(join(dir, 'signals.tsx'))
  })

  test('returns null when the target .tsx file does not exist on disk', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-resolve-'))
    const importer = join(dir, 'consumer.tsx')
    expect(resolveClientJsSpecifier('./missing.client.js', importer)).toBeNull()
  })

  test('returns null for a non-.client.js specifier', () => {
    expect(resolveClientJsSpecifier('./signals.ts', '/a/consumer.tsx')).toBeNull()
    expect(resolveClientJsSpecifier('./signals', '/a/consumer.tsx')).toBeNull()
  })

  test('returns null for an alias (bare) specifier — Vite\'s resolve.alias handles it natively (R2)', () => {
    expect(resolveClientJsSpecifier('@/components/signals.client.js', '/a/consumer.tsx')).toBeNull()
  })

  test('returns null for a bare package specifier', () => {
    expect(resolveClientJsSpecifier('some-package/signals.client.js', '/a/consumer.tsx')).toBeNull()
  })

  test('returns null when there is no importer', () => {
    expect(resolveClientJsSpecifier('./signals.client.js', undefined)).toBeNull()
  })
})
