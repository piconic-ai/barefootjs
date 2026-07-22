// Shared GitHub-permalink helpers for the compat lockfile generators.
// The docs Compatibility Matrix page links each row to the code it
// stands for; this module centralises the repo constants and the
// fixture-id → source-file resolution those links need, so
// `construct-examples.ts` (Construct Support rows) and
// `component-docs.ts` (component + fixture-corpus rows) build identical
// URLs from one place.

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'path'
import ts from 'typescript'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const GITHUB_BLOB_BASE = 'https://github.com/piconic-ai/barefootjs/blob/main'

const FIXTURES_DIR = 'packages/adapter-tests/fixtures'

/** `<GITHUB_BLOB_BASE>/<repoRelativePath>` — forward-slashed, no line fragment. */
export function blobUrl(repoRelativePath: string): string {
  return `${GITHUB_BLOB_BASE}/${repoRelativePath}`
}

/**
 * Fixture id → repo-relative file path, built by AST-walking every
 * `.ts` under the fixtures tree for a string-literal `id:` property
 * (never regex — CLAUDE.md). Fixture files declare their id exactly
 * once (`createFixture({ id: '...' })` or a shared `spec` object), and
 * ids are corpus-unique, so the first declaration wins.
 */
export function fixtureFileMap(): Map<string, string> {
  const map = new Map<string, string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        walk(rel)
        continue
      }
      if (!entry.name.endsWith('.ts')) continue
      const sourceFile = ts.createSourceFile(
        rel,
        readFileSync(path.join(REPO_ROOT, rel), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      )
      const visit = (node: ts.Node): void => {
        if (
          ts.isPropertyAssignment(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === 'id' &&
          (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) &&
          !map.has(node.initializer.text)
        ) {
          map.set(node.initializer.text, rel)
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
    }
  }
  walk(FIXTURES_DIR)
  return map
}
