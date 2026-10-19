/**
 * The emit-parse ratchet (#3516).
 *
 * `spec/adapter-architecture.md` (rule 1 of the constitution) forbids
 * Phase 2 code — the client-JS emitter and the template adapters — from
 * re-parsing JS/TS source text: the IR carries the parsed trees and the
 * semantics, decided once in Phase 1. Every parser call left in Phase 2
 * re-derives a meaning the IR should already hold, and is where emit-time
 * decisions drift from the analyzer's.
 *
 * The check counts those calls per function, the way the complexity
 * ratchet counts cognitive complexity: `emit-parse-baseline.json` records
 * the current count of every function that has any, and the check fails
 * when a function's count grew, when a new function gained one, when a
 * file's total grew (a renamed function cannot hide a call), or when the
 * baseline no longer matches the tree (a call was removed and the baseline
 * must be regenerated, so it only ever moves down).
 *
 * What counts:
 *   - a call to `parseExpression` or `parseLiteralExpression`, everywhere
 *     in scope: their argument is always IR-originated source text;
 *   - a call to `ts.createSourceFile` in the template adapters
 *     (`packages/adapter-*` and `packages/jsx/src/adapters`). The client-JS
 *     emitter is exempt: it walks the client JS it emitted with the
 *     TypeScript AST, which is the repo's sanctioned idiom (AGENTS.md), and
 *     a call there cannot be told apart from a re-parse of IR text by its
 *     shape alone.
 *
 *   - a string operation on `JsSourceText`, the flavor the IR's source-text
 *     fields carry (`IRExpression.expr`, `MemoInfo.computation`, a handler,
 *     a loop key, …) (#3543): `match` / `matchAll` / `replace` /
 *     `replaceAll` / `includes` / `startsWith` / `endsWith` / `indexOf` /
 *     `lastIndexOf` / `search` / `split` called on it, or on another string
 *     with it as the first argument; `RegExp#test` / `exec` with it as the
 *     argument; and `RegExp(it)` / `new RegExp(it)`. Regex and string search
 *     over IR text re-derive a meaning the parsed tree already holds, the
 *     same way a re-parse does. This needs the type checker, so it is counted
 *     only when the caller passes one ({@link measureSourceFile}); passing the
 *     text through to output untouched never counts.
 *
 * Calls are found with the TypeScript AST, never by text, so a mention in a
 * comment or a string does not count. Functions are identified by file path
 * and qualified name (`outer/inner`; `Class.method`; `<module>` for code
 * outside any function), like the complexity ratchet.
 *
 * Entry point: `scripts/ci/emit-parse-ratchet.ts`.
 */

import ts from 'typescript'

export const BASELINE_FILE = 'emit-parse-baseline.json'
export const REGENERATE_COMMAND = 'bun run ratchet:emit-parse:baseline'

/** Parsers whose argument is always IR-originated JS/TS source text. */
const SOURCE_PARSERS: ReadonlySet<string> = new Set(['parseExpression', 'parseLiteralExpression'])

/** Qualified function name → number of counted calls in it. */
export type FunctionCounts = Record<string, number>

/** Repo-relative file path → its functions' counts (functions with none are left out). */
export type TreeCounts = Record<string, FunctionCounts>

export interface EmitParseBaseline {
  files: TreeCounts
}

/** Whether a repo-relative path is a template adapter, where `ts.createSourceFile` also counts. */
export function isTemplateAdapterPath(path: string): boolean {
  return /^packages\/adapter-[^/]+\/src\//.test(path) || path.startsWith('packages/jsx/src/adapters/')
}

/** The counted parser calls in one source file, by qualified function name. */
export function measureSource(path: string, text: string): FunctionCounts {
  return measureSourceFile(ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS), path)
}

/**
 * The counted operations in `sf`, by qualified function name: parser calls,
 * and with `checker` (from a program that contains `sf`) also string
 * operations on `JsSourceText`.
 */
