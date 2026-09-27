/**
 * Guard for `harnessProgramFor` / `compileFixtureJSX` (#3220).
 *
 * Fails loudly when a harness compile can no longer resolve
 * `@barefootjs/client`'s published types, or when `compileJSX` stops
 * accepting the harness Program for the relative virtual filename. Either
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
import path from 'node:path'
import ts from 'typescript'
import {
  disableCompilerInstrumentation,
  enableCompilerInstrumentation,
  getCompilerCounters,
  resetCompilerCounters,
} from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { compileFixtureJSX, harnessProgramFor } from '../harness-program'

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
