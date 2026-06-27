/**
 * Template-literal memo lowering.
 *
 * Free functions over a {@link GoEmitContext} that compute the SSR initial
 * value of a template-literal memo (`() => `${a} ${props.x ?? ''} grid``) as a
 * Go `string` expression. Each quasi becomes a Go string literal; each
 * interpolation resolves to a module string const, a `Record`-index access, or
 * a `props.<name>` field read. They read the context's `state.localConstants` /
 * `state.propsObjectName` and `resolveModuleStringConst`, and set
 * `state.usesFmt` when a `Record`-index interpolation emits `fmt.Sprint`.
 */

import ts from 'typescript'

import type { ParsedExpr, ParsedStatement, TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { escapeGoString } from '../lib/go-emit.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'

/**
 * (#checkbox) Compute the SSR initial value of a template-literal memo as a
 * Go `string` expression. The memo computation looks like
 * `() => `${a} ${b} ${props.className ?? ''} grid place-content-center``.
 *
 * Each quasi (literal text span) becomes a Go string literal; each
 * interpolation is resolved:
 *   - an identifier naming a module string const → its inlined literal
 *     (covers both pure-string and `[...].join(' ')` consts);
 *   - `props.<name> ?? '<fallback>'` or bare `props.<name>` → `in.<Field>`
 *     when `<name>` is a known prop param (typed `string`); the `?? ''`
 *     fallback maps to Go's zero value for an unset string field, matching
 *     the Hono reference's empty-string result.
 *
 * Returns the `"a" + in.Field + " grid..."` concatenation, or null when the
 * computation isn't a single template literal or any interpolation isn't
 * representable (so the caller keeps its existing pattern matching).
 */
export function computeTemplateLiteralMemoInitialValue(
  ctx: GoEmitContext,
  memo: { parsed?: ParsedExpr; parsedBlock?: ParsedStatement[]; parsedBlockComplete?: boolean },
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
): string | null {
  // Resolve the template value (a `template-literal` ParsedExpr, or a plain
  // string `literal` for a no-substitution `` `plain` `` which folds to one)
  // plus any memo-local `const X = props.Y ?? 'lit'` key bindings, from the
  // analyzer-carried tree instead of re-parsing `computation`.
  const localKeyBindings = new Map<string, { propName: string; defaultLiteral?: string }>()
  let templateValue: ParsedExpr | undefined
  if (memo.parsedBlock) {
    // Block-bodied arrow (the Toggle `classes` memo): collect leading key
    // bindings, then resolve against the single returned template literal. Any
    // statement that isn't a var-decl or the return (an `if`, a loop) is shape
    // we don't model — bail to the existing patterns, matching the former walk.
    //
    // `parsedBlock` is tolerant — it OMITS statements it can't represent (a
    // `for`/`while`/`switch`), so an incomplete block could otherwise look like
    // just `var-decl`s + `return` and be lowered when the former TS-AST walk
    // would have bailed on the unrepresented statement. Bail when it isn't
    // complete so behaviour matches that walk.
    if (!memo.parsedBlockComplete) return null
    for (const s of memo.parsedBlock) {
      if (s.kind === 'var-decl') {
        const binding = parseLocalKeyBinding(ctx, s.init)
        if (binding) localKeyBindings.set(s.name, binding)
      } else if (s.kind === 'return') {
        templateValue = s.value
      } else {
        return null
      }
    }
    if (!templateValue) return null
  } else if (memo.parsed) {
    templateValue = memo.parsed
  } else {
    return null
  }

  const propNames = new Set(propsParams.map(p => p.name))
  const escGo = (s: string) => `"${escapeGoString(s)}"`

  // A no-substitution template literal folds to a plain string literal.
  if (templateValue.kind === 'literal' && templateValue.literalType === 'string') {
    return escGo(String(templateValue.value))
  }
  if (templateValue.kind !== 'template-literal') return null

  const segments: string[] = []
  for (const part of templateValue.parts) {
    if (part.type === 'string') {
      if (part.value) segments.push(escGo(part.value))
    } else {
      const resolved = resolveTemplateInterpolation(ctx, part.expr, propNames, localKeyBindings)
      if (resolved === null) return null
      segments.push(resolved)
    }
  }
  if (segments.length === 0) return '""'
  return segments.join(' + ')
}

/**
 * (#checkbox) Resolve one `${expr}` interpolation of a template-literal memo
 * to a Go string expression, or null when unsupported. Operates on the
 * carried `ParsedExpr`. See `computeTemplateLiteralMemoInitialValue` for the
 * supported shapes.
 */
function resolveTemplateInterpolation(
  ctx: GoEmitContext,
  node: ParsedExpr,
  propNames: Set<string>,
  localKeyBindings: ReadonlyMap<string, { propName: string; defaultLiteral?: string }>,
): string | null {
  // Identifier → module string const inline.
  if (node.kind === 'identifier') {
    return ctx.resolveModuleStringConst(node.name)
  }

  // `recordConst[key]` → inline indexed Go map (the Toggle `classes` memo's
  // `variantClasses[variant]` / `sizeClasses[size]`). A bare-identifier index
  // parses as `index-access`.
  if (node.kind === 'index-access') {
    return recordIndexInterpolationToGo(ctx, node, propNames, localKeyBindings)
  }

  // `props.X ?? ''` — string-typed prop with an empty-string fallback.
  if (node.kind === 'logical' && node.op === '??') {
    const right = node.right
    const isEmptyStr = right.kind === 'literal' && right.literalType === 'string' && right.value === ''
    const propName = propsAccessNameFromParsed(ctx, node.left)
    if (propName && propNames.has(propName) && isEmptyStr) {
      // Unset string field is "" in Go — same as `?? ''`.
      return `in.${capitalizeFieldName(propName)}`
    }
    return null
  }

  // Bare `props.X` (string-typed prop).
  const propName = propsAccessNameFromParsed(ctx, node)
  if (propName && propNames.has(propName)) {
    return `in.${capitalizeFieldName(propName)}`
  }
  return null
}

/**
 * Parse a memo-local `const X = …` initializer (`ParsedExpr`) into a
 * `Record`-index key binding: `props.Y ?? 'lit'` → `{ propName: 'Y',
 * defaultLiteral: 'lit' }`, or bare `props.Y` → `{ propName: 'Y' }`. Returns
 * null for any other shape, so it isn't registered as a key.
 */
function parseLocalKeyBinding(
  ctx: GoEmitContext,
  node: ParsedExpr,
): { propName: string; defaultLiteral?: string } | null {
  if (node.kind === 'logical' && node.op === '??') {
    const propName = propsAccessNameFromParsed(ctx, node.left)
    const right = node.right
    if (propName && right.kind === 'literal' && right.literalType === 'string') {
      return { propName, defaultLiteral: String(right.value) }
    }
    return null
  }
  const propName = propsAccessNameFromParsed(ctx, node)
  if (propName) return { propName }
  return null
}

/**
 * Lower a `recordConst[key]` interpolation to an inline indexed Go map,
 * emitting `map[string]string{…}[fmt.Sprint(in.Field)]` (or `map[string]any`
 * for mixed values). `recordConst` resolves via the carried
 * `ConstantInfo.parsed` object-literal (module-scope `Record<keys, scalar>`);
 * `key` is a bare prop or a memo-local const bound to `props.X ?? 'default'`
 * (via `localKeyBindings`), whose `'default'` fallback also maps `""` so an
 * unset prop renders the default. Returns null for any non-record /
 * non-resolvable key so the caller falls through.
 */
function recordIndexInterpolationToGo(
  ctx: GoEmitContext,
  node: ParsedExpr & { kind: 'index-access' },
  propNames: Set<string>,
  localKeyBindings: ReadonlyMap<string, { propName: string; defaultLiteral?: string }>,
): string | null {
  if (node.object.kind !== 'identifier' || node.index.kind !== 'identifier') return null
  const objName = node.object.name
  const keyName = node.index.name

  // KEY resolution: a memo-local binding wins (carries the `'default'` key),
  // else the key must be a bare prop.
  let indexPropName: string
  let defaultKey: string | undefined
  const resolved = localKeyBindings.get(keyName)
  if (resolved) {
    indexPropName = resolved.propName
    defaultKey = resolved.defaultLiteral
  } else if (propNames.has(keyName)) {
    indexPropName = keyName
  } else {
    return null
  }

  // IDENT must be a module-scope object-literal const carried as `parsed`.
  const constInfo = (ctx.state.localConstants ?? []).find(c => c.name === objName && c.isModule)
  const parsedConst = constInfo?.parsed
  if (!parsedConst || parsedConst.kind !== 'object-literal') return null

  const entries: { key: string; value: { kind: 'number' | 'string'; text: string } }[] = []
  for (const prop of parsedConst.properties) {
    const v = prop.value
    if (v.kind === 'literal' && v.literalType === 'number') {
      entries.push({ key: prop.key, value: { kind: 'number', text: v.raw ?? String(v.value) } })
    } else if (v.kind === 'literal' && v.literalType === 'string') {
      entries.push({ key: prop.key, value: { kind: 'string', text: String(v.value) } })
    } else {
      return null
    }
  }

  const goVal = (v: { kind: 'number' | 'string'; text: string }) =>
    v.kind === 'number' ? v.text : JSON.stringify(v.text)
  const ents = entries.map(e => `${JSON.stringify(e.key)}: ${goVal(e.value)}`)
  if (defaultKey !== undefined) {
    const def = entries.find(e => e.key === defaultKey)
    if (def) ents.unshift(`"": ${goVal(def.value)}`)
  }
  const allString = entries.every(e => e.value.kind === 'string')
  const mapType = allString ? 'map[string]string' : 'map[string]any'
  ctx.state.usesFmt = true
  return `${mapType}{${ents.join(', ')}}[fmt.Sprint(in.${capitalizeFieldName(indexPropName)})]`
}

/**
 * `ParsedExpr` counterpart of `propsAccessName`: if `node` is a
 * `<propsObjectName>.<name>` member access, return `<name>`, else null.
 */
function propsAccessNameFromParsed(ctx: GoEmitContext, node: ParsedExpr): string | null {
  if (node.kind !== 'member' || node.computed) return null
  if (node.object.kind !== 'identifier') return null
  if (!ctx.state.propsObjectName || node.object.name !== ctx.state.propsObjectName) return null
  return node.property
}

/**
 * If `node` is a `<propsObjectName>.<name>` access, return `<name>`, else
 * null. Used to recognize props-object reads inside memo interpolations.
 */
export function propsAccessName(ctx: GoEmitContext, node: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(node)) return null
  if (!ts.isIdentifier(node.expression)) return null
  if (!ctx.state.propsObjectName || node.expression.text !== ctx.state.propsObjectName) return null
  return node.name.text
}
