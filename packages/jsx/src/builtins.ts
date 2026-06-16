/**
 * Compiler built-in JSX tags that are import-scoped to `@barefootjs/client`
 * and compiled away (no runtime value survives in emitted output).
 *
 * `<Async>` and `<Region>` are recognised **structurally** — by their
 * `@barefootjs/client` import in `ir.metadata.imports`, never by a bare
 * capitalized tag-name match — so a user's own `<Async>` / `<Region>`
 * component (imported from elsewhere or declared locally) does not collide
 * with the built-in. The import is elided on emit (both `templateImports`
 * and the client-JS DOM imports) so it never lingers as a phantom runtime
 * import.
 *
 * Runtime stubs + types ship from `@barefootjs/client` (see
 * `packages/client/src/builtins.ts`). See piconic-ai/barefootjs#1915.
 */

import type { ImportInfo } from './types.ts'

/** Package that the built-in tags must be imported from to be recognised. */
export const CLIENT_BUILTIN_SOURCE = '@barefootjs/client'

export type ClientBuiltinTag = 'Async' | 'Region'

/** The recognised built-in tag (export) names. */
export const CLIENT_BUILTIN_TAGS: readonly ClientBuiltinTag[] = ['Async', 'Region']

/** True when `name` is one of the compile-away built-in export names. */
export function isClientBuiltinName(name: string): name is ClientBuiltinTag {
  return name === 'Async' || name === 'Region'
}

/**
 * Elide the compile-away built-ins from an import list for emission (#1915).
 * `<Async>` / `<Region>` are lowered into the template, so their
 * `@barefootjs/client` import must not survive as a phantom runtime import in
 * either the SSR template or the client JS bundle. Drops the `Async` / `Region`
 * specifiers from `@barefootjs/client` imports, and drops the whole import
 * statement when it has no remaining specifiers.
 */
export function stripClientBuiltinImports(imports: ImportInfo[]): ImportInfo[] {
  const result: ImportInfo[] = []
  for (const imp of imports) {
    if (imp.source !== CLIENT_BUILTIN_SOURCE) {
      result.push(imp)
      continue
    }
    const kept = imp.specifiers.filter(
      spec => spec.isDefault || spec.isNamespace || !isClientBuiltinName(spec.name),
    )
    // A side-effect import (no specifiers) or one whose only specifiers were
    // the built-ins is dropped entirely; otherwise re-emit without them.
    if (kept.length === 0 && imp.specifiers.length > 0) continue
    result.push(kept.length === imp.specifiers.length ? imp : { ...imp, specifiers: kept })
  }
  return result
}
