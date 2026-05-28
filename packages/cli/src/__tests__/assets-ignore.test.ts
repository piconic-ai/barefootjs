import { describe, test, expect } from 'bun:test'
import {
  ASSETS_IGNORE_FILENAME,
  collectServerOnlyAssets,
  isCloudflareWorkersProject,
  writeAssetsIgnore,
} from '../lib/assets-ignore'
import { CACHE_FILENAME } from '../lib/build-cache'
import { EMIT_LEDGER_FILENAME } from '../lib/emit-ledger'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'bf-assetsignore-'))
}

const baseManifest = {
  __barefoot__: { markedTemplate: '', clientJs: 'components/barefoot.js' },
  Button: { markedTemplate: 'components/button.tsx', clientJs: 'components/button.client.js' },
  Card: { markedTemplate: 'components/card.tsx' },
}

describe('collectServerOnlyAssets', () => {
  test('lists build metadata, manifest, and SSR templates — never browser files', () => {
    const entries = collectServerOnlyAssets({
      devSentinelSubdir: '.dev',
      templatesSubdir: 'components',
      manifest: baseManifest,
      hasExternals: true,
      clientOnly: false,
    })

    expect(entries).toContain('.dev/')
    expect(entries).toContain(EMIT_LEDGER_FILENAME)
    expect(entries).toContain(CACHE_FILENAME)
    expect(entries).toContain('barefoot-externals.json')
    expect(entries).toContain('components/manifest.json')
    expect(entries).toContain('components/button.tsx')
    expect(entries).toContain('components/card.tsx')

    // Browser-served outputs must stay deployable.
    expect(entries).not.toContain('components/barefoot.js')
    expect(entries).not.toContain('components/button.client.js')
    // The runtime sentinel's empty markedTemplate must not leak in.
    expect(entries).not.toContain('')
  })

  test('is sorted and deduplicated for a stable block', () => {
    const entries = collectServerOnlyAssets({
      devSentinelSubdir: '.dev',
      templatesSubdir: 'components',
      manifest: baseManifest,
      hasExternals: true,
      clientOnly: false,
    })
    expect(entries).toEqual([...entries].sort())
    expect(new Set(entries).size).toBe(entries.length)
  })

  test('omits barefoot-externals.json when externals are not configured', () => {
    const entries = collectServerOnlyAssets({
      devSentinelSubdir: '.dev',
      templatesSubdir: 'components',
      manifest: baseManifest,
      hasExternals: false,
      clientOnly: false,
    })
    expect(entries).not.toContain('barefoot-externals.json')
  })

  test('omits manifest + templates in clientOnly mode', () => {
    const entries = collectServerOnlyAssets({
      devSentinelSubdir: '.dev',
      templatesSubdir: 'components',
      manifest: baseManifest,
      hasExternals: false,
      clientOnly: true,
    })
    expect(entries).not.toContain('components/manifest.json')
    expect(entries).not.toContain('components/button.tsx')
    // Build metadata is still emitted in clientOnly mode.
    expect(entries).toContain('.dev/')
    expect(entries).toContain(CACHE_FILENAME)
  })

  test('honours a custom templates subdir', () => {
    const entries = collectServerOnlyAssets({
      devSentinelSubdir: '.dev',
      templatesSubdir: 'templates',
      manifest: { Button: { markedTemplate: 'templates/button.tsx' } },
      hasExternals: false,
      clientOnly: false,
    })
    expect(entries).toContain('templates/manifest.json')
    expect(entries).toContain('templates/button.tsx')
  })
})

describe('writeAssetsIgnore', () => {
  const entries = ['.dev/', '.bfemit.json', 'components/manifest.json', 'components/button.tsx']

  test('creates the file with a managed block when none exists', async () => {
    const dir = tmp()
    try {
      const changed = await writeAssetsIgnore(dir, entries)
      expect(changed).toBe(true)
      const raw = readFileSync(join(dir, ASSETS_IGNORE_FILENAME), 'utf8')
      for (const e of entries) expect(raw).toContain(e)
      expect(raw.endsWith('\n')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('preserves user entries outside the managed block', async () => {
    const dir = tmp()
    try {
      writeFileSync(join(dir, ASSETS_IGNORE_FILENAME), '# my own ignores\nsecret.txt\n')
      await writeAssetsIgnore(dir, entries)
      const raw = readFileSync(join(dir, ASSETS_IGNORE_FILENAME), 'utf8')
      expect(raw).toContain('# my own ignores')
      expect(raw).toContain('secret.txt')
      expect(raw).toContain('components/button.tsx')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('replaces the previous managed block instead of duplicating it', async () => {
    const dir = tmp()
    try {
      writeFileSync(join(dir, ASSETS_IGNORE_FILENAME), '# user header\nkeep.me\n')
      await writeAssetsIgnore(dir, entries)
      // A later build drops one template and gains another.
      const next = ['.dev/', '.bfemit.json', 'components/manifest.json', 'components/card.tsx']
      await writeAssetsIgnore(dir, next)
      const raw = readFileSync(join(dir, ASSETS_IGNORE_FILENAME), 'utf8')

      // Exactly one managed block survives.
      expect(raw.match(/barefoot managed block \(generated/g)?.length).toBe(1)
      // Stale entry pruned, fresh entry present, user content intact.
      expect(raw).not.toContain('components/button.tsx')
      expect(raw).toContain('components/card.tsx')
      expect(raw).toContain('# user header')
      expect(raw).toContain('keep.me')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('is a no-op when the resulting content is unchanged', async () => {
    const dir = tmp()
    try {
      expect(await writeAssetsIgnore(dir, entries)).toBe(true)
      expect(await writeAssetsIgnore(dir, entries)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('isCloudflareWorkersProject', () => {
  for (const name of ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc']) {
    test(`detects ${name}`, async () => {
      const dir = tmp()
      try {
        writeFileSync(join(dir, name), '')
        expect(await isCloudflareWorkersProject(dir)).toBe(true)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }

  test('returns false without a wrangler config', async () => {
    const dir = tmp()
    try {
      expect(await isCloudflareWorkersProject(dir)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