export function measureSourceFile(sf: ts.SourceFile, path: string, checker?: ts.TypeChecker): FunctionCounts {
  const countCreateSourceFile = isTemplateAdapterPath(path)
  const counts: FunctionCounts = {}
  const visit = (node: ts.Node): void => {
    const counted =
      (ts.isCallExpression(node) && isCountedCall(node, countCreateSourceFile)) ||
      (checker !== undefined && isJsSourceTextOperation(node, checker))
    if (counted) {
      const name = qualifiedName(node)
      counts[name] = (counts[name] ?? 0) + 1
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return counts
}

/** String methods that search or rewrite their receiver's text. */
const TEXT_METHODS: ReadonlySet<string> = new Set([
  'match',
  'matchAll',
  'replace',
  'replaceAll',
  'includes',
  'startsWith',
  'endsWith',
  'indexOf',
  'lastIndexOf',
  'search',
  'split',
])

/** `RegExp` methods that run the pattern over their argument. */
const REGEXP_METHODS: ReadonlySet<string> = new Set(['test', 'exec'])

/** A regex or string search whose subject is `JsSourceText` (see the file docstring). */
function isJsSourceTextOperation(node: ts.Node, checker: ts.TypeChecker): boolean {
  const isSource = (e: ts.Expression | undefined): boolean => e !== undefined && isJsSourceText(e, checker, new Set())
  if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && ts.isIdentifier(node.expression) && node.expression.text === 'RegExp') {
    return isSource(node.arguments?.[0])
  }
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false
  const method = node.expression.name.text
  const receiver = node.expression.expression
  if (TEXT_METHODS.has(method)) {
    if (isSource(receiver)) return true
    const receiverType = checker.getTypeAtLocation(receiver)
    return isSource(node.arguments[0]) && everyConstituent(receiverType, t => (t.flags & ts.TypeFlags.StringLike) !== 0)
  }
  return REGEXP_METHODS.has(method) && isSource(node.arguments[0])
}

/** String methods whose result is still (a slice of) their receiver's text. */
const TEXT_PRESERVING_METHODS: ReadonlySet<string> = new Set([
  'trim',
  'trimStart',
  'trimEnd',
  'slice',
  'substring',
  'toLowerCase',
  'toUpperCase',
])

/**
 * Whether `e` holds `JsSourceText`: its type carries the flavor, or it is
 * that text through a text-preserving method (`expr.trim()`, which returns a
 * plain `string`) or through a `const` initialized to one.
 */
function isJsSourceText(e: ts.Expression, checker: ts.TypeChecker, seen: Set<ts.Node>): boolean {
  if (seen.has(e)) return false
  seen.add(e)
  if (typeHas(checker.getTypeAtLocation(e), checker, JS_SOURCE_TEXT_MARKER)) return true
  if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) {
    return isJsSourceText(e.expression, checker, seen)
  }
  if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
    return TEXT_PRESERVING_METHODS.has(e.expression.name.text) && isJsSourceText(e.expression.expression, checker, seen)
  }
  if (ts.isIdentifier(e)) {
    const decl = checker.getSymbolAtLocation(e)?.valueDeclaration
    const isConst =
      decl !== undefined &&
      ts.isVariableDeclaration(decl) &&
      ts.isVariableDeclarationList(decl.parent) &&
      (decl.parent.flags & ts.NodeFlags.Const) !== 0
    return isConst && decl.initializer !== undefined && isJsSourceText(decl.initializer, checker, seen)
  }
  return false
}

/** The optional property the `JsSourceText` flavor adds to `string` (`packages/jsx/src/types.ts`). */
const JS_SOURCE_TEXT_MARKER = '__jsSourceText'

/** Whether `type`, or one constituent of a union, has a property named `name`. */
function typeHas(type: ts.Type, checker: ts.TypeChecker, name: string): boolean {
  if (type.isUnion()) return type.types.some(t => typeHas(t, checker, name))
  return checker.getPropertyOfType(type, name) !== undefined
}

function everyConstituent(type: ts.Type, test: (t: ts.Type) => boolean): boolean {
  return type.isUnion() ? type.types.every(t => everyConstituent(t, test)) : test(type)
}

function isCountedCall(call: ts.CallExpression, countCreateSourceFile: boolean): boolean {
  const callee = call.expression
  const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null
  if (name === null) return false
  if (SOURCE_PARSERS.has(name)) return true
  return countCreateSourceFile && name === 'createSourceFile' && ts.isPropertyAccessExpression(callee)
}

/** `outer/inner` for the functions enclosing `node`; methods as `Class.method`; `<module>` outside any. */
function qualifiedName(node: ts.Node): string {
  const names: string[] = []
  for (let n = node.parent; n; n = n.parent) {
    const name = functionName(n)
    if (name !== null) names.unshift(name)
  }
  return names.length > 0 ? names.join('/') : '<module>'
}

