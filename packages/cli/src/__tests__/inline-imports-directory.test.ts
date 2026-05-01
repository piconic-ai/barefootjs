// Tests for piconic-ai/barefootjs#1151 — `resolveSourceFile` falls back to
// `<basePath>/index.{ts,tsx,js}` when no flat-extension match exists.
// Standard Node module resolution; TypeScript projects rely on it.
//
// Resolution order matters:
//   1. flat-extension probe: `./foo.ts`, `./foo.tsx`, `./foo.js`
//   2. directory-index fallback: `./foo/index.ts`, `./foo/index.tsx`, `./foo/index.js`

import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { resolveRelativeImports } from '../lib/resolve-imports'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'

const TEST_DIR = resolve(tmpdir(), `bf-test-inline-directory-${Date.now()}`)
const DIST_DIR = resolve(TEST_DIR, 'dist')
const COMPONENTS_DIR = resolve(DIST_DIR, 'components', 'canvas')

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
  mkdirSync(COMPONENTS_DIR, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('resolveRelativeImports — directory-import fallback (bf#1151)', () => {
  test('./foo resolves to ./foo/index.ts and is inlined with IIFE wrap', async () => {
    const nodesDir = resolve(COMPONENTS_DIR, 'nodes')
    mkdirSync(nodesDir, { recursive: true })
    writeFileSync(
      resolve(nodesDir, 'index.ts'),
      `export const nodeTypes = { card: 'CardNode' }
`,
    )
    const clientJs = `import { nodeTypes } from './nodes'
console.log(nodeTypes)
`
    writeFileSync(resolve(COMPONENTS_DIR, 'DeskCanvas-dir.js'), clientJs)

    const manifest = {
      DeskCanvas: {
        clientJs: 'components/canvas/DeskCanvas-dir.js',
        markedTemplate: 'components/canvas/DeskCanvas.tsx',
      },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'DeskCanvas-dir.js')).text()
    // Imported name destructured from an IIFE at top level so the parent's
    // bare `nodeTypes` reference resolves at hydration.
    expect(result).toMatch(/const \{\s*nodeTypes\s*\}\s*=\s*\(\(\) =>/)
    // Import line stripped (inlined into the IIFE).
    expect(result).not.toContain("from './nodes'")
    // Body contents present (transpile may flip quote style).
    expect(result).toContain("nodeTypes")
    expect(result).toMatch(/['"]CardNode['"]/)
  })

  test('./foo resolves to ./foo/index.tsx — server component, stripped without inline', async () => {
    const widgetDir = resolve(COMPONENTS_DIR, 'widget')
    mkdirSync(widgetDir, { recursive: true })
    writeFileSync(
      resolve(widgetDir, 'index.tsx'),
      `export function Widget() { return null }
`,
    )
    const clientJs = `import { Widget } from './widget'
console.log('hi')
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-tsx-dir.js'), clientJs)

    const manifest = {
      Comp: {
        clientJs: 'components/canvas/Comp-tsx-dir.js',
        markedTemplate: 'components/canvas/Comp.tsx',
      },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-tsx-dir.js')).text()
    // Import line removed.
    expect(result).not.toContain("from './widget'")
    // No IIFE wrap (server-component path strips without inlining).
    expect(result).not.toMatch(/const \{\s*Widget\s*\}\s*=\s*\(\(\) =>/)
    // Body unchanged otherwise.
    expect(result).toContain("console.log('hi')")
  })

  test('./foo.ts AND ./foo/index.ts both exist — flat file wins (resolution order)', async () => {
    // Flat sibling wins per Node's resolution order.
    writeFileSync(
      resolve(COMPONENTS_DIR, 'helpers.ts'),
      `export const SOURCE = 'flat'
`,
    )
    const helpersDir = resolve(COMPONENTS_DIR, 'helpers')
    mkdirSync(helpersDir, { recursive: true })
    writeFileSync(
      resolve(helpersDir, 'index.ts'),
      `export const SOURCE = 'directory'
`,
    )
    const clientJs = `import { SOURCE } from './helpers'
console.log(SOURCE)
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-flat-wins.js'), clientJs)

    const manifest = {
      Comp: {
        clientJs: 'components/canvas/Comp-flat-wins.js',
        markedTemplate: 'components/canvas/Comp.tsx',
      },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-flat-wins.js')).text()
    expect(result).toMatch(/['"]flat['"]/)
    expect(result).not.toMatch(/['"]directory['"]/)
    expect(result).toMatch(/const \{\s*SOURCE\s*\}\s*=\s*\(\(\) =>/)
  })

  test('./foo resolves to neither flat nor directory — strip + warn', async () => {
    const clientJs = `import { gone } from './nope'
console.log('after')
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-missing.js'), clientJs)

    const manifest = {
      Comp: {
        clientJs: 'components/canvas/Comp-missing.js',
        markedTemplate: 'components/canvas/Comp.tsx',
      },
    }

    const warnCalls: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => { warnCalls.push(args.join(' ')) }
    try {
      await resolveRelativeImports({ distDir: DIST_DIR, manifest })
    } finally {
      console.warn = originalWarn
    }

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-missing.js')).text()
    // Import stripped, body otherwise unchanged.
    expect(result).not.toContain("from './nope'")
    expect(result).toContain("console.log('after')")
    // Warn fired with the import path and the file's logging path.
    expect(warnCalls.some(s => s.includes('./nope') && s.includes('Comp-missing.js'))).toBe(true)
  })
})
