/**
 * Shrink-only ledger of direct `JSON.stringify(...)` calls on the emit paths
 * (#3726). A JS string literal the compiler writes into emitted code is
 * spelled by `codeSafeStringLiteral` / `codeSafeStringArray`
 * (`packages/jsx/src/js-string-literal.ts`), the one place that decides how a
 * value becomes JS source. A direct `JSON.stringify` there leaves `<`, `>`,
 * U+2028 and U+2029 raw.
 *
 * Scanned: every non-test `.ts` file under `packages/jsx/src/ir-to-client-js/`
 * (the client-JS emitter), the shared emit helpers outside it
 * (`template-parts.ts`, `props-binding.ts`), and the Hono adapter, whose
 * marked template is a TSX module. Calls are found on the TS AST, so a
 * mention in a comment or a string does not count.
 *
 * ALLOWED pins the exact count per file. Every remaining call is NOT a
 * string-literal spelling: an internal error message, a JSON file, or a
 * structured value (an object of assets / prop names) serialised as a JS
 * object literal. A count above its entry means a new direct call: spell the
 * literal with `codeSafeStringLiteral` instead. A count below means one was
 * removed: lower the entry.
 */

import { describe, test, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')

const SCAN_DIRS = ['packages/jsx/src/ir-to-client-js']
const SCAN_FILES = [
  'packages/jsx/src/template-parts.ts',
  'packages/jsx/src/props-binding.ts',
  'packages/adapter-hono/src/adapter/hono-adapter.ts',
]

/** Exact per-file counts of direct `JSON.stringify(...)` calls (see header). */
const ALLOWED: Readonly<Record<string, number>> = {
  // `throw new Error(...)` messages for an unreachable IR kind.
  'packages/jsx/src/ir-to-client-js/utils.ts': 1,
  'packages/jsx/src/ir-to-client-js/walker.ts': 1,
  'packages/jsx/src/ir-to-client-js/control-flow/stringify/loop.ts': 1,
  // The `.map` file is JSON, read by tools, never spliced into JS.
  'packages/jsx/src/ir-to-client-js/source-map.ts': 1,
  // The Hono adapter's three remaining calls serialise structured values (the preload / script asset lists and the
  // live-only prop map) as object literals for runtime registries.
  'packages/adapter-hono/src/adapter/hono-adapter.ts': 3,
}

function listTs(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__tests__') continue
      out.push(...listTs(p))
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      out.push(p)
    }
  }
  return out
}

function countJsonStringifyCalls(path: string): number {
  const sf = ts.createSourceFile(path, readFileSync(path, 'utf-8'), ts.ScriptTarget.Latest, true)
  let count = 0
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'JSON' &&
      node.expression.name.text === 'stringify'
    ) {
      count++
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return count
}

describe('emit-path JSON.stringify ledger (#3726)', () => {
  const files = [
    ...SCAN_DIRS.flatMap(d => listTs(join(REPO_ROOT, d))),
    ...SCAN_FILES.map(f => join(REPO_ROOT, f)),
  ]
  const actual: Record<string, number> = {}
  for (const file of files) {
    const n = countJsonStringifyCalls(file)
    if (n > 0) actual[relative(REPO_ROOT, file).split(sep).join('/')] = n
  }

  test('scans the emitter', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  test('every direct call is an allowlisted non-literal use, at its exact count', () => {
    expect(actual).toEqual(ALLOWED)
  })
})
