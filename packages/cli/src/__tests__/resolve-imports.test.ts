import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { resolveRelativeImports } from '../lib/resolve-imports'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'

const TEST_DIR = resolve(tmpdir(), `bf-test-resolve-imports-${Date.now()}`)
const DIST_DIR = resolve(TEST_DIR, 'dist')
const COMPONENTS_DIR = resolve(DIST_DIR, 'components')
const SOURCE_DIR = resolve(TEST_DIR, 'src')

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
  mkdirSync(COMPONENTS_DIR, { recursive: true })
  mkdirSync(SOURCE_DIR, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('resolveRelativeImports', () => {
  test('inlines pure .ts module', async () => {
    // Write a utility module next to the client JS
    writeFileSync(resolve(COMPONENTS_DIR, 'utils.ts'), `
export function highlight(code: string): string {
  return '<pre>' + code + '</pre>'
}
`)
    // Write client JS that imports the utility
    const clientJs = `import { highlight } from './utils'
import { createSignal } from '@barefootjs/client'
console.log(highlight('hello'))
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Demo-abc123.js'), clientJs)

    const manifest = {
      Demo: { clientJs: 'components/Demo-abc123.js', markedTemplate: 'components/Demo.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Demo-abc123.js')).text()
    // Should contain the inlined function (without export keyword)
    expect(result).toContain('function highlight(code)')
    // Should NOT contain the original import
    expect(result).not.toContain("from './utils'")
    // Should keep package imports untouched
    expect(result).toContain("from '@barefootjs/client'")
  })

  test('strips .tsx server component import', async () => {
    writeFileSync(resolve(COMPONENTS_DIR, 'ServerComp.tsx'), `
export function ServerComp() {
  return <div>server only</div>
}
`)
    const clientJs = `import { ServerComp } from './ServerComp'
import { createSignal } from '@barefootjs/client'
console.log('client code')
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Parent-abc123.js'), clientJs)

    const manifest = {
      Parent: { clientJs: 'components/Parent-abc123.js', markedTemplate: 'components/Parent.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Parent-abc123.js')).text()
    expect(result).not.toContain('ServerComp')
    expect(result).toContain("from '@barefootjs/client'")
    expect(result).toContain("console.log('client code')")
  })

  test('deduplicates same module imported by two client JS files', async () => {
    writeFileSync(resolve(COMPONENTS_DIR, 'shared-utils.ts'), `
export const VERSION = '1.0'
`)
    const clientJsA = `import { VERSION } from './shared-utils'
console.log('A', VERSION)
`
    const clientJsB = `import { VERSION } from './shared-utils'
console.log('B', VERSION)
`
    writeFileSync(resolve(COMPONENTS_DIR, 'CompA-aaa.js'), clientJsA)
    writeFileSync(resolve(COMPONENTS_DIR, 'CompB-bbb.js'), clientJsB)

    const manifest = {
      CompA: { clientJs: 'components/CompA-aaa.js', markedTemplate: 'components/CompA.tsx' },
      CompB: { clientJs: 'components/CompB-bbb.js', markedTemplate: 'components/CompB.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const resultA = await Bun.file(resolve(COMPONENTS_DIR, 'CompA-aaa.js')).text()
    const resultB = await Bun.file(resolve(COMPONENTS_DIR, 'CompB-bbb.js')).text()
    // Both should have the inlined code (dedup is per-file, not cross-file)
    expect(resultA).toContain('VERSION')
    expect(resultB).toContain('VERSION')
    expect(resultA).not.toContain("from './shared-utils'")
    expect(resultB).not.toContain("from './shared-utils'")
  })

  test('no-op when no relative imports', async () => {
    const clientJs = `import { createSignal } from '@barefootjs/client'
const [count, setCount] = createSignal(0)
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Counter-xyz.js'), clientJs)

    const manifest = {
      Counter: { clientJs: 'components/Counter-xyz.js', markedTemplate: 'components/Counter.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Counter-xyz.js')).text()
    expect(result).toBe(clientJs)
  })

  test('strips import at EOF without trailing newline', async () => {
    writeFileSync(resolve(COMPONENTS_DIR, 'eof-utils.tsx'), `
export function EofComp() { return <div /> }
`)
    // No trailing newline after import
    const clientJs = `console.log('main code')\nimport { EofComp } from './eof-utils'`
    writeFileSync(resolve(COMPONENTS_DIR, 'Eof-222.js'), clientJs)

    const manifest = {
      Eof: { clientJs: 'components/Eof-222.js', markedTemplate: 'components/Eof.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Eof-222.js')).text()
    expect(result).not.toContain('eof-utils')
    expect(result).toContain("console.log('main code')")
  })

  test('strips missing module import without crashing', async () => {
    const clientJs = `import { missing } from './nonexistent'
console.log('still works')
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Broken-111.js'), clientJs)

    const manifest = {
      Broken: { clientJs: 'components/Broken-111.js', markedTemplate: 'components/Broken.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Broken-111.js')).text()
    expect(result).not.toContain('nonexistent')
    expect(result).toContain("console.log('still works')")
  })

  test('recursively inlines transitive .ts imports', async () => {
    // Leaf module — depended on by the middle layer
    writeFileSync(resolve(COMPONENTS_DIR, 'leaf.ts'), `
export const FRUITS = ['apple', 'banana']
`)
    // Middle module — references the leaf at module-load time
    writeFileSync(resolve(COMPONENTS_DIR, 'middle.ts'), `
import { FRUITS } from './leaf'
export const COUNT = FRUITS.length
`)
    // Client JS imports middle but not leaf
    const clientJs = `import { COUNT } from './middle'
console.log(COUNT)
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-trans.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/Comp-trans.js', markedTemplate: 'components/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-trans.js')).text()
    // Both leaf and middle should be inlined, with leaf's declaration first
    // so that middle's reference to FRUITS resolves at module init.
    expect(result).toContain('FRUITS')
    expect(result).toContain('COUNT')
    expect(result).not.toContain("from './middle'")
    expect(result).not.toContain("from './leaf'")
    const fruitsIdx = result.indexOf("const FRUITS")
    const countIdx = result.indexOf("const COUNT")
    expect(fruitsIdx).toBeGreaterThan(-1)
    expect(countIdx).toBeGreaterThan(fruitsIdx)
    // No stray `{ FRUITS, ... }` block statement left over from the export.
    expect(result).not.toMatch(/^\s*\{\s*FRUITS\s*\}/m)
  })

  test('resolves from sourceDirs when not found relative to client JS', async () => {
    // Module exists in SOURCE_DIR, not in COMPONENTS_DIR
    writeFileSync(resolve(SOURCE_DIR, 'helpers.ts'), `
export function formatDate(d: Date): string {
  return d.toISOString()
}
`)
    const clientJs = `import { formatDate } from './helpers'
console.log(formatDate(new Date()))
`
    writeFileSync(resolve(COMPONENTS_DIR, 'DatePicker-fff.js'), clientJs)

    const manifest = {
      DatePicker: { clientJs: 'components/DatePicker-fff.js', markedTemplate: 'components/DatePicker.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest, sourceDirs: [SOURCE_DIR] })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'DatePicker-fff.js')).text()
    expect(result).toContain('function formatDate(d)')
    expect(result).not.toContain("from './helpers'")
  })

  // Regression: bf#1133 — a 'use client' component importing a sibling .ts
  // helper at its OWN source location (not under any global sourceDir) had
  // its import line stripped because the resolver only searched the dist dir.
  // The fix is to thread each manifest entry's source directory through
  // sourceDirsByManifestKey so the helper can be located and inlined.
  test('resolves sibling .ts via sourceDirsByManifestKey (bf#1133)', async () => {
    // Source layout: src/components/canvas/{DeskCanvas.tsx,useYjs.ts}
    const SRC_CANVAS = resolve(SOURCE_DIR, 'components', 'canvas')
    mkdirSync(SRC_CANVAS, { recursive: true })
    writeFileSync(resolve(SRC_CANVAS, 'useYjs.ts'), `
export function useYjs(roomId: string, readOnly: boolean) {
  return { roomId, readOnly }
}
`)

    // Dist layout: dist/components/canvas/DeskCanvas-abc.js (no sibling useYjs there)
    const DIST_CANVAS = resolve(COMPONENTS_DIR, 'canvas')
    mkdirSync(DIST_CANVAS, { recursive: true })
    const clientJs = `import { useYjs } from './useYjs'
import { hydrate } from '@barefootjs/client/runtime'
export function initDeskCanvas(__scope, _p = {}) {
  const yjs = useYjs(_p.roomId, _p.readOnly)
  return yjs
}
`
    writeFileSync(resolve(DIST_CANVAS, 'DeskCanvas-abc.js'), clientJs)

    const manifest = {
      DeskCanvas: {
        clientJs: 'components/canvas/DeskCanvas-abc.js',
        markedTemplate: 'components/canvas/DeskCanvas.tsx',
      },
    }

    await resolveRelativeImports({
      distDir: DIST_DIR,
      manifest,
      sourceDirsByManifestKey: { DeskCanvas: [SRC_CANVAS] },
    })

    const result = await Bun.file(resolve(DIST_CANVAS, 'DeskCanvas-abc.js')).text()
    // Helper inlined — both the function and its call site are present.
    expect(result).toContain('function useYjs(roomId, readOnly)')
    expect(result).toContain('useYjs(_p.roomId, _p.readOnly)')
    // Original import line stripped (replaced by inlined declaration).
    expect(result).not.toContain("from './useYjs'")
    // Untouched module imports stay.
    expect(result).toContain("from '@barefootjs/client/runtime'")
  })
})
