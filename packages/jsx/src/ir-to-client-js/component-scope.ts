/**
 * File-scoped component name disambiguation for the runtime registry.
 *
 * Background: every `hydrate('Name', ...)` call shares one global
 * registry keyed by string name. Two files defining a non-exported
 * helper with the same identifier (e.g. an internal `<SunIcon>` in
 * `theme-switcher.tsx` and the public lucide-style `<SunIcon>` in
 * `ui/components/ui/icon`) overwrite each other at module load time;
 * the `<SunIcon />` JSX usage then resolves to whichever registration
 * happened to load last.
 *
 * The fix is to rewrite the registry key for components that are
 * **not exported** — they are private to their source file and can
 * never legitimately appear in another module — into a file-scoped
 * form `${name}__${fileScope}` where `fileScope` is a stable 8-char
 * hash of the entry path. Exported components keep their original
 * name so cross-file `<Imported />` JSX still resolves the same way
 * it always has.
 */

import type { ClientJsContext } from './types'

/**
 * Compute a stable 8-char hex hash for a source file path.
 * Uses a simple FNV-1a 32-bit hash so the compiler does not need to
 * pull in `node:crypto` (the package is bundled for browser-friendly
 * environments via the playground worker, where node built-ins are
 * unavailable).
 */
export function computeFileScope(entryPath: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < entryPath.length; i++) {
    h ^= entryPath.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // Mix once more (FNV-1a + xorshift) to widen the entropy of the
  // 8-char prefix when paths share a common suffix like
  // `/index.tsx`.
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Return the registry key for a component reference.
 *
 * - Sibling component that is non-exported → `${name}__${fileScope}`
 * - Anything else (sibling that is exported, imported, or no file scope
 *   supplied) → `name` unchanged.
 */
export function applyComponentScope(name: string, ctx: ClientJsContext): string {
  if (!ctx.fileScope) return name
  if (!ctx.nonExportedSiblings.has(name)) return name
  return `${name}__${ctx.fileScope}`
}

/**
 * Module-level "active scope" used by html-template emission, where
 * threading a `ctx` through every recursive helper (irToHtmlTemplate,
 * irToPlaceholderTemplate, irChildrenToJsExpr, generateCsrTemplate, …)
 * would touch every call site in this package.
 *
 * The compiler sets the scope before generating client JS for a file
 * and clears it on the way out. `nameForRegistryRef(name)` reads the
 * current scope and rewrites non-exported siblings; everything else
 * passes through unchanged.
 */
let _activeScope: { fileScope: string; nonExportedSiblings: Set<string> } | null = null

export function setActiveComponentScope(scope: { fileScope: string; nonExportedSiblings: Set<string> } | null): void {
  _activeScope = scope
}

/** Resolve a component name to its registry key under the active file scope. */
export function nameForRegistryRef(name: string): string {
  if (!_activeScope) return name
  if (!_activeScope.fileScope) return name
  if (!_activeScope.nonExportedSiblings.has(name)) return name
  return `${name}__${_activeScope.fileScope}`
}
