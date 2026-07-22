// Representative example per `kind` / `axis` construct for the docs
// page's Construct Support tables: a definition-line permalink
// (construct-source-links.ts) tells a reader where `array-method:at` is
// *registered*, but not what the case looks like. Each construct's
// covering conformance fixtures are exactly that documentation — a
// small self-contained component with a human-written `description`
// ("`.at(-1)` returns the last element") and a docstring — so the docs
// page links the construct to one of those instead, and shows the
// description inline.
//
// Exemplar choice is mechanical: among the fixtures the coverage map
// says exercise the construct, take the one with the SMALLEST total
// coverage set (fewest kinds + axes = the most narrowly targeted
// fixture — `array-at`, not a kitchen-sink component that happens to
// call `.at()` somewhere), tie-broken by id. Recomputed on every
// `support-matrix:lock` regen and drift-checked in CI with the rest of
// the lock file, so the exemplar, its description, and its file link
// can never silently go stale.

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'path'
import ts from 'typescript'
import { jsxFixtures } from '../../adapter-tests/fixtures'
import type { SupportMatrixCoverageMap } from './support-matrix'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const GITHUB_BLOB_BASE = 'https://github.com/piconic-ai/barefootjs/blob/main'
const FIXTURES_DIR = 'packages/adapter-tests/fixtures'

/** One construct's exemplar fixture: what the case looks like, in prose and in code. */
export interface ConstructExample {
  /** Exemplar fixture id (the most narrowly targeted covering fixture). */
  fixture: string
  /** The fixture's human-written one-line description. */
  description: string
  /** GitHub permalink to the fixture source file. */
  url: string
}

/**
 * Fixture id → repo-relative file path, built by AST-walking every
 * `.ts` under the fixtures tree for a string-literal `id:` property
 * (never regex — CLAUDE.md). Fixture files declare their id exactly
 * once (`createFixture({ id: '...' })` or a shared `spec` object), and
 * ids are corpus-unique, so the first declaration wins.
 */
function fixtureFileMap(): Map<string, string> {
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

/** Coverage-set size per fixture id — the exemplar-choice metric (smaller = more targeted). */
function coverageSizes(coverage: SupportMatrixCoverageMap): Map<string, number> {
  const sizes = new Map<string, number>()
  for (const [id, c] of Object.entries(coverage.fixtures)) {
    sizes.set(id, c.kinds.length + c.axes.length)
  }
  return sizes
}

export interface ConstructExamples {
  kinds: Record<string, ConstructExample>
  axes: Record<string, ConstructExample>
}

export function computeConstructExamples(coverage: SupportMatrixCoverageMap): ConstructExamples {
  const files = fixtureFileMap()
  const sizes = coverageSizes(coverage)
  const descriptions = new Map(jsxFixtures.map(f => [f.id, f.description]))

  const exemplarFor = (construct: string, field: 'kinds' | 'axes'): ConstructExample | undefined => {
    let best: string | undefined
    for (const [id, c] of Object.entries(coverage.fixtures)) {
      if (!c[field].includes(construct)) continue
      // Only fixtures we can both describe and link to are eligible.
      if (!descriptions.has(id) || !files.has(id)) continue
      if (
        best === undefined ||
        sizes.get(id)! < sizes.get(best)! ||
        (sizes.get(id) === sizes.get(best) && id < best)
      ) {
        best = id
      }
    }
    if (best === undefined) return undefined
    return {
      fixture: best,
      description: descriptions.get(best)!,
      url: `${GITHUB_BLOB_BASE}/${files.get(best)!}`,
    }
  }

  const kinds: Record<string, ConstructExample> = {}
  const axes: Record<string, ConstructExample> = {}
  for (const c of Object.keys(coverage.kindCounts)) {
    const ex = exemplarFor(c, 'kinds')
    if (ex) kinds[c] = ex
  }
  for (const c of Object.keys(coverage.axisCounts)) {
    const ex = exemplarFor(c, 'axes')
    if (ex) axes[c] = ex
  }
  return { kinds, axes }
}
