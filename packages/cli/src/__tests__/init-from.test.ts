import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { parseStudioUrl, deriveRegistryUrl, applyTokenOverrides, type StudioConfig } from '../commands/init'
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

  test('applies color overrides to colors array', () => {
    const tokensPath = writeTokens({
      colors: [
        { name: '--primary', value: 'oklch(0.205 0 0)', dark: 'oklch(0.35 0 0)' },
        { name: '--secondary', value: 'oklch(0.97 0 0)', dark: 'oklch(0.269 0 0)' },
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

  test('applies spacing override', () => {
    const tokensPath = writeTokens({
      tokens: [{ name: '--spacing', value: '0.25rem' }],
    })

    applyTokenOverrides(tokensPath, { spacing: '0.3rem' })

    const result = readTokens(tokensPath)
    expect(result.tokens[0].value).toBe('0.3rem')
  })

  test('applies radius override', () => {
    const tokensPath = writeTokens({
      tokens: [{ name: '--radius', value: '0.625rem' }],
    })

    applyTokenOverrides(tokensPath, { radius: '0' })

    const result = readTokens(tokensPath)
    expect(result.tokens[0].value).toBe('0')
  })

  test('applies font override with key mapping', () => {
    const tokensPath = writeTokens({
      typography: [{ name: '--font-sans', value: '-apple-system, sans-serif' }],
    })

    applyTokenOverrides(tokensPath, { font: 'inter' })

    const result = readTokens(tokensPath)
    expect(result.typography[0].value).toBe('"Inter", sans-serif')
  })

  test('applies shadow presets for Sharp style', () => {
    const tokensPath = writeTokens({
      tokens: [
        { name: '--shadow-sm', value: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
        { name: '--shadow', value: '0 1px 3px 0 rgb(0 0 0 / 0.1)' },
        { name: '--shadow-md', value: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
        { name: '--shadow-lg', value: '0 10px 15px -3px rgb(0 0 0 / 0.1)' },
      ],
    })

    applyTokenOverrides(tokensPath, { style: 'Sharp' })

    const result = readTokens(tokensPath)
    expect(result.tokens[0].value).toBe('0 1px 2px 0 rgb(0 0 0 / 0.04)')
    expect(result.tokens[1].value).toBe('0 1px 2px 0 rgb(0 0 0 / 0.06)')
  })

  test('ignores unknown style names for shadow presets', () => {
    const tokensPath = writeTokens({
      tokens: [
        { name: '--shadow-sm', value: 'original' },
      ],
    })

    applyTokenOverrides(tokensPath, { style: 'Unknown' })

    const result = readTokens(tokensPath)
    expect(result.tokens[0].value).toBe('original')
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
