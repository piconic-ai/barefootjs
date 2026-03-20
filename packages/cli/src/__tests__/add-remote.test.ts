import { describe, test, expect, spyOn, beforeEach, afterEach } from 'bun:test'
import { fetchRegistryItem } from '../lib/meta-loader'
import { addFromRegistry } from '../commands/add'
import type { RegistryItem } from '../lib/types'
import type { BarefootConfig } from '../context'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
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
})
