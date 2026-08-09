/**
 * BarefootJS Compiler - Module Exports Generation
 *
 * Generates module-level export statements from ComponentIR.
 * This is a compiler-layer concern, not adapter-specific.
 */

import ts from 'typescript'
import type { ComponentIR, ParamInfo } from './types.ts'
import { identifierPattern } from './identifier-pattern.ts'

/**
 * Emit module-level exports for local declarations and `export { ... } [from '...']`
 * specifier blocks. Specifiers whose local name appears in `extraInlineExported`
 * (already emitted inline) are filtered, except for `from`-form re-exports and
 * aliased forms that introduce a new external name.
 *
 * When `rewriteRelativeImport` is supplied, `export … from '<rel>'` blocks
 * have their relative specifiers re-anchored to the emit location — same
 * hook adapters consume for plain `import` lines (#1453).
 */
export function generateModuleExports(
  ir: ComponentIR,
  extraInlineExported: ReadonlySet<string> = new Set(),
  rewriteRelativeImport?: (importPath: string) => string,
  options?: {
    /**
     * Skip `export const` / `export function` value declarations — the
     * adapter already emitted them inside its module-scope section, in
     * source order (see `TemplateSections.moduleConstantsIncludeExports`).
     * `export { … } [from '…']` specifier blocks are still emitted.
     */
    skipValueDeclarations?: boolean
  },
): string | null {
  const lines: string[] = []

  for (const constant of options?.skipValueDeclarations ? [] : ir.metadata.localConstants) {
    if (!constant.isExported) continue
    const keyword = constant.declarationKind ?? 'const'
    if (!constant.value) {
      lines.push(`export ${keyword} ${constant.name}`)
      continue
    }
    const value = constant.value.trim()
    // Skip client-only constructs
    if (/^createContext\b/.test(value) || /^new WeakMap\b/.test(value)) continue

    lines.push(`export ${keyword} ${constant.name} = ${constant.value}`)
  }

  for (const func of options?.skipValueDeclarations ? [] : ir.metadata.localFunctions) {
    if (!func.isExported) continue
    // Prefer the source-verbatim signature so type predicates and explicit
    // `:unknown` parameter annotations survive — see FunctionInfo.typedParams
    // docstring (#1453).
    const params = func.typedParams !== undefined
      ? func.typedParams
      : func.params.map(formatParamWithType).join(', ')
    const returnAnnotation = func.typedReturnType ? `: ${func.typedReturnType}` : ''
    const body = func.typedBody ?? func.body
    const asyncKw = func.isAsync ? 'async ' : ''
    lines.push(`export ${asyncKw}function ${func.name}(${params})${returnAnnotation} ${body}`)
  }

  const inlineExported = collectInlineExportedNames(ir)
  for (const name of extraInlineExported) inlineExported.add(name)

  for (const block of ir.metadata.namedExports) {
    const isReexportFrom = block.source !== null

    const survivingSpecs = block.specifiers.filter((spec) => {
      if (isReexportFrom) return true
      // `export { X as Y }` with inline `export const X` is not a duplicate
      // (Y is a new external name), so only drop when alias is absent.
      return !(inlineExported.has(spec.name) && spec.alias == null)
    })

    if (survivingSpecs.length === 0) continue

    const specText = survivingSpecs
      .map((s) => {
        const prefix = s.isTypeOnly ? 'type ' : ''
        return s.alias ? `${prefix}${s.name} as ${s.alias}` : `${prefix}${s.name}`
      })
      .join(', ')
    const typeKw = block.isTypeOnly ? 'type ' : ''
    if (isReexportFrom) {
      const source = rewriteRelativeImport && block.source!.startsWith('.')
        ? rewriteRelativeImport(block.source!)
        : block.source!
      lines.push(`export ${typeKw}{ ${specText} } from '${source}'`)
    } else {
      lines.push(`export ${typeKw}{ ${specText} }`)
    }
  }

  return lines.length > 0 ? lines.join('\n') : null
}

