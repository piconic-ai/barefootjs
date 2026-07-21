// GitHub permalinks for each `kind` / `axis` construct shown in the
// Compatibility Matrix docs page's "Construct Support" section — so a
// reader looking at e.g. `array-method:at` can jump straight to where
// that construct is recognised instead of guessing from the label.
//
// Links are computed with a TS AST walk (never regex/string matching —
// see CLAUDE.md's "Never parse imports/TS syntax with regex" rule) over
// the two files that are already the authoritative registries for these
// labels:
//   - `PARSED_EXPR_KINDS` / `ARRAY_METHOD_NAMES` in expression-parser.ts
//     (each entry sits on its own line, exhaustiveness-pinned already).
//   - the axis-derivation `switch` in coverage-map.ts's
//     `collectKindsAndAxes` (one `axes.add(...)` call site per axis
//     family — `binary:${op}`, `logical:${op}`, `unary:${op}`,
//     `literal:${literalType}` — plus the two exact `member:optional` /
//     `member:computed` literals).
//
// This module is invoked from `computeSupportMatrix()` on every
// `support-matrix:lock` regen, and the lock file is drift-checked in CI
// (support-matrix.test.ts + ci-compat.yml) same as every other field —
// so a link can never silently go stale. Moving a catalogue entry or a
// `case` updates the line number the next regen picks up, and CI fails
// if that regen is forgotten — the same guarantee the existing
// `compat-issue-freshness` schedule gives the issue-tracking links.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'path'
import ts from 'typescript'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const GITHUB_BLOB_BASE = 'https://github.com/piconic-ai/barefootjs/blob/main'

const EXPRESSION_PARSER_FILE = 'packages/jsx/src/expression-parser.ts'
const COVERAGE_MAP_FILE = 'packages/adapter-tests/src/coverage-map.ts'

export interface SourceLink {
  /** Repo-relative path, forward-slashed. */
  file: string
  /** 1-indexed source line. */
  line: number
  /** Ready-to-render GitHub permalink (`blob/main/<file>#L<line>`). */
  url: string
}

/** One axis family whose fixture-observed suffix (`===`, `string`, ...) isn't statically enumerable. */
interface AxisPrefixLink {
  /** e.g. `'binary:'` — matched with `axis.startsWith(prefix)`. */
  prefix: string
  link: SourceLink
}

/** Backing table for `resolveKindLink` / `resolveAxisLink`. */
export interface ConstructSourceLinks {
  kinds: Record<string, SourceLink>
  /** Exact-match axis labels: `member:optional`, `member:computed`, every `array-method:<method>`. */
  axisExact: Record<string, SourceLink>
  /** Family fallback for axes with a non-enumerable suffix: `binary:`, `logical:`, `unary:`, `literal:`. */
  axisPrefixes: AxisPrefixLink[]
}

function makeLink(file: string, line: number): SourceLink {
  return { file, line, url: `${GITHUB_BLOB_BASE}/${file}#L${line}` }
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}

function parseFile(relPath: string): ts.SourceFile {
  const abs = path.join(REPO_ROOT, relPath)
  return ts.createSourceFile(relPath, readFileSync(abs, 'utf8'), ts.ScriptTarget.Latest, true)
}

function forEachDescendant(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node)
  ts.forEachChild(node, child => forEachDescendant(child, visit))
}

/**
 * String-literal elements of `export const <constName> = [...] as const
 * satisfies ...` → their 1-indexed line. Walks the whole initializer
 * subtree (rather than assuming a fixed `as`/`satisfies` wrapper shape)
 * so it survives the wrapper being reshaped.
 */
function arrayLiteralLineMap(sourceFile: ts.SourceFile, constName: string): Map<string, number> {
  const lines = new Map<string, number>()
  forEachDescendant(sourceFile, node => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== constName) return
    if (!node.initializer) return
    forEachDescendant(node.initializer, inner => {
      if (ts.isStringLiteral(inner)) lines.set(inner.text, lineOf(sourceFile, inner))
    })
  })
  return lines
}

/** One `axes.add(...)` call site in `collectKindsAndAxes`'s switch. */
interface AxisAddSite {
  /** Set when the argument is a plain string literal (`'member:optional'`). */
  exact?: string
  /** Set when the argument is a template literal — its text before the first `${` (`'binary:'`). */
  prefix?: string
  line: number
}

function collectAxisAddSites(sourceFile: ts.SourceFile): AxisAddSite[] {
  const sites: AxisAddSite[] = []
  forEachDescendant(sourceFile, node => {
    if (!ts.isCallExpression(node)) return
    const callee = node.expression
    if (!ts.isPropertyAccessExpression(callee)) return
    if (callee.name.text !== 'add') return
    if (!ts.isIdentifier(callee.expression) || callee.expression.text !== 'axes') return
    const arg = node.arguments[0]
    if (!arg) return
    const line = lineOf(sourceFile, node)
    if (ts.isStringLiteral(arg)) sites.push({ exact: arg.text, line })
    else if (ts.isTemplateExpression(arg)) sites.push({ prefix: arg.head.text, line })
  })
  return sites
}

export function computeConstructSourceLinks(): ConstructSourceLinks {
  const exprParserSource = parseFile(EXPRESSION_PARSER_FILE)
  const coverageMapSource = parseFile(COVERAGE_MAP_FILE)

  const kindLines = arrayLiteralLineMap(exprParserSource, 'PARSED_EXPR_KINDS')
  const methodLines = arrayLiteralLineMap(exprParserSource, 'ARRAY_METHOD_NAMES')
  const axisAddSites = collectAxisAddSites(coverageMapSource)

  const kinds: Record<string, SourceLink> = {}
  for (const [kind, line] of kindLines) kinds[kind] = makeLink(EXPRESSION_PARSER_FILE, line)

  const axisExact: Record<string, SourceLink> = {}
  for (const site of axisAddSites) {
    if (site.exact) axisExact[site.exact] = makeLink(COVERAGE_MAP_FILE, site.line)
  }
  // Every `array-method:<method>` points at its own `ARRAY_METHOD_NAMES`
  // line rather than the one shared `axes.add(`array-method:${rec.method}`)`
  // call site every method funnels through in coverage-map.ts.
  for (const [method, line] of methodLines) {
    axisExact[`array-method:${method}`] = makeLink(EXPRESSION_PARSER_FILE, line)
  }

  const axisPrefixes: AxisPrefixLink[] = axisAddSites
    .filter((s): s is AxisAddSite & { prefix: string } => Boolean(s.prefix))
    .map(s => ({ prefix: s.prefix, link: makeLink(COVERAGE_MAP_FILE, s.line) }))

  return { kinds, axisExact, axisPrefixes }
}

export function resolveKindLink(kind: string, links: ConstructSourceLinks): SourceLink | undefined {
  return links.kinds[kind]
}

export function resolveAxisLink(axis: string, links: ConstructSourceLinks): SourceLink | undefined {
  const exact = links.axisExact[axis]
  if (exact) return exact
  return links.axisPrefixes.find(p => axis.startsWith(p.prefix))?.link
}
