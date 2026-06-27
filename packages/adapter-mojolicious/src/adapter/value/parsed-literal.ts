/**
 * String-literal value lowering for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure functions over const-initializer source text and
 * analyzer type info — no adapter instance state.
 *
 * SHARED CANDIDATE: `isStringTypeInfo` and `isBareStringLiteral` are
 * byte-identical to the Xslate adapter's copies and adapter-agnostic —
 * extraction candidates for a shared Perl-family codegen module (groundwork
 * for the future Perl evaluator integration, issue #2018 track D).
 * `parsePureStringLiteral` deliberately differs (Mojo uses the TS parser;
 * Xslate hand-parses), so it stays per-adapter.
 */

import ts from 'typescript'
import { evalStringArrayJoin, type TypeInfo } from '@barefootjs/jsx'

/**
 * Parse a const initializer's source text. Returns the unescaped string
 * value when the whole initializer is a single string literal (or a
 * no-substitution template literal), else `null`. Uses the TS parser so
 * escapes/quotes resolve exactly as JS would, matching the value the Hono
 * reference inlines at runtime.
 */
export function parsePureStringLiteral(source: string): string | null {
  const sf = ts.createSourceFile(
    '__const.ts',
    `const __x = (${source});`,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ false,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isVariableStatement(stmt)) return null
  const decl = stmt.declarationList.declarations[0]
  let init = decl?.initializer
  while (init && ts.isParenthesizedExpression(init)) init = init.expression
  if (!init) return null
  if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
    return init.text
  }
  // `[<literals>].join(' ')` module consts (e.g. Switch's `trackStateClasses`)
  // → inline the flattened string byte-for-byte. See `evalStringArrayJoin`.
  return evalStringArrayJoin(source)
}

/** True when `type` is the `string` primitive. */
export function isStringTypeInfo(type: TypeInfo | undefined): boolean {
  return type?.kind === 'primitive' && type.primitive === 'string'
}

/** True when `initialValue` is a bare string-literal expression (`'x'` /
 *  `"x"`), used as a fallback for signals whose type wasn't inferred. */
export function isBareStringLiteral(initialValue: string | undefined): boolean {
  if (!initialValue) return false
  const v = initialValue.trim()
  return (v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))
}