export function collectInlineExportedNames(ir: ComponentIR): Set<string> {
  const names = new Set<string>()
  for (const c of ir.metadata.localConstants) {
    if (c.isExported) names.add(c.name)
  }
  for (const f of ir.metadata.localFunctions) {
    if (f.isExported) names.add(f.name)
  }
  // Component itself is inline-exported by applyExportKeyword.
  if (ir.metadata.isExported && ir.metadata.componentName) {
    names.add(ir.metadata.componentName)
  }
  return names
}

/**
 * Format a ParamInfo for .tsx output, preserving type annotations, optional
 * markers, and default initializers. Without the default, hoisted local
 * helpers like `function f(x = 0)` lose their fallback when emitted into
 * the SSR template, and any caller relying on the default produces
 * NaN/undefined at render time.
 */
export function formatParamWithType(p: ParamInfo): string {
  const rest = p.isRest ? '...' : ''
  const optional = p.optional ? '?' : ''
  const typeAnnotation = p.type?.raw && p.type.raw !== 'unknown' ? `: ${p.type.raw}` : ''
  const defaultPart = p.defaultValue !== undefined ? ` = ${p.defaultValue}` : ''
  return `${rest}${p.name}${optional}${typeAnnotation}${defaultPart}`
}

/**
 * Find names reachable from primary reference text via transitive dependency analysis.
 * Used to determine which SSR declarations are actually needed (vs. only used in event handlers).
 */
