import { describe, test, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { fetchRegistryItem } from '../lib/meta-loader'
import { addFromRegistry, toRegistryName } from '../commands/add'
import type { RegistryItem } from '../lib/types'
import type { BarefootConfig } from '../context'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'fs'
import path from 'path'
import os from 'os'

// ---------- fetchRegistryItem ----------

describe('fetchRegistryItem', () => {
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

  const fakeItem: RegistryItem = {
    $schema: 'https://ui.shadcn.com/schema/registry-item.json',
    name: 'button',
    type: 'registry:ui',
    title: 'Button',
    description: 'A button component',
    dependencies: [],
    files: [
      { path: 'components/ui/button/index.tsx', type: 'registry:ui', content: 'export function Button() {}' },
    ],
  }

  test('fetches and parses registry item', async () => {
    globalThis.fetch = async (url: any) => {
      expect(String(url)).toBe('https://example.com/r/button.json')
      return new Response(JSON.stringify(fakeItem), { status: 200 })
    }
    const result = await fetchRegistryItem('https://example.com/r/', 'button')
    expect(result).toEqual(fakeItem)
  })

  test('normalizes URL without trailing slash', async () => {
    globalThis.fetch = async (url: any) => {
      expect(String(url)).toBe('https://example.com/r/button.json')
      return new Response(JSON.stringify(fakeItem), { status: 200 })
    }
    const result = await fetchRegistryItem('https://example.com/r', 'button')
    expect(result).toEqual(fakeItem)
  })

  test('exits on 404 response', async () => {
    globalThis.fetch = async () => new Response('Not Found', { status: 404 })
    await expect(fetchRegistryItem('https://example.com/r/', 'missing')).rejects.toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('HTTP 404'))
  })

  test('exits on network error', async () => {
    globalThis.fetch = async () => { throw new Error('Network failure') }
    await expect(fetchRegistryItem('https://example.com/r/', 'button')).rejects.toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Network failure'))
  })

  test('exits on invalid JSON', async () => {
    globalThis.fetch = async () => new Response('not json{{{', { status: 200 })
    await expect(fetchRegistryItem('https://example.com/r/', 'button')).rejects.toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON'))
  })
})

// ---------- addFromRegistry ----------

