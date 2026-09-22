/**
 * `checkAuthoredFormatDateCalls` (#3089, BF056): a direct call to
 * `formatDate` imported from `@barefootjs/client` (or its `/runtime`
 * subpath) in a template-lowered position is refused at compile time,
 * uniformly across every adapter including Hono.
 *
 * This is a POLICY decision, not a template-language capability gap:
 * `formatDate` is compiler ABI — the lowering TARGET the `.toLocaleDateString()`
 * sugar rewrites to (`to-locale-date-lowering.ts`), emitted by the compiler
 * itself into generated client JS and every adapter's native `format_date`
 * helper (`spec/template-helpers.md`) — never an authored API. So this check
 * fires ahead of `adapter.generate()` in the shared IR-build phase and is
 * pinned identically on all nine adapters, the same "every backend, no
 * exceptions" shape `checkRichTypePropSerialization` (BF049,
 * `rich-type-refusal.ts`) uses for a hydration-transport gap that is equally
 * universal on Hono's JS-runtime leg as on the 8 template-language adapters'
 * leg.
 *
 * A `/* @client *\/`-escaped position is skipped — deferring the whole read
 * to the client means real JS evaluates it there, and the still-exported
 * (now `@internal`) runtime function works fine as ordinary client code.
 *
 * Deliberately a SEPARATE walk from `checkRichTypeMethodCalls`
 * (`rich-type-refusal.ts`), which answers a different question (does a
 * METHOD CALL on a host-rich-typed receiver have a catalogued lowering) and
 * short-circuits when the component has no `propsType` — a `formatDate`
 * call needs no receiver type at all and can appear in a props-free
 * component, so it cannot share that early return. The tree coverage below
 * intentionally mirrors that module's `walkNode` / `walkAttrValue` /
 * `walkTemplateParts` (element/component/provider attrs, loop array +
 * children, conditional/if-statement branches, async fallback + children)
 * for the same reason both checks need it: "every position a template
 * could render" — for two unrelated predicates.
 */

import type {
  IRNode,
  IRMetadata,
  CompilerError,
  SourceLocation,
  AttrValue,
  IRTemplatePart,
} from './types.ts'
import type { ParsedExpr } from './expression-parser.ts'
import { parseExpression } from './expression-parser.ts'
import { ErrorCodes } from './errors.ts'

/** Entries that re-export the pure client `formatDate` helper (#2324). */
const FORMAT_DATE_SOURCES: ReadonlySet<string> = new Set([
  '@barefootjs/client',
  '@barefootjs/client/runtime',
])

/**
 * The local binding name(s) `formatDate` is imported under in this
 * component — matched by exported name, gated on the LOCAL alias, accepted
 * from both the main entry and the runtime re-export. Mirrors the shape of
 * the removed `formatDateLocalNames` (`adapters/env-signal.ts`), rebuilt
 * here since this is now the only consumer of that resolution.
 */
function collectFormatDateBoundNames(metadata: IRMetadata): Set<string> {
  const names = new Set<string>()
  for (const imp of metadata.imports) {
    if (!FORMAT_DATE_SOURCES.has(imp.source) || imp.isTypeOnly) continue
    for (const s of imp.specifiers) {
      if (s.isTypeOnly || s.isNamespace || s.isDefault) continue
      if (s.name === 'formatDate') names.add(s.alias ?? s.name)
    }
  }
  return names
}

export function checkAuthoredFormatDateCalls(root: IRNode, metadata: IRMetadata, errors: CompilerError[]): void {
  const names = collectFormatDateBoundNames(metadata)
  if (names.size === 0) return
  const seen = new Set<string>()
  walkNode(root, names, errors, seen)
}

function pushDiagnostic(errors: CompilerError[], seen: Set<string>, loc: SourceLocation, name: string): void {
  const key = `${loc.start.line}:${loc.start.column}`
  if (seen.has(key)) return
  seen.add(key)
  errors.push({
    code: ErrorCodes.FORMAT_DATE_AUTHORED_CALL,
    severity: 'error',
    message:
      `'${name}(...)' cannot be called directly — formatDate is compiler ABI (the lowering target of the ` +
      `.toLocaleDateString() sugar), not an authored API.`,
    loc,
    suggestion: {
      message:
        "Use date.toLocaleDateString(locale, { timeZone, ... }) with a literal locale and an explicit literal " +
        "timeZone (a canonical IANA zone ID, a fixed '±HH:MM' offset, or 'UTC') so it compiles to the format_date " +
        'helper, or defer the whole read to the client with /* @client */ — it runs as real JS in the browser, so ' +
        'it can call any date-formatting API you like, including this one.',
      escape: [{ kind: 'client-directive' }],
    },
  })
}

/** Does `expr`'s tree contain a call whose callee is one of `names`? Mirrors `checkExpr`'s tree coverage (rich-type-refusal.ts). */
function exprCallsName(expr: ParsedExpr, names: ReadonlySet<string>): boolean {
  switch (expr.kind) {
    case 'call':
      if (expr.callee.kind === 'identifier' && names.has(expr.callee.name)) return true
      if (exprCallsName(expr.callee, names)) return true
      return expr.args.some((a) => exprCallsName(a, names))
    case 'member':
      return exprCallsName(expr.object, names)
    case 'index-access':
      return exprCallsName(expr.object, names) || exprCallsName(expr.index, names)
    case 'binary':
      return exprCallsName(expr.left, names) || exprCallsName(expr.right, names)
    case 'unary':
      return exprCallsName(expr.argument, names)
    case 'conditional':
      return (
        exprCallsName(expr.test, names) ||
        exprCallsName(expr.consequent, names) ||
        exprCallsName(expr.alternate, names)
      )
    case 'logical':
      return exprCallsName(expr.left, names) || exprCallsName(expr.right, names)
    case 'template-literal':
      return expr.parts.some((p) => p.type === 'expression' && exprCallsName(p.expr, names))
    case 'arrow':
      return exprCallsName(expr.body, names)
    case 'array-literal':
      return expr.elements.some((e) => exprCallsName(e, names))
    case 'object-literal':
      return expr.properties.some((p) => exprCallsName(p.kind === 'spread' ? p.expr : p.value, names))
    case 'array-method': {
      if (exprCallsName(expr.object, names)) return true
      if (expr.args.some((a) => exprCallsName(a, names))) return true
      if (expr.method === 'flat' && expr.depthExpr) return exprCallsName(expr.depthExpr, names)
      return false
    }
    case 'identifier':
    case 'literal':
    case 'regex':
    case 'unsupported':
      return false
  }
}

