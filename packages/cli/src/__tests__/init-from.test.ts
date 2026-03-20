import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { parseStudioUrl, deriveRegistryUrl, applyTokenOverrides, appendCSSOverrides, type StudioConfig } from '../commands/init'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'

// ── parseStudioUrl ──

describe('parseStudioUrl', () => {
  test('extracts and decodes ?c= param', () => {
    const config: StudioConfig = { style: 'Sharp', radius: '0' }
    const encoded = encodeURIComponent(btoa(JSON.stringify(config)))
    const url = `https://ui.barefootjs.dev/studio?c=${encoded}`

    const result = parseStudioUrl(url)
    expect(result).toEqual(config)
  })

  test('returns undefined when no ?c= param', () => {
    const result = parseStudioUrl('https://ui.barefootjs.dev/studio')
    expect(result).toBeUndefined()
  })

  test('returns undefined for malformed Base64', () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
    const result = parseStudioUrl('https://ui.barefootjs.dev/studio?c=!!!invalid!!!')
    expect(result).toBeUndefined()
    errorSpy.mockRestore()
  })

  test('returns undefined for invalid URL', () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
    const result = parseStudioUrl('not-a-url')
    expect(result).toBeUndefined()
    errorSpy.mockRestore()
  })

  test('decodes config with tokens', () => {
    const config: StudioConfig = {
      style: 'Default',
      tokens: {
        primary: { light: 'oklch(0.5 0.2 240)', dark: 'oklch(0.7 0.15 240)' },
      },
      spacing: '0.3rem',
      radius: '1rem',
      font: 'inter',
    }
    const encoded = encodeURIComponent(btoa(JSON.stringify(config)))
    const url = `https://ui.barefootjs.dev/studio?c=${encoded}`

    const result = parseStudioUrl(url)
    expect(result).toEqual(config)
  })
})

// ── deriveRegistryUrl ──

describe('deriveRegistryUrl', () => {
  test('derives registry URL from studio URL', () => {
    expect(deriveRegistryUrl('https://ui.barefootjs.dev/studio?c=abc'))
      .toBe('https://ui.barefootjs.dev/r/')
  })

  test('falls back to default for invalid URL', () => {
    expect(deriveRegistryUrl('not-a-url'))
      .toBe('https://ui.barefootjs.dev/r/')
  })

  test('works with custom origin', () => {
    expect(deriveRegistryUrl('http://localhost:3000/studio?c=abc'))
      .toBe('http://localhost:3000/r/')
  })
})

// ── applyTokenOverrides ──

describe('applyTokenOverrides', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `bf-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeTokens(data: any): string {
    const p = path.join(tmpDir, 'tokens.json')
    writeFileSync(p, JSON.stringify(data, null, 2))
    return p
  }

  function readTokens(p: string): any {
    return JSON.parse(readFileSync(p, 'utf-8'))
  }

  test('applies color overrides to colors array (bare names)', () => {
    const tokensPath = writeTokens({
      colors: [
        { name: 'primary', value: 'oklch(0.205 0 0)', dark: 'oklch(0.35 0 0)' },
        { name: 'secondary', value: 'oklch(0.97 0 0)', dark: 'oklch(0.269 0 0)' },
      ],
    })

    applyTokenOverrides(tokensPath, {
      tokens: {
        primary: { light: 'oklch(0.5 0.2 240)', dark: 'oklch(0.7 0.15 240)' },
      },
    })

    const result = readTokens(tokensPath)
    expect(result.colors[0].value).toBe('oklch(0.5 0.2 240)')
    expect(result.colors[0].dark).toBe('oklch(0.7 0.15 240)')
    // Secondary unchanged
    expect(result.colors[1].value).toBe('oklch(0.97 0 0)')
  })

  test('applies spacing override (bare name in spacing array)', () => {
    const tokensPath = writeTokens({
      spacing: [{ name: 'spacing', value: '0.25rem' }],
    })

    applyTokenOverrides(tokensPath, { spacing: '0.3rem' })

    const result = readTokens(tokensPath)
    expect(result.spacing[0].value).toBe('0.3rem')
  })

  test('applies radius override (bare name in borderRadius array)', () => {
    const tokensPath = writeTokens({
      borderRadius: [{ name: 'radius', value: '0.625rem' }],
    })

    applyTokenOverrides(tokensPath, { radius: '0' })

    const result = readTokens(tokensPath)
    expect(result.borderRadius[0].value).toBe('0')
  })

  test('applies font override with key mapping (nested typography)', () => {
    const tokensPath = writeTokens({
      typography: {
        fontFamily: [{ name: 'font-sans', value: '-apple-system, sans-serif' }],
      },
    })

    applyTokenOverrides(tokensPath, { font: 'inter' })

    const result = readTokens(tokensPath)
    expect(result.typography.fontFamily[0].value).toBe('"Inter", sans-serif')
  })

  test('applies shadow presets for Sharp style (bare names in shadows)', () => {
    const tokensPath = writeTokens({
      shadows: [
        { name: 'shadow-sm', value: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
        { name: 'shadow', value: '0 1px 3px 0 rgb(0 0 0 / 0.1)' },
        { name: 'shadow-md', value: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
        { name: 'shadow-lg', value: '0 10px 15px -3px rgb(0 0 0 / 0.1)' },
      ],
    })

    applyTokenOverrides(tokensPath, { style: 'Sharp' })

    const result = readTokens(tokensPath)
    expect(result.shadows[0].value).toBe('0 1px 2px 0 rgb(0 0 0 / 0.04)')
    expect(result.shadows[1].value).toBe('0 1px 2px 0 rgb(0 0 0 / 0.06)')
  })

  test('ignores unknown style names for shadow presets', () => {
    const tokensPath = writeTokens({
      shadows: [
        { name: 'shadow-sm', value: 'original' },
      ],
    })

    applyTokenOverrides(tokensPath, { style: 'Unknown' })

    const result = readTokens(tokensPath)
    expect(result.shadows[0].value).toBe('original')
  })
})

// ── appendCSSOverrides ──

describe('appendCSSOverrides', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `bf-css-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('appends --spacing to :root block', () => {
    const cssPath = path.join(tmpDir, 'tokens.css')
    writeFileSync(cssPath, ':root {\n  --radius: 0.625rem;\n}\n')

    appendCSSOverrides(cssPath, { spacing: '0.3rem' })

    const result = readFileSync(cssPath, 'utf-8')
    expect(result).toContain('--spacing: 0.3rem;')
    expect(result).toContain('Studio overrides')
    // Original content preserved
    expect(result).toContain('--radius: 0.625rem;')
  })

  test('does nothing when no spacing override', () => {
    const cssPath = path.join(tmpDir, 'tokens.css')
    const original = ':root {\n  --radius: 0.625rem;\n}\n'
    writeFileSync(cssPath, original)

    appendCSSOverrides(cssPath, { style: 'Sharp' })

    const result = readFileSync(cssPath, 'utf-8')
    expect(result).toBe(original)
  })
})

