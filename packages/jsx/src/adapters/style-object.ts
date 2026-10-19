/**
 * `style={{ … }}` object-literal lowering plan, shared by the template
 * adapters (#3541).
 *
 * Every adapter used to re-parse the attribute text through
 * `parseStyleObjectEntries` (a fresh `ts.createSourceFile`) and then each
 * dynamic value through `parseExpression`. The IR already carries the
 * object-literal tree on `ExpressionAttr.parsed`, so the plan reads that:
 * the CSS keys are decided here once, and an adapter spells only its
 * `style_object` runtime call. Reading the tree also accepts the shorthand
 * `{ color }`, which the text parser refused.
 */

import type { ExpressionAttr } from '../types.ts'
import {
  cssKebabCase,
  isSupported,
  stringifyParsedExpr,
  type ParsedExpr,
} from '../expression-parser.ts'

/** One CSS declaration of a style object: a static string, or a value to lower. */
export type StyleObjectPlanEntry =
  | { cssKey: string; kind: 'literal'; value: string }
  | { cssKey: string; kind: 'expr'; expr: string; parsed: ParsedExpr }

/** The static string a value spells, when it is a string or a substitution-free template literal. */
function staticString(value: ParsedExpr): string | null {
  if (value.kind === 'literal' && value.literalType === 'string' && typeof value.value === 'string') return value.value
  if (value.kind === 'template-literal' && value.parts.every(p => p.type === 'string')) {
    return value.parts.map(p => (p.type === 'string' ? p.value : '')).join('')
  }
  return null
}

/**
 * The CSS declarations of a `style` attribute's object literal, or `null`
 * when the value is not an object literal every entry of which an adapter
 * can lower: a spread, a numeric key, or a value outside the template
 * subset keeps the attribute on the adapter's refusal path.
 */
export function planStyleObject(value: Pick<ExpressionAttr, 'expr' | 'parsed'>): StyleObjectPlanEntry[] | null {
  // Phase 1 attaches `parsed` to every expression attribute; without it
  // there is no tree to plan from, and the attribute stays on the refusal path.
  const parsed = value.parsed
  if (parsed?.kind !== 'object-literal' || parsed.properties.length === 0) return null
  const entries: StyleObjectPlanEntry[] = []
  for (const prop of parsed.properties) {
    if (prop.kind !== 'prop' || prop.keyKind === 'numeric') return null
    const cssKey = cssKebabCase(prop.key)
    const literal = staticString(prop.value)
    if (literal !== null) {
      entries.push({ cssKey, kind: 'literal', value: literal })
    } else if (isSupported(prop.value).supported) {
      entries.push({ cssKey, kind: 'expr', expr: stringifyParsedExpr(prop.value), parsed: prop.value })
    } else {
      return null
    }
  }
  return entries
}