/** First bound name, for the diagnostic message — the exact alias matters far less than firing at all. */
function anyName(names: ReadonlySet<string>): string {
  for (const n of names) return n
  return 'formatDate'
}

/**
 * `IRTemplatePart.ternary.condition` / `.lookup.key` carry no attached
 * parse (unlike every other position here), so parse on demand — same as
 * `rich-type-refusal.ts`'s `walkTemplateParts`. `ternary.whenTrue` /
 * `.whenFalse` are ALSO raw, unparsed text (the per-branch rendered
 * snippet), so they get the same on-demand treatment: this is exactly the
 * `format-date-ternary` shape (#2843) — a call in a ternary CONSEQUENT
 * inside a structured template-literal attribute.
 */
function walkTemplateParts(
  parts: readonly IRTemplatePart[],
  loc: SourceLocation,
  names: ReadonlySet<string>,
  errors: CompilerError[],
  seen: Set<string>,
): void {
  const checkText = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (exprCallsName(parseExpression(trimmed), names)) pushDiagnostic(errors, seen, loc, anyName(names))
  }
  for (const part of parts) {
    if (part.type === 'ternary') {
      checkText(part.condition)
      checkText(part.whenTrue)
      checkText(part.whenFalse)
    } else if (part.type === 'lookup') {
      checkText(part.key)
    }
  }
}

function walkAttrValue(
  value: AttrValue,
  clientOnly: boolean | undefined,
  loc: SourceLocation,
  names: ReadonlySet<string>,
  errors: CompilerError[],
  seen: Set<string>,
): void {
  if (clientOnly) return
  if (value.kind === 'expression') {
    if (value.parsed && exprCallsName(value.parsed, names)) pushDiagnostic(errors, seen, loc, anyName(names))
    if (value.parts) walkTemplateParts(value.parts, loc, names, errors, seen)
  } else if (value.kind === 'spread') {
    if (value.parsed && exprCallsName(value.parsed, names)) pushDiagnostic(errors, seen, loc, anyName(names))
  } else if (value.kind === 'template') {
    walkTemplateParts(value.parts, loc, names, errors, seen)
  }
}

function walkNode(node: IRNode, names: ReadonlySet<string>, errors: CompilerError[], seen: Set<string>): void {
  if (node.type === 'expression') {
    if (!node.clientOnly && node.parsed && exprCallsName(node.parsed, names)) {
      pushDiagnostic(errors, seen, node.loc, anyName(names))
    }
  } else if (node.type === 'conditional') {
    if (!node.clientOnly && node.parsedCondition && exprCallsName(node.parsedCondition, names)) {
      pushDiagnostic(errors, seen, node.loc, anyName(names))
    }
  } else if (node.type === 'if-statement') {
    if (node.parsedCondition && exprCallsName(node.parsedCondition, names)) {
      pushDiagnostic(errors, seen, node.loc, anyName(names))
    }
  }

  if (node.type === 'element') {
    for (const attr of node.attrs) walkAttrValue(attr.value, attr.clientOnly, attr.loc, names, errors, seen)
  } else if (node.type === 'component') {
    for (const prop of node.props) walkAttrValue(prop.value, prop.clientOnly, prop.loc, names, errors, seen)
  } else if (node.type === 'provider') {
    walkAttrValue(node.valueProp.value, node.valueProp.clientOnly, node.valueProp.loc, names, errors, seen)
  }

  switch (node.type) {
    case 'element':
    case 'component':
    case 'fragment':
    case 'provider':
      for (const child of node.children) walkNode(child, names, errors, seen)
      break
    case 'async':
      walkNode(node.fallback, names, errors, seen)
      for (const child of node.children) walkNode(child, names, errors, seen)
      break
    case 'loop': {
      if (node.clientOnly) break
      if (node.arrayParsed && exprCallsName(node.arrayParsed, names)) pushDiagnostic(errors, seen, node.loc, anyName(names))
      for (const child of node.children) walkNode(child, names, errors, seen)
      if (node.childComponent) {
        for (const child of node.childComponent.children) walkNode(child, names, errors, seen)
      }
      for (const nested of node.nestedComponents ?? []) {
        for (const child of nested.children) walkNode(child, names, errors, seen)
      }
      for (const seg of node.flatMapCallback?.segments ?? []) {
        if (seg.kind === 'jsx') walkNode(seg.ir, names, errors, seen)
      }
      for (const seg of node.preamble?.segments ?? []) {
        if (seg.kind === 'jsx') walkNode(seg.ir, names, errors, seen)
      }
      break
    }
    case 'conditional':
      if (node.clientOnly) break
      walkNode(node.whenTrue, names, errors, seen)
      walkNode(node.whenFalse, names, errors, seen)
      break
    case 'if-statement':
      walkNode(node.consequent, names, errors, seen)
      if (node.alternate) walkNode(node.alternate, names, errors, seen)
      break
  }
}
