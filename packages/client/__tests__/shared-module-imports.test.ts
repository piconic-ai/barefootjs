/**
 * The main entry and `/runtime` are bundled separately (`build:js`), with only
 * the `@barefootjs/client/reactive` and `@barefootjs/client/async` subpaths
 * external. A module whose state or identity a page must see once — the
 * reactive runtime, the query cache, the `HttpError` class — must therefore be
 * reached only through its subpath. If either entry reached it through a
 * relative import, that entry's bundle would carry its own copy.
 */

import { describe, test, expect } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const SRC = join(import.meta.dir, '..', 'src')

/** Entries `build:js` bundles on their own, relative to `src/`. */
const SEPARATELY_BUNDLED_ENTRIES = ['index.ts', 'runtime/index.ts']

/** Modules with state or identity, relative to `src/`, and the subpath that owns each. */
const SHARED_MODULES: Record<string, string> = {
  'reactive.ts': '@barefootjs/client/reactive',
  'http.ts': '@barefootjs/client/async',
  'create-query.ts': '@barefootjs/client/async',
}

/** Relative value imports / re-exports of `file` (type-only ones are erased from the bundle). */
function relativeValueImports(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const out: string[] = []
  for (const stmt of source.statements) {
    if (!(ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt))) continue
    if (!stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (!stmt.moduleSpecifier.text.startsWith('.')) continue
    if (ts.isImportDeclaration(stmt) && stmt.importClause?.isTypeOnly) continue
    if (ts.isExportDeclaration(stmt) && stmt.isTypeOnly) continue
    out.push(join(file, '..', stmt.moduleSpecifier.text))
  }
  return out
}

/** Every `src/` module `entry` reaches through relative value imports — what its bundle contains. */
function bundledModules(entry: string): Map<string, string> {
  const reachedFrom = new Map<string, string>()
  const queue = [join(SRC, entry)]
  reachedFrom.set(join(SRC, entry), entry)
  while (queue.length > 0) {
    const file = queue.shift()!
    for (const target of relativeValueImports(file)) {
      if (reachedFrom.has(target) || !existsSync(target)) continue
      reachedFrom.set(target, relative(SRC, file))
      queue.push(target)
    }
  }
  return reachedFrom
}

describe('shared-module imports', () => {
  for (const entry of SEPARATELY_BUNDLED_ENTRIES) {
    test(`${entry} reaches no shared module through a relative import`, () => {
      const bundled = bundledModules(entry)
      const copies: string[] = []
      for (const [module, subpath] of Object.entries(SHARED_MODULES)) {
        const importer = bundled.get(join(SRC, module))
        if (importer) copies.push(`${module} (imported by ${importer}; use ${subpath})`)
      }
      expect(copies).toEqual([])
    })
  }
})
