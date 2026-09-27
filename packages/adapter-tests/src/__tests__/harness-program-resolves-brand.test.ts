/**
 * Guard for `harnessProgramFor` / `compileFixtureJSX` (#3220).
 *
 * Fails loudly when a harness compile can no longer resolve
 * `@barefootjs/client`'s published types, or when `compileJSX` stops
 * accepting the harness Program — for the probe source below, or for a
 * `components` source compiled under its literal key (the corpus-wide
 * check lives in `client-js-scope.test.ts`). Either
 * regression would otherwise be silent: every `Reactive<T>` accessor read
 * degrades to `any` (or type resolution goes back to depending on
 * `process.cwd()`), with no red test anywhere in the suite to say so.
 *
 * Every case runs with `process.cwd()` pinned to the repo root — the cwd
 * where the pre-#3220 harness saw `any` (there is no
 * `node_modules/@barefootjs` there) — so the guard means the same thing
 * whether `bun test` was started from the root or from a package.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import {
  disableCompilerInstrumentation,
  enableCompilerInstrumentation,
  getCompilerCounters,
  resetCompilerCounters,
} from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { jsxFixtures } from '../../fixtures'
import { compileFixtureJSX, harnessProgramFor } from '../harness-program'
import { HARNESS_PROGRAM_REJECTION_EXCEPTIONS, harnessProgramOverbuild } from '../harness-program-ledger'

const REPO_ROOT = path.resolve(import.meta.dir, '../../../..')

// `.map(` makes `needsTypeBasedDetection` true, so the harness builds a
// Program for this source (as the compiler itself would otherwise).
const SOURCE = `
'use client'
import { createQuery } from '@barefootjs/client'

export function Probe() {
  const [, fetchProbe] = createQuery(async () => [1, 2], { initial: [1, 2] })
  return <ul onClick={() => console.log(fetchProbe.isPending())}>{[1, 2].map(n => <li key={n}>{n}</li>)}</ul>
}
`

const FILENAME = 'component.tsx'

describe('harness Program resolves @barefootjs/client types independent of cwd', () => {
  let savedCwd = ''
  beforeAll(() => {
    savedCwd = process.cwd()
    process.chdir(REPO_ROOT)
  })
  afterAll(() => {
    process.chdir(savedCwd)
  })

  test('a Reactive<T> accessor read is seen as its real type, not `any`', () => {
    const program = harnessProgramFor(SOURCE, FILENAME)
    expect(program).toBeDefined()
    if (!program) return
    // The same lookup `compileJSX` / `analyzeComponent` make with the
    // relative filename before accepting a caller Program.
    const sourceFile = program.getSourceFile(FILENAME)
    expect(sourceFile?.text).toBe(SOURCE)
    if (!sourceFile) return
    const checker = program.getTypeChecker()

    let typeAtCall = ''
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'isPending'
      ) {
        typeAtCall = checker.typeToString(checker.getTypeAtLocation(node))
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)

    // The unresolved failure mode types this `any` — asserting the
    // concrete `boolean` is what distinguishes "the brand resolved" from
    // "TypeScript gave up".
    expect(typeAtCall).toBe('boolean')
  })

  test('compileJSX accepts the harness Program instead of building its own', () => {
    enableCompilerInstrumentation()
    try {
      resetCompilerCounters()
      const result = compileFixtureJSX(SOURCE, FILENAME, { adapter: new HonoAdapter() })
      expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
      // Exactly one Program: the harness's. A second one would be the
      // compiler's own cwd-relative fallback (`createProgramForFile`
      // without a `currentDirectory`), i.e. the harness Program was
      // rejected.
      expect(getCompilerCounters().programCreations).toBe(1)
    } finally {
      disableCompilerInstrumentation()
      resetCompilerCounters()
    }
  })
})

// The corpus-wide acceptance check lives in the client-JS scope gate
// (`client-js-scope.test.ts`), which already compiles every entry and
// `components` source. It compiles children under a sanitised
// `<id>__<key>.tsx` filename, though, while the conformance renderers
// compile them under the literal `components` key (`./Child.tsx`,
// `../Child`, `@/components/ui/x`: relative, extensionless, aliased).
// The count depends on the source, not the filename, and was identical
// under both namings for all 564 sources when this moved. This check
// keeps the renderers' literal filenames covered too. No `components`
// source needs a Program today, so the walk is 71 plain compiles (~9 s).
describe('components sources accept the harness Program under their literal key', () => {
  let savedCwd = ''
  beforeAll(() => {
    savedCwd = process.cwd()
    process.chdir(REPO_ROOT)
  })
  afterAll(() => {
    process.chdir(savedCwd)
  })

  test('no compile builds a Program beyond the harness one', () => {
    const rejected: string[] = []
    enableCompilerInstrumentation()
    try {
      for (const fixture of jsxFixtures) {
        for (const [filename, source] of Object.entries(fixture.components ?? {})) {
          const key = `${fixture.id}:${filename}`
          resetCompilerCounters()
          try {
            compileFixtureJSX(source, filename, { adapter: new HonoAdapter() })
          } finally {
            const overbuild = harnessProgramOverbuild(source)
            if (overbuild && !HARNESS_PROGRAM_REJECTION_EXCEPTIONS.has(key)) rejected.push(`${key}: ${overbuild}`)
          }
        }
      }
    } finally {
      disableCompilerInstrumentation()
      resetCompilerCounters()
    }
    expect(rejected).toEqual([])
  }, 120_000)
})

// A non-literal specifier cannot be checked, so it is reported as-is and fails.
function specifierText(node: ts.Node): string {
  return ts.isStringLiteralLike(node) ? node.text : `<non-literal specifier: ${node.getText()}>`
}

// The adapters' `test-render` modules import `harness-program.ts` through
// the `@barefootjs/adapter-tests/harness-program` subpath precisely so they
// do NOT load the barrel (fixture corpus, `bun:test`, happy-dom, and a
// cycle back into `test-render`). That only holds while the module itself
// stays leaf-like, so pin its runtime imports (TS AST walk, not a regex).
describe('harness-program.ts stays importable without the barrel', () => {
  test('its runtime imports, re-exports and dynamic imports are only @barefootjs/jsx and node builtins', () => {
    const file = path.join(import.meta.dir, '..', 'harness-program.ts')
    const sourceFile = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const runtimeImports: string[] = []
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
        runtimeImports.push(specifierText(node.moduleSpecifier))
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {
        runtimeImports.push(specifierText(node.moduleSpecifier))
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [arg] = node.arguments
        runtimeImports.push(arg ? specifierText(arg) : '<import() without a specifier>')
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    expect(runtimeImports.filter(s => s !== '@barefootjs/jsx' && !s.startsWith('node:'))).toEqual([])
  })
})
