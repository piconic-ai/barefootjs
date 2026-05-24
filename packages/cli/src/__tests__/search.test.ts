import { describe, test, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { search, resolvePrintOptions, printSearchResults, type SearchResult } from '../commands/search'
import { loadIndex, fetchIndex, tryFetchIndex } from '../lib/meta-loader'
import { scanCoreDocs } from '../lib/docs-loader'
import type { MetaIndex } from '../lib/types'
import path from 'path'

const metaDir = path.resolve(import.meta.dir, '../../../../ui/meta')
const docsDir = path.resolve(import.meta.dir, '../../../../docs/core')

describe('search', () => {
  const index = loadIndex(metaDir)

  test('finds component by name', () => {
    const results = search('button', index)
    expect(results.some(r => r.name === 'button')).toBe(true)
  })

  test('finds component by category', () => {
    const results = search('input', index)
    expect(results.length).toBeGreaterThan(0)
    expect(results.every(r =>
      r.name.includes('input') ||
      r.category.includes('input') ||
      r.description.toLowerCase().includes('input')
    )).toBe(true)
  })

  test('finds component by tag', () => {
    const results = search('button', index)
    // All results should match "button" in name, category, or description
    expect(results.every(r =>
      r.name.includes('button') ||
      r.category.includes('button') ||
      r.description.toLowerCase().includes('button')
    )).toBe(true)
  })

  test('expands category aliases (form → input)', () => {
    const results = search('form', index)
    const hasInputCategory = results.some(r => r.category === 'input')
    expect(hasInputCategory).toBe(true)
  })

  test('returns empty array for no match', () => {
    const results = search('zzz_nonexistent_zzz', index)
    expect(results).toEqual([])
  })

  test('--dir override: searches in arbitrary directory', () => {
    // search() accepts any MetaIndex, verifying --dir plumbing works
    const results = search('button', index)
    expect(results.some(r => r.name === 'button')).toBe(true)
  })

  test('exits with error on nonexistent directory', () => {
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => loadIndex('/nonexistent/path')).toThrow('exit')
      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      exitSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })
})

describe('fetchIndex', () => {
  let exitSpy: ReturnType<typeof spyOn>
  let errorSpy: ReturnType<typeof spyOn>
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    exitSpy = spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    errorSpy = spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })

  const fakeIndex: MetaIndex = {
    version: 1,
    generatedAt: '2026-01-01',
    components: [{ name: 'button', title: 'Button', category: 'input', description: 'A button', tags: ['button'], stateful: false }],
  }

  test('fetches and parses remote index.json', async () => {
    globalThis.fetch = async (url: any) => {
      expect(String(url)).toBe('https://example.com/r/index.json')
      return new Response(JSON.stringify(fakeIndex), { status: 200 })
    }
    const result = await fetchIndex('https://example.com/r/')
    expect(result).toEqual(fakeIndex)
  })

  test('appends /index.json when URL has no trailing slash', async () => {
    globalThis.fetch = async (url: any) => {
      expect(String(url)).toBe('https://example.com/r/index.json')
      return new Response(JSON.stringify(fakeIndex), { status: 200 })
    }
    const result = await fetchIndex('https://example.com/r')
    expect(result).toEqual(fakeIndex)
  })

  test('exits on non-200 response', async () => {
    globalThis.fetch = async () => new Response('Not Found', { status: 404 })
    await expect(fetchIndex('https://example.com/r/')).rejects.toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('HTTP 404'))
  })

  test('exits on network error', async () => {
    globalThis.fetch = async () => { throw new Error('Network failure') }
    await expect(fetchIndex('https://example.com/r/')).rejects.toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Network failure'))
  })

  test('exits on invalid JSON', async () => {
    globalThis.fetch = async () => new Response('not json{{{', { status: 200 })
    await expect(fetchIndex('https://example.com/r/')).rejects.toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON'))
  })
})

describe('tryFetchIndex', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const fakeIndex: MetaIndex = {
    version: 1,
    generatedAt: '2026-01-01',
    components: [{ name: 'button', title: 'Button', category: 'input', description: 'A button', tags: ['button'], stateful: false }],
  }

  test('returns index on success', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify(fakeIndex), { status: 200 })
    const result = await tryFetchIndex('https://example.com/r/')
    expect(result).toEqual(fakeIndex)
  })

  test('returns null on HTTP error (no process.exit)', async () => {
    globalThis.fetch = async () => new Response('Not Found', { status: 404 })
    const result = await tryFetchIndex('https://example.com/r/')
    expect(result).toBeNull()
  })

  test('returns null on network error (no process.exit)', async () => {
    globalThis.fetch = async () => { throw new Error('offline') }
    const result = await tryFetchIndex('https://example.com/r/')
    expect(result).toBeNull()
  })

  test('returns null on invalid JSON (no process.exit)', async () => {
    globalThis.fetch = async () => new Response('not json{{{', { status: 200 })
    const result = await tryFetchIndex('https://example.com/r/')
    expect(result).toBeNull()
  })
})

