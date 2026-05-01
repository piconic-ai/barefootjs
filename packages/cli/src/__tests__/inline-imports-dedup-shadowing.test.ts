// Tests for piconic-ai/barefootjs#1153 — when the parent directly imports
// `./foo` and a transitive sibling has already pulled `./foo` in, the
// parent's own import line USED to be silently stripped (dedup via
// `inlinedPaths.has`) without producing any top-level binding. The result
// was a `ReferenceError: foo is not defined` at hydration because the
// inlined module's IIFE wrap lived inside the sibling's IIFE.
//
// The fix hoists every inlined `.ts` module's IIFE to the parent bundle's
// top level (one IIFE per unique path, in topological order). Each direct
// import — parent's or transitive's — becomes a destructure pulling from
// the per-module top-level binding (`__bf_inline_N`), so closure resolves
// the binding correctly regardless of where the import line lived.

import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { resolveRelativeImports } from '../lib/resolve-imports'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'

const TEST_DIR = resolve(tmpdir(), `bf-test-inline-dedup-${Date.now()}`)
const DIST_DIR = resolve(TEST_DIR, 'dist')
const COMPONENTS_DIR = resolve(DIST_DIR, 'components', 'canvas')

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
  mkdirSync(COMPONENTS_DIR, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

function countMatches(s: string, re: RegExp): number {
  return [...s.matchAll(re)].length
}

describe('resolveRelativeImports — top-level hoisting + dedup (bf#1153)', () => {
  test('parent direct import + transitive import of same .ts: parent body sees the binding', async () => {
    // Bug repro shape: parent imports `usePresence` (which transitively
    // imports `readOnlyContext`), AND parent imports `readOnlyContext`
    // directly. Old behaviour silently stripped the parent's line.
    writeFileSync(
      resolve(COMPONENTS_DIR, 'readOnlyContext.ts'),
      `export const readOnlyContext = { kind: 'ctx', value: false }
`,
    )
    writeFileSync(
      resolve(COMPONENTS_DIR, 'usePresence.ts'),
      `import { readOnlyContext } from './readOnlyContext'
export function usePresence() { return readOnlyContext.value }
`,
    )
    // Source order: usePresence FIRST (transitive pull), readOnlyContext SECOND.
    const clientJs = `import { usePresence } from './usePresence'
import { readOnlyContext } from './readOnlyContext'
function initDeskCanvas() {
  return { ctx: readOnlyContext, presence: usePresence() }
}
globalThis.__test_init = initDeskCanvas
`
    writeFileSync(resolve(COMPONENTS_DIR, 'DeskCanvas-1.js'), clientJs)

    const manifest = {
      DeskCanvas: { clientJs: 'components/canvas/DeskCanvas-1.js', markedTemplate: 'components/canvas/DeskCanvas.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'DeskCanvas-1.js')).text()
    // Parent's `readOnlyContext` import must NOT be silently stripped — it
    // either becomes an inline IIFE or destructures from the top-level
    // binding hoisted out of usePresence's recursion.
    expect(result).toMatch(/const \{\s*readOnlyContext\s*\}\s*=\s*__bf_inline_\d+/)
    // Parent's `usePresence` import resolved as well.
    expect(result).toMatch(/const \{\s*usePresence\s*\}\s*=\s*__bf_inline_\d+/)
    // Exactly one top-level IIFE wrap for `readOnlyContext` (deduped).
    const ctxIifes = countMatches(result, /const __bf_inline_\d+ = \(\(\) => \{\s*const readOnlyContext\b/g)
    expect(ctxIifes).toBe(1)
    // Bundle parses as a Script (top-level redeclarations would throw here).
    expect(() => new Function(result)).not.toThrow()
    // Runtime: the parent's bare `readOnlyContext` reference resolves and
    // matches what the transitive helper sees — no ReferenceError.
    const fn = new Function(result + '; return globalThis.__test_init()')
    const out = fn()
    expect(out.ctx).toBeDefined()
    expect(out.ctx.kind).toBe('ctx')
    expect(out.presence).toBe(false)
  })

  test('reverse source order: parent direct import BEFORE transitive sibling', async () => {
    // Mirror of the first test, with the import lines swapped. The bundle
    // shape should be identical: `readOnlyContext` still appears as ONE
    // top-level IIFE; both parent body and transitive helper see it.
    writeFileSync(
      resolve(COMPONENTS_DIR, 'readOnlyContext.ts'),
      `export const readOnlyContext = { kind: 'ctx', value: false }
`,
    )
    writeFileSync(
      resolve(COMPONENTS_DIR, 'usePresence.ts'),
      `import { readOnlyContext } from './readOnlyContext'
export function usePresence() { return readOnlyContext.value }
`,
    )
    // Source order: readOnlyContext FIRST, usePresence SECOND.
    const clientJs = `import { readOnlyContext } from './readOnlyContext'
import { usePresence } from './usePresence'
function initDeskCanvas() {
  return { ctx: readOnlyContext, presence: usePresence() }
}
globalThis.__test_init = initDeskCanvas
`
    writeFileSync(resolve(COMPONENTS_DIR, 'DeskCanvas-2.js'), clientJs)

    const manifest = {
      DeskCanvas: { clientJs: 'components/canvas/DeskCanvas-2.js', markedTemplate: 'components/canvas/DeskCanvas.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'DeskCanvas-2.js')).text()
    // Same shape regardless of order.
    expect(result).toMatch(/const \{\s*readOnlyContext\s*\}\s*=\s*__bf_inline_\d+/)
    expect(result).toMatch(/const \{\s*usePresence\s*\}\s*=\s*__bf_inline_\d+/)
    expect(countMatches(result, /const __bf_inline_\d+ = \(\(\) => \{\s*const readOnlyContext\b/g)).toBe(1)
    expect(() => new Function(result)).not.toThrow()
    const fn = new Function(result + '; return globalThis.__test_init()')
    const out = fn()
    expect(out.ctx).toBeDefined()
    expect(out.presence).toBe(false)
  })

  test('three-level chain: parent imports A and B; A imports B; B imports C', async () => {
    // C is the leaf. B uses C. A uses B. Parent imports A AND B directly.
    // After fix: each module emits exactly one top-level IIFE; everything
    // resolves via closure.
    writeFileSync(
      resolve(COMPONENTS_DIR, 'C.ts'),
      `export const cVal = 'c-leaf'
`,
    )
    writeFileSync(
      resolve(COMPONENTS_DIR, 'B.ts'),
      `import { cVal } from './C'
export const bVal = 'b:' + cVal
`,
    )
    writeFileSync(
      resolve(COMPONENTS_DIR, 'A.ts'),
      `import { bVal } from './B'
export const aVal = 'a:' + bVal
`,
    )
    const clientJs = `import { aVal } from './A'
import { bVal } from './B'
function init() { return { aVal, bVal } }
globalThis.__test_init = init
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-3level.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-3level.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-3level.js')).text()
    // Three unique top-level IIFEs (one per .ts module).
    expect(countMatches(result, /const __bf_inline_\d+\s*=\s*\(\(\) =>/g)).toBe(3)
    // Parent's destructures both resolve to top-level bindings.
    expect(result).toMatch(/const \{\s*aVal\s*\}\s*=\s*__bf_inline_\d+/)
    expect(result).toMatch(/const \{\s*bVal\s*\}\s*=\s*__bf_inline_\d+/)
    // Topological order: C's IIFE must precede B's; B's must precede A's.
    const cIdx = result.search(/const cVal = ['"]c-leaf['"]/)
    const bIdx = result.search(/const bVal = ['"]b:['"]/)
    const aIdx = result.search(/const aVal = ['"]a:['"]/)
    expect(cIdx).toBeGreaterThan(-1)
    expect(bIdx).toBeGreaterThan(cIdx)
    expect(aIdx).toBeGreaterThan(bIdx)
    expect(() => new Function(result)).not.toThrow()
    const fn = new Function(result + '; return globalThis.__test_init()')
    const out = fn()
    expect(out.aVal).toBe('a:b:c-leaf')
    expect(out.bVal).toBe('b:c-leaf')
  })

  test('two transitive siblings each importing the same .ts: dedup, exactly one IIFE', async () => {
    // Sibling A and Sibling B both import `./shared`. Parent imports A and B.
    // The fix must dedup `./shared` to a single top-level IIFE.
    writeFileSync(
      resolve(COMPONENTS_DIR, 'shared.ts'),
      `export const sharedConst = 'shared-value'
`,
    )
    writeFileSync(
      resolve(COMPONENTS_DIR, 'sibA.ts'),
      `import { sharedConst } from './shared'
export const fromA = 'A:' + sharedConst
`,
    )
    writeFileSync(
      resolve(COMPONENTS_DIR, 'sibB.ts'),
      `import { sharedConst } from './shared'
export const fromB = 'B:' + sharedConst
`,
    )
    const clientJs = `import { fromA } from './sibA'
import { fromB } from './sibB'
function init() { return { fromA, fromB } }
globalThis.__test_init = init
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-2sib.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-2sib.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-2sib.js')).text()
    // Exactly one top-level IIFE for `./shared` (deduped across siblings).
    expect(countMatches(result, /const sharedConst\b/g)).toBe(1)
    // Three modules total, three top-level IIFEs.
    expect(countMatches(result, /const __bf_inline_\d+\s*=\s*\(\(\) =>/g)).toBe(3)
    expect(() => new Function(result)).not.toThrow()
    const fn = new Function(result + '; return globalThis.__test_init()')
    const out = fn()
    expect(out.fromA).toBe('A:shared-value')
    expect(out.fromB).toBe('B:shared-value')
  })

  test('side-effect-only import does not redeclare its top-level binding twice', async () => {
    // Parent imports a module both as side-effect AND for a named export.
    // The fix path that pushes a "side-effect" shape into consumerShapes
    // must not cause the IIFE to be built twice or the binding to clash.
    writeFileSync(
      resolve(COMPONENTS_DIR, 'effect.ts'),
      `let counter = 0
export function bump() { counter += 1; return counter }
globalThis.__bf_effect_ran = true
`,
    )
    const clientJs = `import './effect'
import { bump } from './effect'
function init() { return { ran: globalThis.__bf_effect_ran, n: bump() } }
globalThis.__test_init = init
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Comp-eff.js'), clientJs)

    const manifest = {
      Comp: { clientJs: 'components/canvas/Comp-eff.js', markedTemplate: 'components/canvas/Comp.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Comp-eff.js')).text()
    // The effect module must be wrapped in exactly one top-level IIFE.
    expect(countMatches(result, /const __bf_inline_\d+\s*=\s*\(\(\) =>/g)).toBe(1)
    expect(() => new Function(result)).not.toThrow()
    const fn = new Function(result + '; return globalThis.__test_init()')
    const out = fn()
    expect(out.ran).toBe(true)
    expect(out.n).toBe(1)
  })
})