describe('addFromRegistry', () => {
  let exitSpy: ReturnType<typeof spyOn>
  let errorSpy: ReturnType<typeof spyOn>
  let logSpy: ReturnType<typeof spyOn>
  let originalFetch: typeof globalThis.fetch
  let tmpDir: string

  const config: BarefootConfig = {
    paths: {
      components: 'components/ui',
      tokens: 'tokens',
      meta: 'meta',
    },
  }

  const buttonItem: RegistryItem = {
    $schema: 'https://ui.shadcn.com/schema/registry-item.json',
    name: 'button',
    type: 'registry:ui',
    title: 'Button',
    description: 'A button component',
    dependencies: [],
    files: [
      { path: 'components/ui/button/index.tsx', type: 'registry:ui', content: 'export function Button() { return <button /> }' },
      { path: 'components/ui/slot/index.tsx', type: 'registry:ui', content: 'export function Slot() {}' },
      { path: 'types/index.tsx', type: 'registry:lib', content: 'export type ButtonProps = {}' },
    ],
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch
    exitSpy = spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    errorSpy = spyOn(console, 'error').mockImplementation(() => {})
    logSpy = spyOn(console, 'log').mockImplementation(() => {})
    tmpDir = path.join(os.tmpdir(), `barefoot-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    exitSpy.mockRestore()
    errorSpy.mockRestore()
    logSpy.mockRestore()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('writes component files to correct paths', async () => {
    globalThis.fetch = async (url: any) => {
      return new Response(JSON.stringify(buttonItem), { status: 200 })
    }

    await addFromRegistry(['button'], 'https://example.com/r/', tmpDir, config, false)

    // Component files under config.paths.components
    const buttonPath = path.join(tmpDir, 'components/ui/button/index.tsx')
    expect(existsSync(buttonPath)).toBe(true)
    expect(readFileSync(buttonPath, 'utf-8')).toBe('export function Button() { return <button /> }')

    const slotPath = path.join(tmpDir, 'components/ui/slot/index.tsx')
    expect(existsSync(slotPath)).toBe(true)
    expect(readFileSync(slotPath, 'utf-8')).toBe('export function Slot() {}')

    // Non-component files at project root
    const typesPath = path.join(tmpDir, 'types/index.tsx')
    expect(existsSync(typesPath)).toBe(true)
    expect(readFileSync(typesPath, 'utf-8')).toBe('export type ButtonProps = {}')
  })

  test('skips existing files without --force', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify(buttonItem), { status: 200 })

    // Pre-create a file
    const buttonDir = path.join(tmpDir, 'components/ui/button')
    mkdirSync(buttonDir, { recursive: true })
    writeFileSync(path.join(buttonDir, 'index.tsx'), 'original content')

    await addFromRegistry(['button'], 'https://example.com/r/', tmpDir, config, false)

    // Should keep original
    expect(readFileSync(path.join(buttonDir, 'index.tsx'), 'utf-8')).toBe('original content')
  })

  test('overwrites existing files with --force', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify(buttonItem), { status: 200 })

    // Pre-create a file
    const buttonDir = path.join(tmpDir, 'components/ui/button')
    mkdirSync(buttonDir, { recursive: true })
    writeFileSync(path.join(buttonDir, 'index.tsx'), 'original content')

    await addFromRegistry(['button'], 'https://example.com/r/', tmpDir, config, true)

    // Should be overwritten
    expect(readFileSync(path.join(buttonDir, 'index.tsx'), 'utf-8')).toBe(
      'export function Button() { return <button /> }'
    )
  })

  test('deduplicates shared files across components', async () => {
    const checkboxItem: RegistryItem = {
      ...buttonItem,
      name: 'checkbox',
      files: [
        { path: 'components/ui/checkbox/index.tsx', type: 'registry:ui', content: 'export function Checkbox() {}' },
        { path: 'components/ui/slot/index.tsx', type: 'registry:ui', content: 'export function Slot() { /* v2 */ }' },
      ],
    }

    let fetchCount = 0
    globalThis.fetch = async (url: any) => {
      fetchCount++
      const name = String(url).match(/\/(\w+)\.json$/)?.[1]
      if (name === 'button') return new Response(JSON.stringify(buttonItem), { status: 200 })
      if (name === 'checkbox') return new Response(JSON.stringify(checkboxItem), { status: 200 })
      return new Response('Not Found', { status: 404 })
    }

    await addFromRegistry(['button', 'checkbox'], 'https://example.com/r/', tmpDir, config, false)

    expect(fetchCount).toBe(2)
    // Both components written
    expect(existsSync(path.join(tmpDir, 'components/ui/button/index.tsx'))).toBe(true)
    expect(existsSync(path.join(tmpDir, 'components/ui/checkbox/index.tsx'))).toBe(true)
    // Shared slot written (last one wins due to Map)
    expect(existsSync(path.join(tmpDir, 'components/ui/slot/index.tsx'))).toBe(true)
  })

  test('no files written when fetch fails (atomicity)', async () => {
    globalThis.fetch = async (url: any) => {
      const name = String(url).match(/\/(\w+)\.json$/)?.[1]
      if (name === 'button') return new Response(JSON.stringify(buttonItem), { status: 200 })
      // second component fails
      return new Response('Not Found', { status: 404 })
    }

    await expect(
      addFromRegistry(['button', 'missing'], 'https://example.com/r/', tmpDir, config, false)
    ).rejects.toThrow('exit')

    // No files should be written since Promise.all fails atomically
    expect(existsSync(path.join(tmpDir, 'components/ui/button/index.tsx'))).toBe(false)
  })

  test('writes meta/<name>.json for each added component so bf docs works after add', async () => {
    // The registry's `<name>.json` ships sources only — `registry:ui`
    // files — so before this behavior was wired in, `bf add button`
    // left `meta/` empty and `bf docs button` failed with a "not
    // found" error. Lock it in: meta extraction runs against the
    // freshly-written source and the index lists the new entry.
    globalThis.fetch = async () => new Response(JSON.stringify(buttonItem), { status: 200 })

    await addFromRegistry(['button'], 'https://example.com/r/', tmpDir, config, false)

    const buttonMetaPath = path.join(tmpDir, 'meta/button.json')
    expect(existsSync(buttonMetaPath)).toBe(true)
    const buttonMeta = JSON.parse(readFileSync(buttonMetaPath, 'utf-8'))
    expect(buttonMeta.name).toBe('button')
    // `source` is relative to projectDir — locks in the path shape the
    // scaffolded app expects (not `ui/components/ui/...` from the monorepo).
    expect(buttonMeta.source).toBe(path.join('components/ui/button/index.tsx'))

    // index.json should pick the new entry up via rebuildMetaIndex.
    const indexPath = path.join(tmpDir, 'meta/index.json')
    expect(existsSync(indexPath)).toBe(true)
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'))
    const names = (index.components as Array<{ name: string }>).map(c => c.name)
    expect(names).toContain('button')
    expect(names).toContain('slot')
  })

  test('resolves requires dependencies transitively', async () => {
    const slotItem: RegistryItem = {
      $schema: 'https://ui.shadcn.com/schema/registry-item.json',
      name: 'slot',
      type: 'registry:ui',
      title: 'Slot',
      description: 'Polymorphic slot',
      dependencies: [],
      files: [
        { path: 'components/ui/slot/index.tsx', type: 'registry:ui', content: 'export function Slot() {}' },
      ],
    }

    const datePickerItem: RegistryItem = {
      $schema: 'https://ui.shadcn.com/schema/registry-item.json',
      name: 'date-picker',
      type: 'registry:ui',
      title: 'Date Picker',
      description: 'Date picker with calendar',
      dependencies: [],
      requires: ['button', 'calendar'],
      files: [
        { path: 'components/ui/date-picker/index.tsx', type: 'registry:ui', content: 'export function DatePicker() {}' },
      ],
    }

    const buttonWithReq: RegistryItem = {
      ...buttonItem,
      requires: ['slot'],
    }

    const calendarItem: RegistryItem = {
      $schema: 'https://ui.shadcn.com/schema/registry-item.json',
      name: 'calendar',
      type: 'registry:ui',
      title: 'Calendar',
      description: 'Calendar',
      dependencies: [],
      files: [
        { path: 'components/ui/calendar/index.tsx', type: 'registry:ui', content: 'export function Calendar() {}' },
      ],
    }

    const items: Record<string, RegistryItem> = {
      'date-picker': datePickerItem,
      button: buttonWithReq,
      calendar: calendarItem,
      slot: slotItem,
    }

    globalThis.fetch = async (url: any) => {
      const name = String(url).match(/\/([a-z-]+)\.json$/)?.[1]
      if (name && items[name]) return new Response(JSON.stringify(items[name]), { status: 200 })
      return new Response('Not Found', { status: 404 })
    }

    // Request only date-picker; it should auto-fetch button, calendar, and slot
    await addFromRegistry(['date-picker'], 'https://example.com/r/', tmpDir, config, false)

    expect(existsSync(path.join(tmpDir, 'components/ui/date-picker/index.tsx'))).toBe(true)
    expect(existsSync(path.join(tmpDir, 'components/ui/button/index.tsx'))).toBe(true)
    expect(existsSync(path.join(tmpDir, 'components/ui/calendar/index.tsx'))).toBe(true)
    expect(existsSync(path.join(tmpDir, 'components/ui/slot/index.tsx'))).toBe(true)

    // Should log resolved dependencies
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Resolved dependencies'))
  })

  // Users naturally type PascalCase or camelCase to match the JSX import
  // (`bf add Combobox`, `bf add RadioGroup`) but the registry stores
  // entries as kebab-case JSON keys (`combobox.json`, `radio-group.json`),
  // so before normalization the literal name 404'd and `bf docs <Name>`
  // (which DOES normalize via meta-loader's case-insensitive fallback)
  // contradicted `bf add <Name>` on the same case. Mirror the meta-loader
  // contract by normalizing before the registry round-trip.
  test('accepts PascalCase / camelCase component names by normalizing to kebab-case', async () => {
    let fetchedUrl = ''
    globalThis.fetch = async (url: any) => {
      fetchedUrl = String(url)
      return new Response(JSON.stringify(buttonItem), { status: 200 })
    }

    await addFromRegistry(['Button'], 'https://example.com/r/', tmpDir, config, false)
    expect(fetchedUrl).toBe('https://example.com/r/button.json')
  })

  test('normalizes multi-word PascalCase to kebab-case (RadioGroup → radio-group)', async () => {
    const radioGroup: RegistryItem = {
      ...buttonItem,
      name: 'radio-group',
      files: [
        { path: 'components/ui/radio-group/index.tsx', type: 'registry:ui', content: 'export function RadioGroup() {}' },
      ],
    }
    const seenUrls: string[] = []
    globalThis.fetch = async (url: any) => {
      seenUrls.push(String(url))
      return new Response(JSON.stringify(radioGroup), { status: 200 })
    }

    await addFromRegistry(['RadioGroup'], 'https://example.com/r/', tmpDir, config, false)
    expect(seenUrls).toEqual(['https://example.com/r/radio-group.json'])
  })

  test('falls back to the literal name when the kebab-case form 404s (staging registries with mixed-case keys)', async () => {
    const seenUrls: string[] = []
    globalThis.fetch = async (url: any) => {
      seenUrls.push(String(url))
      // Canonical kebab-case → 404; literal `Mixed` → 200. The mixed-case
      // key only exists in staging-style registries; the retry path keeps
      // them working without rewriting their layout.
      if (String(url).endsWith('mixed.json')) return new Response('Not Found', { status: 404 })
      return new Response(JSON.stringify({ ...buttonItem, name: 'Mixed', files: [{ path: 'components/ui/mixed/index.tsx', type: 'registry:ui', content: '' }] }), { status: 200 })
    }

    await addFromRegistry(['Mixed'], 'https://example.com/r/', tmpDir, config, false)
    expect(seenUrls).toEqual([
      'https://example.com/r/mixed.json',
      'https://example.com/r/Mixed.json',
    ])
  })

  test('touches uno.config.ts after adding files so unocss --watch picks up new directories', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify(buttonItem), { status: 200 })

    const unoConfig = path.join(tmpDir, 'uno.config.ts')
    writeFileSync(unoConfig, 'export default {}')
    const before = statSync(unoConfig).mtimeMs

    await new Promise(r => setTimeout(r, 50))
    await addFromRegistry(['button'], 'https://example.com/r/', tmpDir, config, false)

    const after = statSync(unoConfig).mtimeMs
    expect(after).toBeGreaterThan(before)
  })

  test('does not touch uno.config.ts when no files were added', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify(buttonItem), { status: 200 })

    // Pre-create all files so nothing is added
    for (const file of buttonItem.files) {
      const destPath = file.path.startsWith('components/ui/')
        ? path.join(tmpDir, file.path)
        : path.join(tmpDir, file.path)
      mkdirSync(path.dirname(destPath), { recursive: true })
      writeFileSync(destPath, file.content)
    }

    const unoConfig = path.join(tmpDir, 'uno.config.ts')
    writeFileSync(unoConfig, 'export default {}')
    const before = statSync(unoConfig).mtimeMs

    await new Promise(r => setTimeout(r, 50))
    await addFromRegistry(['button'], 'https://example.com/r/', tmpDir, config, false)

    const after = statSync(unoConfig).mtimeMs
    expect(after).toBe(before)
  })
})

// ---------- toRegistryName ----------

describe('toRegistryName', () => {
  test('lowercases single-word PascalCase', () => {
    expect(toRegistryName('Button')).toBe('button')
    expect(toRegistryName('Combobox')).toBe('combobox')
  })
  test('kebab-cases multi-word PascalCase', () => {
    expect(toRegistryName('RadioGroup')).toBe('radio-group')
    expect(toRegistryName('ToggleGroup')).toBe('toggle-group')
  })
  test('handles trailing acronyms', () => {
    expect(toRegistryName('InputOTP')).toBe('input-otp')
  })
  test('leaves already-canonical kebab-case alone', () => {
    expect(toRegistryName('input-group')).toBe('input-group')
    expect(toRegistryName('radio-group')).toBe('radio-group')
  })
  test('lowercases mixed-case kebab', () => {
    expect(toRegistryName('Input-Group')).toBe('input-group')
  })
})
