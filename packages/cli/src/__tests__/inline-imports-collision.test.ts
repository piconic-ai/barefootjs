// Tests for piconic-ai/barefootjs#1141 — `resolveRelativeImports` wraps
// each inlined module's body in an IIFE that re-exports only the names
// the parent imports, so two siblings each declaring a module-private
// const with the same identifier (e.g. `BAR_STYLE` in both `CanvasActions.ts`
// and `ZoomBar.ts`) no longer collide at the parent's top level.
//
// Covers the core IIFE-wrap behaviour AND the edge cases the
// TypeScript-AST-based parsing handles (multi-line / trailing-comma /
// commented imports & exports, type-only decls, string literals containing
// `import` / `export`).

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

describe('resolveRelativeImports — IIFE-wrapped inlining (bf#1141)', () => {
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

  // ── AST edge cases ────────────────────────────────────────────────────────
  // Shapes the TypeScript-AST parser handles correctly that a regex pass
  // would miss or misclassify.

  test('multi-line `export { … }` block is fully stripped', async () => {
    writeFileSync(
      resolve(COMPONENTS_DIR, 'multi-export.ts'),
      `function alpha() { return 1 }
function beta() { return 2 }
function gamma() { return 3 }
export {
  alpha,
  beta,
  gamma,
}
`,
    )
    const clientJs = `import * as ns from './multi-export'
console.log(ns.alpha(), ns.beta(), ns.gamma())
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-me.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-me.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-me.js')).text()
    // The IIFE return surfaces all three (collected from the original TS
    // source's `export {…}` block).
    expect(result).toMatch(/return \{[^}]*\balpha\b[^}]*\}/)
    expect(result).toMatch(/return \{[^}]*\bbeta\b[^}]*\}/)
    expect(result).toMatch(/return \{[^}]*\bgamma\b[^}]*\}/)
    // The multi-line block must not survive in the body.
    expect(result).not.toMatch(/^\s*export\s*\{/m)
    expect(() => new Function(result)).not.toThrow()
  })

  test('trailing comma in `export { a, }` is handled', async () => {
    writeFileSync(
      resolve(COMPONENTS_DIR, 'trail.ts'),
      `function onlyOne() { return 42 }
export {
  onlyOne,
}
`,
    )
    const clientJs = `import * as ns from './trail'
console.log(ns.onlyOne())
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-tc.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-tc.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-tc.js')).text()
    expect(result).toMatch(/return \{\s*onlyOne\s*\}/)
    expect(result).not.toMatch(/^\s*export\s*\{/m)
    expect(() => new Function(result)).not.toThrow()
  })

  test('aliased export `export { a as b }` collects the exported alias', async () => {
    writeFileSync(
      resolve(COMPONENTS_DIR, 'alias-exp.ts'),
      `function internalName() { return 'aliased' }
export { internalName as publicName }
`,
    )
    const clientJs = `import * as ns from './alias-exp'
console.log(ns.publicName())
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-ax.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-ax.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-ax.js')).text()
    expect(result).toMatch(/return \{\s*publicName\s*\}/)
    expect(result).not.toMatch(/return \{\s*internalName\b/)
  })

  test('type-only export is excluded from namespace IIFE return', async () => {
    writeFileSync(
      resolve(COMPONENTS_DIR, 'types-mixed.ts'),
      `export interface Shape { x: number }
export type Color = 'red' | 'blue'
export const valueExport = 1
export function fnExport() { return 2 }
type Internal = string
export type { Internal }
`,
    )
    const clientJs = `import * as ns from './types-mixed'
console.log(ns.valueExport, ns.fnExport())
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-tm.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-tm.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-tm.js')).text()
    expect(result).toMatch(/return \{[^}]*\bvalueExport\b[^}]*\}/)
    expect(result).toMatch(/return \{[^}]*\bfnExport\b[^}]*\}/)
    // Type-only names have no runtime binding — must not appear in the return.
    expect(result).not.toMatch(/return \{[^}]*\bShape\b[^}]*\}/)
    expect(result).not.toMatch(/return \{[^}]*\bColor\b[^}]*\}/)
    expect(result).not.toMatch(/return \{[^}]*\bInternal\b[^}]*\}/)
    expect(() => new Function(result)).not.toThrow()
  })

  test('string literal containing `import` / `export` is not stripped', async () => {
    writeFileSync(
      resolve(COMPONENTS_DIR, 'str-lit.ts'),
      "const docs = 'how to import this module: see README'\n" +
      "const more = 'export this if needed'\n" +
      "export function getDocs() { return docs + ' / ' + more }\n",
    )
    const clientJs = `import { getDocs } from './str-lit'
console.log(getDocs())
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-sl.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-sl.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-sl.js')).text()
    // String literals must survive intact — they're not import/export
    // statements, just strings.
    expect(result).toContain('how to import this module')
    expect(result).toContain('export this if needed')
    expect(() => new Function(result)).not.toThrow()
  })

  test('comment inside named export decl: `export /* keep */ const a = 1`', async () => {
    writeFileSync(
      resolve(COMPONENTS_DIR, 'cmt-exp.ts'),
      `export /* keep */ const valueA = 'a'
export const valueB = 'b'
`,
    )
    const clientJs = `import { valueA, valueB } from './cmt-exp'
console.log(valueA, valueB)
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-cx.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-cx.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-cx.js')).text()
    expect(result).toMatch(/const \{\s*valueA,\s*valueB\s*\}\s*=\s*\(\(\) =>/)
    expect(result).not.toMatch(/^\s*export\s/m)
    expect(() => new Function(result)).not.toThrow()
  })

  test('type-only import in inlined module is erased by transpile', async () => {
    writeFileSync(
      resolve(COMPONENTS_DIR, 'types-only.ts'),
      `export type Color = 'red' | 'blue'
`,
    )
    writeFileSync(
      resolve(COMPONENTS_DIR, 'consumer.ts'),
      `import type { Color } from './types-only'
export const pickColor = (c: Color) => c
`,
    )
    const clientJs = `import { pickColor } from './consumer'
console.log(pickColor('red'))
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-to.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-to.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-to.js')).text()
    expect(result).toMatch(/const \{\s*pickColor\s*\}\s*=\s*\(\(\) =>/)
    expect(result).not.toMatch(/^\s*import\s/m)
    expect(result).not.toMatch(/^\s*export\s/m)
    expect(() => new Function(result)).not.toThrow()
  })

  test('named import with non-trivial whitespace is parsed', async () => {
    writeFileSync(
      resolve(COMPONENTS_DIR, 'wide.ts'),
      `export const aaa = 1
export const bbb = 2
`,
    )
    const clientJs = `import {   aaa as renamedA  ,   bbb   } from './wide'
console.log(renamedA, bbb)
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-wd.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-wd.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-wd.js')).text()
    expect(result).toMatch(/const \{\s*aaa:\s*renamedA,\s*bbb\s*\}\s*=\s*\(\(\) =>/)
    expect(result).toMatch(/return \{\s*aaa,\s*bbb\s*\}/)
    expect(() => new Function(result)).not.toThrow()
  })
})
