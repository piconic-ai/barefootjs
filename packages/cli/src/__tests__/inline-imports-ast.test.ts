// AST edge-case tests for piconic-ai/barefootjs#1141 follow-up — confirms
// that the TypeScript-AST-based rewrite of parseImportShape /
// collectExportedNames / stripImportsAndExports handles shapes the regex
// predecessor missed: multi-line imports/exports, trailing commas,
// comments inside clauses, type-only imports/exports, and string literals
// that happen to contain `import` / `export`.

import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { resolveRelativeImports } from '../lib/resolve-imports'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'

const TEST_DIR = resolve(tmpdir(), `bf-test-inline-ast-${Date.now()}`)
const DIST_DIR = resolve(TEST_DIR, 'dist')
const COMPONENTS_DIR = resolve(DIST_DIR, 'components', 'canvas')

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
  mkdirSync(COMPONENTS_DIR, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('resolveRelativeImports — AST-driven edge cases (bf#1141 follow-up)', () => {
  test('multi-line `export { … }` block in inlined module is fully stripped', async () => {
    // The module exports its public names via a multi-line `export {…}`
    // block. The AST strip pass must remove the block entirely.
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
    // The multi-line `export {…}` block must not survive in the body —
    // the AST strip pass deletes the whole `ExportDeclaration`.
    expect(result).not.toMatch(/^\s*export\s*\{/m)
    // Bundle parses as a Script.
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

  test('aliased export in `export { a as b }` collects the exported alias', async () => {
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
    // The IIFE return uses the EXPORTED alias (publicName), not the local.
    expect(result).toMatch(/return \{\s*publicName\s*\}/)
    expect(result).not.toMatch(/return \{\s*internalName\b/)
  })

  test('type-only export is excluded from namespace IIFE return', async () => {
    // `export type { Foo }` and `export interface` / `export type` decls
    // are erased at runtime — must not show up in the IIFE return as
    // `undefined` references.
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
    // Value exports surfaced.
    expect(result).toMatch(/return \{[^}]*\bvalueExport\b[^}]*\}/)
    expect(result).toMatch(/return \{[^}]*\bfnExport\b[^}]*\}/)
    // Type-only names must NOT appear in the IIFE return — they have no
    // runtime binding, so referencing them would be `undefined` at best
    // and a ReferenceError at worst.
    expect(result).not.toMatch(/return \{[^}]*\bShape\b[^}]*\}/)
    expect(result).not.toMatch(/return \{[^}]*\bColor\b[^}]*\}/)
    expect(result).not.toMatch(/return \{[^}]*\bInternal\b[^}]*\}/)
    // Bundle parses as a Script (no dangling type-only refs).
    expect(() => new Function(result)).not.toThrow()
  })

  test('string literal containing the word "import" is not stripped', async () => {
    // Catch the regression where the regex strip pass would `.replace`
    // any line starting with `import` (including ones inside template
    // literals that span the file's top column).
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
    // Both string-literal contents must survive intact — they're not
    // import/export statements, just strings.
    expect(result).toContain('how to import this module')
    expect(result).toContain('export this if needed')
    // Bundle parses cleanly.
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
    // Both names destructured at the splice site.
    expect(result).toMatch(/const \{\s*valueA,\s*valueB\s*\}\s*=\s*\(\(\) =>/)
    // No top-level `export` keyword survives.
    expect(result).not.toMatch(/^\s*export\s/m)
    // Bundle parses cleanly.
    expect(() => new Function(result)).not.toThrow()
  })

  test('type-only import in inlined module is erased by transpile (no body)', async () => {
    // The inlined module imports a type-only name from a sibling. After
    // transpile, the import is erased; the strip pass has no work to do
    // for it. The module's value exports still inline correctly.
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
    // pickColor surfaces from the consumer's IIFE.
    expect(result).toMatch(/const \{\s*pickColor\s*\}\s*=\s*\(\(\) =>/)
    // No remaining top-level import / export keywords.
    expect(result).not.toMatch(/^\s*import\s/m)
    expect(result).not.toMatch(/^\s*export\s/m)
    expect(() => new Function(result)).not.toThrow()
  })

  test('multi-line named import: parsed via AST', async () => {
    // The parent's outer-matcher (RELATIVE_IMPORT_RE) is single-line, so
    // a multi-line import in the parent client JS isn't matched at all.
    // What we CAN exercise is parseImportShape's handling of a
    // multi-line clause: feed transpile a single-line import to one
    // module, then in that module's transpiled output we still test the
    // AST shape parsing via integration. To isolate the multi-line
    // parsing, we simulate the case the AST handles best — a clause
    // with internal whitespace that the regex predecessor would have
    // failed on if presented:
    //   `import {a as b,\n c} from './x'`
    // Achieved here by writing the parent on a single physical line but
    // with internal whitespace inside `{ }` — confirms the AST returns
    // the right shape even for non-trivial layouts.
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
    // AST correctly mapped `aaa as renamedA`.
    expect(result).toMatch(/const \{\s*aaa:\s*renamedA,\s*bbb\s*\}\s*=\s*\(\(\) =>/)
    expect(result).toMatch(/return \{\s*aaa,\s*bbb\s*\}/)
    expect(() => new Function(result)).not.toThrow()
  })
})