function functionName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node)) return node.name?.text ?? '<anonymous>'
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    const owner = ts.isClassLike(node.parent) && node.parent.name ? `${node.parent.name.text}.` : ''
    return `${owner}${propertyNameText(node.name)}`
  }
  if (ts.isConstructorDeclaration(node)) {
    return ts.isClassLike(node.parent) && node.parent.name ? `${node.parent.name.text}.constructor` : 'constructor'
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const p = node.parent
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text
    if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && p.initializer === node) return propertyNameText(p.name)
    return node.name?.text ?? '<anonymous>'
  }
  return null
}

function propertyNameText(name: ts.PropertyName): string {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name) ? name.text : '<computed>'
}

export type Violation =
  | { kind: 'grew'; path: string; name: string; from: number; to: number }
  | { kind: 'entered'; path: string; name: string; count: number }
  | { kind: 'file-grew'; path: string; from: number; to: number }
  | { kind: 'stale'; path: string; name: string; from: number; to: number }

export interface Verdict {
  ok: boolean
  total: number
  violations: Violation[]
}

const fileTotal = (counts: FunctionCounts | undefined): number =>
  Object.values(counts ?? {}).reduce((n, c) => n + c, 0)

/**
 * The growth a tree shows over `baseline`: a function whose count went up, a
 * function that gained its first call, and a file whose total went up.
 */
export function growth(tree: TreeCounts, baseline: EmitParseBaseline): Violation[] {
  const out: Violation[] = []
  for (const [path, counts] of Object.entries(tree)) {
    const before = baseline.files[path] ?? {}
    for (const [name, count] of Object.entries(counts)) {
      const from = before[name]
      if (from === undefined) out.push({ kind: 'entered', path, name, count })
      else if (count > from) out.push({ kind: 'grew', path, name, from, to: count })
    }
    const from = fileTotal(before)
    const to = fileTotal(counts)
    if (to > from) out.push({ kind: 'file-grew', path, from, to })
  }
  return out
}

/** Baseline entries the tree is below: removed calls whose baseline was not regenerated. */
function stale(tree: TreeCounts, baseline: EmitParseBaseline): Violation[] {
  const out: Violation[] = []
  for (const [path, counts] of Object.entries(baseline.files)) {
    for (const [name, from] of Object.entries(counts)) {
      const to = tree[path]?.[name] ?? 0
      if (to < from) out.push({ kind: 'stale', path, name, from, to })
    }
  }
  return out
}

export function compareToBaseline(tree: TreeCounts, baseline: EmitParseBaseline): Verdict {
  const violations = [...growth(tree, baseline), ...stale(tree, baseline)]
  const total = Object.values(tree).reduce((n, counts) => n + fileTotal(counts), 0)
  return { ok: violations.length === 0, total, violations }
}

export function formatVerdict(verdict: Verdict): string {
  const grown = verdict.violations.filter(v => v.kind !== 'stale')
  const stales = verdict.violations.filter(v => v.kind === 'stale')
  const lines: string[] = []
  if (grown.length > 0) {
    lines.push(
      'Phase 2 code re-parses or searches IR source text in more places than the baseline allows. ' +
        'Read the parsed tree the IR carries instead (spec/adapter-architecture.md, rule 1):',
    )
    for (const v of grown) {
      if (v.kind === 'grew') lines.push(`  ${v.path} ${v.name}: ${v.from} -> ${v.to}`)
      else if (v.kind === 'entered') lines.push(`  ${v.path} ${v.name}: new (${v.count})`)
      else if (v.kind === 'file-grew') lines.push(`  ${v.path}: file total ${v.from} -> ${v.to}`)
    }
  }
  if (stales.length > 0) {
    lines.push(`${BASELINE_FILE} is above the tree (an operation was removed) — run \`${REGENERATE_COMMAND}\` and commit the result:`)
    for (const v of stales) if (v.kind === 'stale') lines.push(`  ${v.path} ${v.name}: ${v.from} -> ${v.to}`)
  }
  return lines.join('\n')
}

/** The baseline for `tree`, files and functions sorted, functions with no calls left out. */
export function serializeBaseline(tree: TreeCounts): string {
  const files: TreeCounts = {}
  for (const path of Object.keys(tree).sort()) {
    const counts = tree[path]!
    const names = Object.keys(counts).filter(n => counts[n]! > 0).sort()
    if (names.length === 0) continue
    files[path] = Object.fromEntries(names.map(n => [n, counts[n]!]))
  }
  return `${JSON.stringify({ files } satisfies EmitParseBaseline, null, 2)}\n`
}