describe('search - core docs', () => {
  const index = loadIndex(metaDir)
  const coreDocs = scanCoreDocs(docsDir)

  test('finds core doc by slug', () => {
    const results = search('create-signal', index, coreDocs)
    expect(results.some(r => r.type === 'doc' && r.name.includes('create-signal'))).toBe(true)
  })

  test('finds core doc by description keyword', () => {
    const results = search('hydration', index, coreDocs)
    expect(results.some(r => r.type === 'doc')).toBe(true)
  })

  test('mixed results: components + docs', () => {
    // "input" matches both input components and possibly some docs
    const results = search('input', index, coreDocs)
    expect(results.some(r => r.type === 'component')).toBe(true)
  })

  test('category alias: "signal" matches "reactivity" docs', () => {
    const results = search('signal', index, coreDocs)
    const reactivityDocs = results.filter(r => r.type === 'doc' && r.category === 'reactivity')
    expect(reactivityDocs.length).toBeGreaterThan(0)
  })

  test('returns empty when no match in either source', () => {
    const results = search('zzz_nonexistent_zzz', index, coreDocs)
    expect(results).toEqual([])
  })
})

describe('resolvePrintOptions — source label + hint trigger', () => {
  // The hint exists so `bf search` from a fresh scaffold doesn't read
  // as "this component doesn't exist" when in fact it lives in the
  // upstream registry the caller hasn't `--registry`'d yet. The hint
  // SHOULD fire on the default path and SHOULD NOT fire when the
  // caller already made an explicit scope choice (`--registry` /
  // `--dir`) or when the metaDir already IS the monorepo registry.

  test('scaffold default: relative path label + registry hint', () => {
    const opts = resolvePrintOptions({
      dirFlagUsed: false,
      metaDir: '/proj/meta',
      cwd: '/proj',
      isMonorepoRegistry: false,
    })
    expect(opts.sourceLabel).toBe('meta')
    expect(opts.hintRegistry).toBe(true)
  })

  test('cwd === metaDir: label collapses to "."', () => {
    const opts = resolvePrintOptions({
      dirFlagUsed: false,
      metaDir: '/proj/meta',
      cwd: '/proj/meta',
      isMonorepoRegistry: false,
    })
    expect(opts.sourceLabel).toBe('.')
  })

  test('monorepo registry fallback: shows the real path + suppresses the hint', () => {
    // `createContext` falls back to `<repo>/ui/meta` when no
    // barefoot.config.ts is found. The hint pointing at the upstream
    // registry would be redundant there (that's exactly the data the
    // upstream is built from), so it's suppressed.
    const opts = resolvePrintOptions({
      dirFlagUsed: false,
      metaDir: '/repo/ui/meta',
      cwd: '/repo',
      isMonorepoRegistry: true,
    })
    expect(opts.sourceLabel).toBe('ui/meta')
    expect(opts.hintRegistry).toBe(false)
  })

  test('--registry <url>: hostname label, no hint', () => {
    const opts = resolvePrintOptions({
      registryUrl: 'https://ui.barefootjs.dev/r/',
      dirFlagUsed: false,
      metaDir: '/proj/meta',
      cwd: '/proj',
      isMonorepoRegistry: false,
    })
    expect(opts.sourceLabel).toBe('ui.barefootjs.dev')
    expect(opts.hintRegistry).toBe(false)
  })

  test('--dir <path>: relative path label, no hint', () => {
    const opts = resolvePrintOptions({
      dirFlagUsed: true,
      metaDir: '/proj/custom/meta',
      cwd: '/proj',
      isMonorepoRegistry: false,
    })
    expect(opts.sourceLabel).toBe('custom/meta')
    expect(opts.hintRegistry).toBe(false)
  })

  test('metaDir outside cwd: falls back to absolute path', () => {
    const opts = resolvePrintOptions({
      dirFlagUsed: true,
      metaDir: '/elsewhere/meta',
      cwd: '/proj',
      isMonorepoRegistry: false,
    })
    // path.relative returns "../elsewhere/meta"; the leading "..\"
    // triggers the absolute-path fallback so the label can't be
    // mistaken for a sibling of the project.
    expect(opts.sourceLabel).toBe('/elsewhere/meta')
    expect(opts.hintRegistry).toBe(false)
  })
})

describe('printSearchResults — registry hint surface', () => {
  let logSpy: ReturnType<typeof spyOn>
  let logs: string[]

  beforeEach(() => {
    logs = []
    logSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  const oneResult: SearchResult[] = [
    { name: 'button', type: 'component', category: 'input', description: 'A button' },
  ]

  test('prints the source label + registry hint on default path', () => {
    printSearchResults(oneResult, false, { sourceLabel: 'meta', hintRegistry: true })
    expect(logs[0]).toBe('Searching: meta')
    expect(logs[1]).toContain('--registry https://ui.barefootjs.dev/r/')
  })

  test('omits the hint when caller passed --registry', () => {
    printSearchResults(oneResult, false, { sourceLabel: 'ui.barefootjs.dev', hintRegistry: false })
    expect(logs[0]).toBe('Searching: ui.barefootjs.dev')
    expect(logs.some((l) => l.includes('--registry'))).toBe(false)
  })

  test('hint fires even when the result set is empty (the case the hint exists for)', () => {
    printSearchResults([], false, { sourceLabel: 'meta', hintRegistry: true })
    expect(logs.some((l) => l.includes('--registry https://ui.barefootjs.dev/r/'))).toBe(true)
    expect(logs.some((l) => l === 'No results found.')).toBe(true)
  })

  test('--json: header is suppressed (machine output stays just the JSON)', () => {
    printSearchResults(oneResult, true, { sourceLabel: 'meta', hintRegistry: true })
    expect(logs).toHaveLength(1)
    expect(JSON.parse(logs[0])).toEqual(oneResult)
  })
})
