/**
 * String-type value helpers for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure functions over analyzer type info / const-initializer text —
 * no adapter instance state.
 *
 * SHARED CANDIDATE: `isStringTypeInfo` and `isBareStringLiteral` are
 * byte-identical to the Xslate adapter's copies and adapter-agnostic —
 * extraction candidates for a shared Perl-family codegen module (groundwork
 * for the future Perl evaluator integration, issue #2018 track D).
 *
 * (#2018) The former `parsePureStringLiteral` (the file's only
 * `ts.createSourceFile` re-parse) was removed: module-scope pure-string-const
 * inlining is owned by the shared `collectModuleStringConsts` in
 * `@barefootjs/jsx` (consumed via `moduleStringConsts`), so the adapter-local
 * copy had no callers. Dropping it keeps the adapter free of emit-time source
 * re-parsing without changing any output.
 */

import type { TypeInfo } from '@barefootjs/jsx'

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
