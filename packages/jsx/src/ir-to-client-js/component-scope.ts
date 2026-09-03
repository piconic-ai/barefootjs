import type { ImportInfo } from '../types.ts'

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
 *
 * Concurrency note: the active scope below is module-level mutable
 * state. The compiler is single-threaded today (sync per-file inside
 * a sequential loop in `compileMultipleComponentsSync`), so this is
 * safe. If a future build path ever invokes `compileJSX` concurrently
 * for multiple files in the same process, the scope must be threaded
 * through the call chain or stashed per-call instead.
 */

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

/**
 * #2777 — a client component referenced under an import alias
 * (`import { Foo as Bar } from './Foo'`, `<Bar/>`) must resolve its
 * registry key to the DECLARED/exported name (`Foo`, what the child's own
 * module registers under via `hydrate('Foo', ...)`), not the caller-local
 * binding (`Bar`) — the registry is keyed by string name, so a mismatch
 * here left `initChild('Bar', ...)` unable to find `Foo`'s registration
 * and hydration silently never ran.
 *
 * A local alias → exported name map, active per client-JS generation the
 * same way `_activeScope` is (module-level state, installed/cleared by
 * `generateClientJsWithSourceMap`) rather than threaded through every
 * recursive emitter — same rationale as `_activeScope` above.
 */
let _activeImportAliases: ReadonlyMap<string, string> | null = null

/**
 * Build a local-alias → exported-name map from a component's parsed
 * imports. Only VALUE, non-default, non-namespace, ALIASED specifiers
 * produce an entry — a bare `import { Foo }` needs no rewrite (`name`
 * already equals what's registered), and default/namespace imports can't
 * be resolved this way (a default's exported name isn't recorded here,
 * and a namespace member reference isn't an aliased specifier at all).
 */
export function buildImportAliasMap(imports: readonly ImportInfo[]): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const imp of imports) {
    if (imp.isTypeOnly) continue
    for (const spec of imp.specifiers) {
      if (spec.isTypeOnly || spec.isDefault || spec.isNamespace || spec.alias === null) continue
      aliases.set(spec.alias, spec.name)
    }
  }
  return aliases
}

export function setActiveImportAliases(aliases: ReadonlyMap<string, string> | null): void {
  _activeImportAliases = aliases
}

/**
 * Resolve a local JSX tag name to the name the referenced component's own
 * module registers under (`hydrate(<name>, ...)`) — the caller-facing
 * alias if imported under one, otherwise the name unchanged. Used
 * anywhere a name needs to reach the runtime registry WITHOUT also going
 * through the non-exported-sibling rewrite below (the `@bf-child:` marker
 * comment, which must never carry a same-file sibling's hash).
 */
export function resolveImportedComponentName(name: string): string {
  return _activeImportAliases?.get(name) ?? name
}

/** Resolve a component name to its registry key under the active file scope. */
export function nameForRegistryRef(name: string): string {
  // An aliased IMPORT always wins over the non-exported-sibling rewrite:
  // `import { Foo as Bar } from './Foo'` plus a private same-file
  // `function Foo() {}` must still resolve `<Bar/>` to the imported
  // `Foo`, not hash the sibling's `Foo` key onto it.
  const imported = _activeImportAliases?.get(name)
  if (imported !== undefined) return imported
  if (!_activeScope) return name
  if (!_activeScope.fileScope) return name
  if (!_activeScope.nonExportedSiblings.has(name)) return name
  return `${name}__${_activeScope.fileScope}`
}
