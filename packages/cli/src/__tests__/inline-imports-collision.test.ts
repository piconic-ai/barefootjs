// Regression tests for piconic-ai/barefootjs#1141 — when two sibling .ts
// modules each declare a module-private const/function with the same name,
// the inliner used to splice both decls at top level, producing
// `SyntaxError: Identifier '...' has already been declared` in the browser.
//
// The fix wraps each inlined module's body in an IIFE that re-exports only
// the names the parent imports, so module-private decls stay scoped to
// their own arrow body.

import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { resolveRelativeImports } from '../lib/resolve-imports'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'

const TEST_DIR = resolve(tmpdir(), `bf-test-inline-collision-${Date.now()}`)
const DIST_DIR = resolve(TEST_DIR, 'dist')
const COMPONENTS_DIR = resolve(DIST_DIR, 'components', 'canvas')

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
  mkdirSync(COMPONENTS_DIR, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

// Count occurrences of a regex match in a string.
function countMatches(s: string, re: RegExp): number {
  return [...s.matchAll(re)].length
}

describe('resolveRelativeImports — module-private name collisions (bf#1141)', () => {
  test('two siblings sharing a private const: at most one TOP-LEVEL decl', async () => {
    writeFileSync(
      resolve(COMPONENTS_DIR, 'CanvasActions.ts'),
      `const BAR_STYLE = 'pos:abs;left:8px;'
export function initCanvasActions(host: HTMLElement) {
  host.style.cssText = BAR_STYLE
}
`,
    )
    writeFileSync(
      resolve(COMPONENTS_DIR, 'ZoomBar.ts'),
      `const BAR_STYLE = 'pos:abs;right:8px;'
export function initZoomBar(host: HTMLElement) {
  host.style.cssText = BAR_STYLE
}
`,
    )
    const clientJs = `import { initCanvasActions } from './CanvasActions'
import { initZoomBar } from './ZoomBar'
initCanvasActions(document.body)
initZoomBar(document.body)
`
    writeFileSync(resolve(COMPONENTS_DIR, 'DeskCanvas-abc.js'), clientJs)

    const manifest = {
      DeskCanvas: {
        clientJs: 'components/canvas/DeskCanvas-abc.js',
        markedTemplate: 'components/canvas/DeskCanvas.tsx',
      },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'DeskCanvas-abc.js')).text()
    // Both private decls remain (each inside its own IIFE arrow body).
    expect(countMatches(result, /\bconst BAR_STYLE\b/g)).toBe(2)
    // Each `const BAR_STYLE` decl is preceded (lexically) by an IIFE
    // opening that scopes it. We verify by parsing: the bundle parses as
    // a Script (top-level `const BAR_STYLE` twice would be a SyntaxError).
    expect(() => new Function(result.replace(/document\./g, 'undefined?.'))).not.toThrow()
    // Imported names should be destructured at top level so the parent's
    // bare references resolve.
    expect(result).toMatch(/const \{\s*initCanvasActions\s*\}\s*=\s*\(\(\) =>/)
    expect(result).toMatch(/const \{\s*initZoomBar\s*\}\s*=\s*\(\(\) =>/)
    // Both imports stripped.
    expect(result).not.toContain("from './CanvasActions'")
    expect(result).not.toContain("from './ZoomBar'")
  })

  test('IIFE return surfaces only the explicitly imported names', async () => {
    // Module exports two names but the parent only imports one.
    writeFileSync(
      resolve(COMPONENTS_DIR, 'helpers.ts'),
      `const PRIVATE = 'private'
export const PUBLIC_USED = 'used'
export const PUBLIC_UNUSED = 'unused'
`,
    )
    const clientJs = `import { PUBLIC_USED } from './helpers'
console.log(PUBLIC_USED)
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-h.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-h.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-h.js')).text()
    // The IIFE return surfaces PUBLIC_USED (parent destructures it).
    expect(result).toMatch(/return \{\s*PUBLIC_USED\s*\}/)
    // PRIVATE is module-private — never returned (stays inside IIFE body
    // only, can't leak to parent).
    expect(result).not.toMatch(/return \{[^}]*\bPRIVATE\b/)
    // PUBLIC_UNUSED is exported but unused — stays inside the IIFE body
    // (its `export` keyword stripped) but is NOT in the IIFE return.
    expect(result).not.toMatch(/return \{[^}]*\bPUBLIC_UNUSED\b/)
    // The bundle parses as a Script — proves IIFE scoping is structural.
    expect(() => new Function(result)).not.toThrow()
  })

  test('transitive private decl in nested module stays hidden', async () => {
    // Inner module has a private const that would collide if hoisted.
    writeFileSync(
      resolve(COMPONENTS_DIR, 'inner.ts'),
      `const INNER_PRIVATE = 'inner-private'
export const innerExport = INNER_PRIVATE
`,
    )
    // Middle module imports inner, has its OWN private const with the
    // same name — these would collide if either leaked.
    writeFileSync(
      resolve(COMPONENTS_DIR, 'middle.ts'),
      `import { innerExport } from './inner'
const INNER_PRIVATE = 'middle-private'
export const middleExport = INNER_PRIVATE + ':' + innerExport
`,
    )
    const clientJs = `import { middleExport } from './middle'
console.log(middleExport)
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-trans.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-trans.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-trans.js')).text()
    // Both INNER_PRIVATE decls exist inside their respective IIFE bodies.
    expect(countMatches(result, /\bconst INNER_PRIVATE\b/g)).toBe(2)
    // Parent destructures only `middleExport`.
    expect(result).toMatch(/const \{\s*middleExport\s*\}\s*=\s*\(\(\) =>/)
    // Inner IIFE surfaces only `innerExport` to the middle module's scope.
    expect(result).toMatch(/return \{\s*innerExport\s*\}/)
    // Outer IIFE surfaces only `middleExport`.
    expect(result).toMatch(/return \{\s*middleExport\s*\}/)
    // Bundle parses as a Script — would throw if both INNER_PRIVATE were
    // at top level (the regression we're guarding against).
    expect(() => new Function(result)).not.toThrow()
  })

  test('aliased named import: import { foo as bar }', async () => {
    writeFileSync(
      resolve(COMPONENTS_DIR, 'aliased.ts'),
      `export function origName() { return 1 }
`,
    )
    const clientJs = `import { origName as renamed } from './aliased'
console.log(renamed())
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-a.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-a.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-a.js')).text()
    // Destructure remaps origName -> renamed at the splice site.
    expect(result).toMatch(/const \{\s*origName:\s*renamed\s*\}\s*=\s*\(\(\) =>/)
    expect(result).toMatch(/return \{\s*origName\s*\}/)
  })

  test('namespace import: import * as ns surfaces all top-level exports', async () => {
    writeFileSync(
      resolve(COMPONENTS_DIR, 'ns-mod.ts'),
      `const HIDDEN = 'hidden'
export const a = 1
export function b() { return HIDDEN }
export class C {}
`,
    )
    const clientJs = `import * as ns from './ns-mod'
console.log(ns.a, ns.b(), new ns.C())
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-ns.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-ns.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-ns.js')).text()
    // ns binding is set up at the splice site.
    expect(result).toMatch(/const ns\s*=\s*\(\(\) =>/)
    // All top-level exported names appear in the return object.
    expect(result).toMatch(/return \{[^}]*\ba\b[^}]*\}/)
    expect(result).toMatch(/return \{[^}]*\bb\b[^}]*\}/)
    expect(result).toMatch(/return \{[^}]*\bC\b[^}]*\}/)
    // HIDDEN (private) is not in the return.
    expect(result).not.toMatch(/return \{[^}]*\bHIDDEN\b/)
  })
})
