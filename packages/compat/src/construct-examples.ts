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

import ts from 'typescript'
import { ARRAY_METHOD_NAMES } from '@barefootjs/jsx'
import { jsxFixtures } from '../../adapter-tests/fixtures'
import { blobUrl, fixtureFileMap } from './repo-links'
import type { SupportMatrixCoverageMap } from './support-matrix'

/** One construct's exemplar fixture: what the case looks like, in prose and in code. */
export interface ConstructExample {
  /** Exemplar fixture id (the most narrowly targeted covering fixture). */
  fixture: string
  /** The fixture's human-written one-line description. */
  description: string
  /** GitHub permalink to the fixture source file. */
  url: string
  /**
   * The smallest expression in the exemplar's source matching this
   * construct (`items.at(-1)`), when one is extractable — see
   * `extractSnippet`. Omitted for constructs whose matcher is
   * intentionally undefined (`unsupported`) or when no in-budget match
   * exists.
   */
  code?: string
}

const ARRAY_METHOD_SET: ReadonlySet<string> = new Set(ARRAY_METHOD_NAMES)

/** Operators the compiler parses as `logical` (vs plain `binary`). */
const LOGICAL_OPS = new Set(['&&', '||', '??'])

/**
 * TS-node predicate for one construct label, mirroring (approximately —
 * this is documentation, not lowering) how `expression-parser.ts`
 * classifies expressions. `jsxOnly` restricts ubiquitous constructs
 * (`identifier`, `literal:*`) to nodes inside a JSX expression
 * container, so the match is a template expression like `{name}` and
 * not an import specifier or helper-local. Returns undefined for
 * constructs with no meaningful snippet (`unsupported` — the fixture
 * description already says what shape is refused).
 */
function matcherFor(construct: string): { test: (n: ts.Node) => boolean; jsxOnly?: boolean } | undefined {
  const [family, detail] = construct.includes(':')
    ? [construct.slice(0, construct.indexOf(':')), construct.slice(construct.indexOf(':') + 1)]
    : [construct, undefined]

  const literalTest = (n: ts.Node, type: string | undefined): boolean => {
    switch (type) {
      case 'string':
        return ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)
      case 'number':
        return ts.isNumericLiteral(n)
      case 'boolean':
        return n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword
      case 'null':
        return n.kind === ts.SyntaxKind.NullKeyword
      default:
        return literalTest(n, 'string') || literalTest(n, 'number') || literalTest(n, 'boolean') || literalTest(n, 'null')
    }
  }

  switch (family) {
    case 'identifier':
      return { test: ts.isIdentifier, jsxOnly: true }
    case 'literal':
      return { test: (n) => literalTest(n, detail), jsxOnly: true }
    case 'call':
      // Exclude catalogue methods so `count()` wins over `.at(-1)`.
      return {
        test: (n) =>
          ts.isCallExpression(n) &&
          !(ts.isPropertyAccessExpression(n.expression) && ARRAY_METHOD_SET.has(n.expression.name.text)),
      }
    case 'member':
      if (detail === 'optional')
        return {
          test: (n) =>
            (ts.isPropertyAccessChain(n) || ts.isElementAccessChain(n)) && n.questionDotToken !== undefined,
        }
      if (detail === 'computed')
        return {
          test: (n) =>
            ts.isElementAccessExpression(n) &&
            (ts.isStringLiteral(n.argumentExpression) || ts.isNumericLiteral(n.argumentExpression)),
        }
      return { test: ts.isPropertyAccessExpression }
    case 'index-access':
      // Non-literal index — the literal case stays a computed `member`.
      return {
        test: (n) =>
          ts.isElementAccessExpression(n) &&
          !ts.isStringLiteral(n.argumentExpression) &&
          !ts.isNumericLiteral(n.argumentExpression),
      }
    case 'binary':
      return {
        test: (n) =>
          ts.isBinaryExpression(n) &&
          (detail
            ? n.operatorToken.getText() === detail
            : !LOGICAL_OPS.has(n.operatorToken.getText()) && n.operatorToken.kind !== ts.SyntaxKind.EqualsToken),
      }
    case 'logical':
      return {
        test: (n) =>
          ts.isBinaryExpression(n) && (detail ? n.operatorToken.getText() === detail : LOGICAL_OPS.has(n.operatorToken.getText())),
      }
    case 'unary':
      return {
        test: (n) =>
          (ts.isPrefixUnaryExpression(n) && (!detail || ts.tokenToString(n.operator) === detail)) ||
          (ts.isTypeOfExpression(n) && (!detail || detail === 'typeof')),
      }
    case 'conditional':
      return { test: ts.isConditionalExpression }
    case 'template-literal':
      return { test: ts.isTemplateExpression }
    case 'arrow':
      return { test: ts.isArrowFunction }
    case 'regex':
      return { test: ts.isRegularExpressionLiteral }
    case 'array-literal':
      return { test: ts.isArrayLiteralExpression }
    case 'object-literal':
      return { test: ts.isObjectLiteralExpression }
    case 'array-method':
      return {
        test: (n) =>
          ts.isCallExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          (detail ? n.expression.name.text === detail : ARRAY_METHOD_SET.has(n.expression.name.text)),
      }
    default:
      return undefined
  }
}

/** Longest snippet worth putting in a table cell — anything bigger stays behind the fixture link. */
const SNIPPET_MAX_CHARS = 60

function hasAncestor(node: ts.Node, pred: (n: ts.Node) => boolean): boolean {
  for (let p = node.parent; p; p = p.parent) if (pred(p)) return true
  return false
}

/**
 * The smallest expression across the fixture's source files matching
 * the construct, whitespace-collapsed — smallest because the most
 * focused occurrence reads best in a table cell (`items.at(-1)`, not a
 * whole ternary that happens to contain the call). Matches inside
 * import declarations never illustrate a template expression and are
 * skipped; over-budget matches are dropped rather than truncated
 * (truncated code misleads — the fixture link has the full context).
 */
function extractSnippet(sources: string[], construct: string): string | undefined {
  const matcher = matcherFor(construct)
  if (!matcher) return undefined

  let best: string | undefined
  for (const source of sources) {
    const sourceFile = ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node): void => {
      if (
        matcher.test(node) &&
        !hasAncestor(node, ts.isImportDeclaration) &&
        (!matcher.jsxOnly || hasAncestor(node, ts.isJsxExpression))
      ) {
        const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim()
        if (text.length <= SNIPPET_MAX_CHARS && (best === undefined || text.length < best.length)) {
          best = text
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return best
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
  const byId = new Map(jsxFixtures.map(f => [f.id, f]))

  const exemplarFor = (construct: string, field: 'kinds' | 'axes'): ConstructExample | undefined => {
    let best: string | undefined
    for (const [id, c] of Object.entries(coverage.fixtures)) {
      if (!c[field].includes(construct)) continue
      // Only fixtures we can both describe and link to are eligible.
      if (!byId.has(id) || !files.has(id)) continue
      if (
        best === undefined ||
        sizes.get(id)! < sizes.get(best)! ||
        (sizes.get(id) === sizes.get(best) && id < best)
      ) {
        best = id
      }
    }
    if (best === undefined) return undefined
    const fixture = byId.get(best)!
    const example: ConstructExample = {
      fixture: best,
      description: fixture.description,
      url: blobUrl(files.get(best)!),
    }
    const code = extractSnippet([fixture.source, ...Object.values(fixture.components ?? {})], construct)
    if (code) example.code = code
    return example
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
