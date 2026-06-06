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