export function findReachableNames(
  primaryRefs: string,
  declarations: { name: string; body: string }[],
): Set<string> {
  const allNames = new Set(declarations.map(d => d.name))
  const bodyMap = new Map(declarations.map(d => [d.name, d.body]))
  const reachable = new Set<string>()
  const queue: string[] = []

  for (const name of allNames) {
    if (identifierPattern(name).test(primaryRefs)) {
      reachable.add(name)
      queue.push(name)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const body = bodyMap.get(current) || ''
    for (const name of allNames) {
      if (!reachable.has(name) && identifierPattern(name).test(body)) {
        reachable.add(name)
        queue.push(name)
      }
    }
  }

  return reachable
}

/**
 * Which of `candidates` does `bodyText` ASSIGN to?
 *
 * Reachability above answers "is this declaration referenced?", which is
 * the right question for pruning SSR-irrelevant code. It is the wrong
 * question for a MUTABLE binding: a surviving `let` whose only writer got
 * pruned is left declared-and-read but never assigned, and TypeScript's
 * control-flow analysis then narrows it to `never` at every guarded use
 * (#2598). `closeOverWritersOfMutableBindings` uses this to restore the
 * missing half of that pair.
 *
 * Recognizes the forms that actually write a local binding:
 *   `x = …`, `x += …` (and every other compound operator), `x++`, `--x`
 * Destructuring assignment (`[x] = …`, `({ x } = …)`) is deliberately NOT
 * recognized: it never appears in the ref/handler shapes this exists for,
 * and a wrong guess here over-retains rather than fails loudly, so leaving
 * it out keeps the retained set honest. If one shows up, it will present
 * as this same `never` narrowing and can be added with a fixture.
 *
 * Parsed with the TS AST, not matched as text: `identifierPattern` (used
 * for reference detection above) cannot tell a write from a read, and a
 * regex for `name\s*=` would match `name == x`, a `name=` inside a string
 * or JSX attribute, and a property write `obj.name = x` that assigns
 * nothing of the sort.
 */
export function findAssignedNames(
  bodyText: string,
  candidates: ReadonlySet<string>,
): Set<string> {
  const assigned = new Set<string>()
  if (candidates.size === 0) return assigned

  const sf = ts.createSourceFile(
    'bf-assignment-scan.tsx',
    bodyText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TSX,
  )

  // A bare Identifier on the left of an assignment — `obj.x = …` is a
  // PropertyAccessExpression and writes through the binding rather than to
  // it, so it does not count.
  const record = (target: ts.Node): void => {
    if (ts.isIdentifier(target) && candidates.has(target.text)) {
      assigned.add(target.text)
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
      record(node.left)
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      record(node.operand)
    }
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sf, visit)
  return assigned
}

/**
 * `findReachableNames`, plus the invariant it cannot express on its own:
 * **a mutable binding that survives keeps the declarations that write it.**
 *
 * Reachability is seeded from the RENDERED JSX, which has already had the
 * client-only attributes stripped — `ref={setRef}` leaves no `setRef`
 * behind, and `onClick={handleClick}` is rendered as `onClick={() => {}}`.
 * That is deliberate: code reachable only from a handler is client-only
 * and should not be emitted into an SSR template.
 *
 * It goes wrong when a `let` outlives its writer. The binding survives
 * because some OTHER surviving declaration reads it, while its only
 * assignment lived in a pruned handler — so the emitted template declares
 * it, reads it, and never assigns it. TypeScript's control-flow analysis
 * concludes it is permanently `null`, narrows every guarded use to `never`,
 * and each member access on it fails:
 *
 *     let highlightEl: HTMLElement | null = null      // writer was pruned
 *     const syncScroll = () => {
 *       if (highlightEl && textareaEl) {
 *         highlightEl.scrollTop = textareaEl.scrollTop   // TS2339 on `never`
 *       }
 *     }
 *
 * Pulling the writers back in restores the source's shape for exactly the
 * bindings that survived — nothing else. The retained writer is dead code
 * at SSR (it only ever runs from a hydrated event), which is the same
 * harmless-unused-declaration trade `generateModuleScopeDeclarations`
 * already makes deliberately.
 *
 * Iterates to a fixpoint because a newly retained writer can read further
 * declarations, and can itself write another mutable binding. Bounded by
 * the declaration count: each round either adds a name or stops.
 */
export function closeOverWritersOfMutableBindings(
  primaryRefs: string,
  declarations: { name: string; body: string }[],
  mutableNames: ReadonlySet<string>,
): Set<string> {
  let reachable = findReachableNames(primaryRefs, declarations)
  if (mutableNames.size === 0) return reachable

  let seedText = primaryRefs
  for (let round = 0; round <= declarations.length; round++) {
    const survivingMutables = new Set(
      [...reachable].filter(name => mutableNames.has(name)),
    )
    if (survivingMutables.size === 0) return reachable

    const added = declarations
      .filter(d => !reachable.has(d.name))
      .filter(d => findAssignedNames(d.body, survivingMutables).size > 0)
      .map(d => d.name)
    if (added.length === 0) return reachable

    // Re-seed by NAME rather than merging sets directly, so each retained
    // writer's own transitive dependencies come along through the same
    // traversal instead of a second, divergent one.
    seedText += '\n' + added.join('\n')
    reachable = findReachableNames(seedText, declarations)
  }
  return reachable
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return (
    kind >= ts.SyntaxKind.FirstAssignment &&
    kind <= ts.SyntaxKind.LastAssignment
  )
}

/**
 * Extract parameter names from a function expression string.
 * Handles: arrow functions, single-param arrows, function expressions.
 * Strips type annotations and default values.
 */
export function extractFunctionParams(value: string): string {
  // Match arrow function parameters: (a, b) => ... or async (a, b) => ...
  const arrowMatch = value.match(/^(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>/)
  if (arrowMatch) {
    return arrowMatch[1]
      .split(',')
      .map((p) => p.trim().split(':')[0].split('=')[0].trim())
      .filter(Boolean)
      .join(', ')
  }
  // Single param arrow function: a => ...
  const singleMatch = value.match(/^(?:async\s*)?(\w+)\s*=>/)
  if (singleMatch) {
    return singleMatch[1]
  }
  // Function expression: function(a, b) { ... }
  const funcMatch = value.match(/^(?:async\s*)?function\s*\w*\s*\(([^)]*)\)/)
  if (funcMatch) {
    return funcMatch[1]
      .split(',')
      .map((p) => p.trim().split(':')[0].split('=')[0].trim())
      .filter(Boolean)
      .join(', ')
  }
  return ''
}
