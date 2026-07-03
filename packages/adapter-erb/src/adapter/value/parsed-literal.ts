/**
 * String-type value helpers for the ERB template adapter.
 *
 * Ported from the Mojolicious adapter's `value/parsed-literal.ts`
 * (issue #2018 track D lineage). Pure functions over analyzer type info /
 * const-initializer text — no adapter instance state.
 *
 * SHARED CANDIDATE: `isStringTypeInfo` and `isBareStringLiteral` are
 * byte-identical to the Mojo/Xslate adapters' copies and adapter-agnostic.
 *
 * Module-scope pure-string-const inlining is owned by the shared
 * `collectModuleStringConsts` in `@barefootjs/jsx` (consumed via
 * `moduleStringConsts`), so no adapter-local source re-parse lives here.
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
