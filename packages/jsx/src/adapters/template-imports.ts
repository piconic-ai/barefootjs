/**
 * Adapter helper: prepare a component's import list for re-emission into
 * an SSR template.
 *
 * `@barefootjs/client` and `@barefootjs/client/runtime` are client-side
 * sources whose runtime symbols must not appear unmodified in SSR output.
 * Adapters resolve them in one of two ways:
 *
 * - Provide a `clientShimSource` (a module that re-exports SSR-safe stubs):
 *   matching imports are rewritten to that shim. Multiple originals collapse
 *   into a single import statement so the SSR template stays clean.
 * - Provide no shim (`undefined`): matching imports are dropped. Suitable
 *   for adapters whose templates do not execute JS at SSR (Go templates,
 *   Mojo `.html.ep`).
 *
 * Adapters are responsible for calling this themselves before emitting any
 * import block. The compiler hands them `metadata.imports` unchanged.
 */
import ts from 'typescript'
import type { ImportInfo, ImportSpecifier } from '../types.ts'

const CLIENT_PACKAGE_SOURCES = new Set([
  '@barefootjs/client',
  '@barefootjs/client/runtime',
])

export function rewriteImportsForTemplate(
  imports: ImportInfo[],
  shimSource: string | undefined,
  rewriteRelative?: (importPath: string) => string,
): ImportInfo[] {
  const remap = (imp: ImportInfo): ImportInfo => {
    // Bare specifiers (`@barefootjs/jsx`, `react`, `./` resolved-via-tsconfig
    // — but the source string is the call site's truth) pass through.
    // Only literal relative paths beginning with `.` are subject to the
    // depth-shift rewrite (#1453).
    if (!rewriteRelative || !imp.source.startsWith('.')) return imp
    const next = rewriteRelative(imp.source)
    return next === imp.source ? imp : { ...imp, source: next }
  }

  if (!shimSource) {
    return imports
      .filter((imp) => !CLIENT_PACKAGE_SOURCES.has(imp.source))
      .map(remap)
  }
  const merged = new Map<string, ImportInfo>()
  const result: ImportInfo[] = []
  for (const imp of imports) {
    if (!CLIENT_PACKAGE_SOURCES.has(imp.source)) {
      result.push(remap(imp))
      continue
    }
    const existing = merged.get(shimSource)
    if (existing) {
      const seen = new Set(existing.specifiers.map(specKey))
      for (const spec of imp.specifiers) {
        if (!seen.has(specKey(spec))) {
          existing.specifiers.push(spec)
          seen.add(specKey(spec))
        }
      }
      // Type-only stays only if every contributing import is type-only.
      existing.isTypeOnly = existing.isTypeOnly && imp.isTypeOnly
    } else {
      const rewritten: ImportInfo = {
        ...imp,
        source: shimSource,
        specifiers: imp.specifiers.map((s) => ({ ...s })),
      }
      merged.set(shimSource, rewritten)
      result.push(rewritten)
    }
  }
  return result
}

function specKey(s: ImportSpecifier): string {
  return `${s.isDefault ? 'd' : ''}${s.isNamespace ? 'n' : ''}:${s.name}:${s.alias ?? ''}`
}

/**
 * Re-anchor relative specifiers carried inside emitted SOURCE TEXT — the
 * counterpart to `rewriteImportsForTemplate`, which only sees the parsed
 * static import list (`metadata.templateImports`).
 *
 * Declaration bodies re-emitted verbatim into a template
 * (`generateModuleScopeDeclarations`' consts/functions, a component body's
 * local handlers) can carry their own module references that never appear
 * in that list:
 *
 * - `import('./x')` — a dynamic import expression
 * - `typeof import('./x')` — an import TYPE node
 *
 * Those specifiers are written relative to the SOURCE file, so they break
 * once the template is emitted to a directory at a different depth — the
 * same depth shift `rewriteImportsForTemplate` already fixes for static
 * imports (#1453, #2588).
 *
 * Only literal relative paths beginning with `.` are rewritten; bare
 * specifiers pass through, matching `remap`'s guard above. A non-literal
 * argument (`import(someVar)`) is left alone — there is no specifier to
 * re-anchor, and guessing would be worse than leaving the source as-is.
 *
 * Parsed with the TS AST and applied by span splicing rather than by
 * matching text: a regex would false-match `import(` inside a string or a
 * comment, which is exactly the class of bug the repo-wide "never parse JS
 * with regex" rule exists to prevent. Splices are applied back-to-front so
 * earlier spans keep their offsets.
 */
export function rewriteDynamicImportsInSource(
  sourceText: string,
  rewriteRelative: (importPath: string) => string,
): string {
  // Cheap pre-check: skip the parse entirely for the overwhelmingly common
  // case of text with no dynamic import at all. Substring presence is not
  // used to LOCATE anything — the AST still does that — so a false positive
  // here costs one wasted parse and a false negative is impossible.
  if (!sourceText.includes('import')) return sourceText

  const sf = ts.createSourceFile(
    'bf-template-fragment.tsx',
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TSX,
  )

  const edits: Array<{ start: number, end: number, text: string }> = []

  const visit = (node: ts.Node): void => {
    // `import('./x')` — the argument is the first (and only) call argument.
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      collect(node.arguments[0] as ts.StringLiteralLike)
    }
    // `typeof import('./x')` / `import('./x').Foo` — a TYPE-position node
    // whose argument is a literal type wrapping the string.
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const literal = node.argument.literal
      if (ts.isStringLiteralLike(literal)) collect(literal)
    }
    ts.forEachChild(node, visit)
  }

  const collect = (literal: ts.StringLiteralLike): void => {
    const specifier = literal.text
    if (!specifier.startsWith('.')) return
    const next = rewriteRelative(specifier)
    if (next === specifier) return
    edits.push({
      start: literal.getStart(sf),
      end: literal.getEnd(),
      // Re-quote rather than reusing the original delimiters: a rewritten
      // POSIX-relative path never contains a quote to escape.
      text: `'${next}'`,
    })
  }

  ts.forEachChild(sf, visit)
  if (edits.length === 0) return sourceText

  let out = sourceText
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out
}