// ── Round-trip encoding ──

describe('round-trip encoding', () => {
  test('encode → URL → decode produces same config', () => {
    const original: StudioConfig = {
      style: 'Soft',
      tokens: {
        primary: { light: 'oklch(0.5 0.2 240)' },
        destructive: { light: 'oklch(0.6 0.3 30)', dark: 'oklch(0.7 0.2 30)' },
      },
      spacing: '0.3rem',
      radius: '1rem',
      font: 'figtree',
    }

    const encoded = encodeURIComponent(btoa(JSON.stringify(original)))
    const url = `https://ui.barefootjs.dev/studio?c=${encoded}`
    const decoded = parseStudioUrl(url)

    expect(decoded).toEqual(original)
  })
})

// ── Integration: real tokens.json schema ──

describe('applyTokenOverrides with real tokens.json schema', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `bf-real-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('overrides work against actual tokens.json structure', () => {
    // Mirrors the real tokens.json schema
    const tokensPath = path.join(tmpDir, 'tokens.json')
    writeFileSync(tokensPath, JSON.stringify({
      version: 1,
      typography: {
        fontFamily: [
          { name: 'font-sans', value: '-apple-system, BlinkMacSystemFont, sans-serif' },
          { name: 'font-mono', value: 'ui-monospace, monospace' },
        ],
        letterSpacing: [],
      },
      spacing: [
        { name: 'space-1', value: '4px' },
      ],
      borderRadius: [
        { name: 'radius', value: '0.625rem' },
        { name: 'radius-sm', value: 'calc(var(--radius) * 0.6)' },
      ],
      colors: [
        { name: 'background', value: 'oklch(1 0 0)', dark: 'oklch(0.145 0 0)' },
        { name: 'primary', value: 'oklch(0.205 0 0)', dark: 'oklch(0.35 0 0)' },
        { name: 'destructive', value: 'oklch(0.577 0.245 27.325)', dark: 'oklch(0.704 0.191 22.216)' },
      ],
      shadows: [
        { name: 'shadow-sm', value: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
        { name: 'shadow', value: '0 1px 3px 0 rgb(0 0 0 / 0.1)' },
        { name: 'shadow-md', value: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
        { name: 'shadow-lg', value: '0 10px 15px -3px rgb(0 0 0 / 0.1)' },
      ],
    }, null, 2))

    applyTokenOverrides(tokensPath, {
      style: 'Sharp',
      tokens: {
        primary: { light: 'oklch(0.4 0.15 250)', dark: 'oklch(0.6 0.1 250)' },
      },
      spacing: '0.2rem',
      radius: '0',
      font: 'inter',
    })

    const result = JSON.parse(readFileSync(tokensPath, 'utf-8'))

    // Colors
    expect(result.colors[1].value).toBe('oklch(0.4 0.15 250)')
    expect(result.colors[1].dark).toBe('oklch(0.6 0.1 250)')
    // Background unchanged
    expect(result.colors[0].value).toBe('oklch(1 0 0)')

    // Radius
    expect(result.borderRadius[0].value).toBe('0')

    // Font
    expect(result.typography.fontFamily[0].value).toBe('"Inter", sans-serif')
    // Mono unchanged
    expect(result.typography.fontFamily[1].value).toBe('ui-monospace, monospace')

    // Shadows (Sharp preset)
    expect(result.shadows[0].value).toBe('0 1px 2px 0 rgb(0 0 0 / 0.04)')
    expect(result.shadows[1].value).toBe('0 1px 2px 0 rgb(0 0 0 / 0.06)')
  })
})
