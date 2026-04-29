import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'
import {
  parseStudioUrl,
  applyTokenOverrides,
  appendCSSOverrides,
  type StudioConfig,
} from '../commands/studio'

// ── parseStudioUrl ──

describe('parseStudioUrl', () => {
  test('extracts and decodes ?c= param', () => {
    const config: StudioConfig = { style: 'Sharp', radius: '0' }
    const encoded = encodeURIComponent(btoa(JSON.stringify(config)))
    const url = `https://ui.barefootjs.dev/studio?c=${encoded}`
    expect(parseStudioUrl(url)).toEqual(config)
  })

  test('returns undefined when no ?c= param', () => {
    expect(parseStudioUrl('https://ui.barefootjs.dev/studio')).toBeUndefined()
  })

  test('returns undefined for malformed Base64', () => {
    expect(parseStudioUrl('https://ui.barefootjs.dev/studio?c=!!!invalid!!!')).toBeUndefined()
  })

  test('returns undefined for invalid URL', () => {
    expect(parseStudioUrl('not-a-url')).toBeUndefined()
  })
})

// ── applyTokenOverrides ──

describe('applyTokenOverrides', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `bf-studio-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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
    expect(result.colors[1].value).toBe('oklch(0.97 0 0)')
  })

  test('applies spacing override', () => {
    const tokensPath = writeTokens({
      spacing: [{ name: 'spacing', value: '0.25rem' }],
    })

    applyTokenOverrides(tokensPath, { spacing: '0.3rem' })

    expect(readTokens(tokensPath).spacing[0].value).toBe('0.3rem')
  })

  test('applies radius override', () => {
    const tokensPath = writeTokens({
      borderRadius: [{ name: 'radius', value: '0.625rem' }],
    })

    applyTokenOverrides(tokensPath, { radius: '0' })

    expect(readTokens(tokensPath).borderRadius[0].value).toBe('0')
  })

  test('applies font override with key mapping', () => {
    const tokensPath = writeTokens({
      typography: {
        fontFamily: [{ name: 'font-sans', value: '-apple-system, sans-serif' }],
      },
    })

    applyTokenOverrides(tokensPath, { font: 'inter' })

    expect(readTokens(tokensPath).typography.fontFamily[0].value).toBe('"Inter", sans-serif')
  })

  test('applies shadow presets for Sharp style', () => {
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

  test('ignores unknown style names', () => {
    const tokensPath = writeTokens({
      shadows: [{ name: 'shadow-sm', value: 'original' }],
    })

    applyTokenOverrides(tokensPath, { style: 'Unknown' })

    expect(readTokens(tokensPath).shadows[0].value).toBe('original')
  })
})

// ── appendCSSOverrides ──

describe('appendCSSOverrides', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `bf-studio-css-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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
    expect(result).toContain('--radius: 0.625rem;')
  })

  test('does nothing when no spacing override', () => {
    const cssPath = path.join(tmpDir, 'tokens.css')
    const original = ':root {\n  --radius: 0.625rem;\n}\n'
    writeFileSync(cssPath, original)

    appendCSSOverrides(cssPath, { style: 'Sharp' })

    expect(readFileSync(cssPath, 'utf-8')).toBe(original)
  })
})

// ── Round-trip ──

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
    expect(parseStudioUrl(url)).toEqual(original)
  })
})
