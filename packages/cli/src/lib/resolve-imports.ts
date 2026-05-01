// Resolve and inline relative imports in compiled client JS files.

import { dirname, resolve } from 'node:path'
import { RELATIVE_IMPORT_RE } from './patterns'
import { fileExists, readText, transpile, writeText } from './runtime'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parsed shape of the `import` statement that triggered an inline.
 *
 *   - `named`     — `import { a, b as c } from './x'` (record local→imported)
 *   - `namespace` — `import * as ns from './x'`
 *   - `default`   — `import D from './x'` or `import D, { ... } from './x'`
 *   - `bare`      — `import './x'` (side-effect; no bound names)
 */
interface ImportShape {
  /** Local names the parent uses, mapped to the imported names. */
  named: Array<{ local: string; imported: string }>
  /** Local namespace binding, if any (`* as ns`). */
  namespace?: string
  /** Local default binding, if any. */
  default?: string
}

/**
 * Parse an `import ... from '...'` statement (the full match returned by
 * RELATIVE_IMPORT_RE) into its bound-name shape. Returns `null` if the
 * statement is a side-effect-only import (`import './x'`).
 */
function parseImportShape(stmt: string): ImportShape | null {
  // Strip leading `import` and trailing `from '...'`.
  const m = stmt.match(/^import\s+(.+?)\s+from\s+['"][^'"]+['"]\s*;?$/)
  if (!m) return null // side-effect import: `import './x'`
  const clause = m[1].trim()
  const shape: ImportShape = { named: [] }

  // Split optional default + named/namespace: `Foo, { a, b }` or `Foo, * as ns`.
  let rest = clause
  const defaultMatch = rest.match(/^([A-Za-z_$][\w$]*)\s*(?:,\s*(.+))?$/)
  if (defaultMatch && !rest.startsWith('{') && !rest.startsWith('*')) {
    shape.default = defaultMatch[1]
    rest = defaultMatch[2]?.trim() ?? ''
  }

  if (rest.startsWith('*')) {
    const ns = rest.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)\s*$/)
    if (ns) shape.namespace = ns[1]
  } else if (rest.startsWith('{')) {
    const inner = rest.replace(/^\{|\}\s*$/g, '').trim()
    if (inner) {
      for (const part of inner.split(',')) {
        const p = part.trim()
        if (!p) continue
        const aliased = p.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/)
        if (aliased) {
          shape.named.push({ imported: aliased[1], local: aliased[2] })
        } else if (/^[A-Za-z_$][\w$]*$/.test(p)) {
          shape.named.push({ imported: p, local: p })
        }
      }
    }
  }
  return shape
}

/**
 * Collect the set of top-level exported names from an inlined module's
 * (already-recursed) JS body. Used to populate the IIFE return for
 * namespace imports (`import * as ns from './x'`), where the parent may
 * reference any exported name via `ns.foo`.
 *
 * Recognises:
 *   - `export const|let|var name`
 *   - `export function name`, `export async function name`
 *   - `export class name`
 *   - `export { a, b as c }` (uses the exported alias, i.e. `c`)
 *
 * Default exports are intentionally not collected — the parent reference
 * shape (`ns.default`) is unusual enough to leave out of scope.
 */
function collectExportedNames(body: string): string[] {
  const names = new Set<string>()
  const declRe = /^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm
  for (const m of body.matchAll(declRe)) names.add(m[1])
  const blockRe = /^export\s*\{([^}]*)\}\s*;?\s*$/gm
  for (const m of body.matchAll(blockRe)) {
    for (const part of m[1].split(',')) {
      const p = part.trim()
      if (!p) continue
      const aliased = p.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/)
      names.add(aliased ? aliased[2] : p)
    }
  }
  return [...names]
}

/**
 * Wrap an inlined module's body in an IIFE that re-exports only the names
 * the parent bundle actually references, then destructure those at the
 * splice site. This isolates module-private decls (e.g. two siblings each
 * with their own `const BAR_STYLE`) so they cannot collide in the parent's
 * top-level scope.
 *
 *   const { foo, bar } = (() => {
 *     /* inlined body, with `export` keywords stripped *\/
 *     return { foo, bar }
 *   })()
 *
 * For `import * as ns from './x'`, the IIFE returns every top-level
 * exported name. For side-effect-only `import './x'`, the IIFE has no
 * destructure on the outside and no return, but the body still runs.
 *
 * Default exports are out of scope: the body still has its `export
 * default` stripped to a bare expression, which is fine inside the IIFE.
 */
function wrapInIIFE(body: string, shape: ImportShape | null): string {
  // Scoping prelude: the body may still contain `export ...` keywords.
  // Strip them to plain decls so the IIFE body is valid JS.
  const stripped = body
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^export\s+/gm, '')
    .trim()

  if (!shape) {
    // Side-effect import: no bound names. Still scope-isolate.
    return `;(() => {\n${stripped}\n})();`
  }

  const returnEntries: string[] = []
  const destructureEntries: string[] = []

  if (shape.namespace) {
    // Build a single `const ns = (() => { ...; return { a, b, ... } })()`.
    const exported = collectExportedNames(body)
    const ret = exported.length ? `{ ${exported.join(', ')} }` : '{}'
    return `const ${shape.namespace} = (() => {\n${stripped}\nreturn ${ret};\n})();`
  }

  for (const { local, imported } of shape.named) {
    returnEntries.push(imported)
    destructureEntries.push(local === imported ? local : `${imported}: ${local}`)
  }
  if (shape.default) {
    // `import D from './x'` — surface the default binding via the IIFE.
    // The body's `export default <expr>` is stripped to a bare expression
    // by the regex above, which is then dead. Out of scope for this fix;
    // covered by the issue's "leave defaults out of scope" note.
  }

  if (returnEntries.length === 0) {
    // No bound names we know how to surface. Still IIFE-scope the body.
    return `;(() => {\n${stripped}\n})();`
  }

  return `const { ${destructureEntries.join(', ')} } = (() => {\n${stripped}\nreturn { ${returnEntries.join(', ')} };\n})();`
}

export interface ResolveRelativeImportsOptions {
  /** Absolute path to the dist directory (base for manifest paths) */
  distDir: string
  /** Build manifest: componentName -> { clientJs?, markedTemplate } */
  manifest: Record<string, { clientJs?: string; markedTemplate: string }>
  /** Source directories to search for modules (checked after the client JS file's own directory) */
  sourceDirs?: string[]
  /**
   * Per-entry source directories, keyed by manifest key. Searched after the
   * client JS file's own directory but before the global `sourceDirs`.
   *
   * The compiler emits relative imports against the source layout (e.g. a
   * `'use client'` component at `src/components/canvas/DeskCanvas.tsx`
   * importing `./useYjs` resolves to `src/components/canvas/useYjs.ts`).
   * The dist file lives at a different path with no sibling helper, so
   * without this map the resolver would silently strip the import. See
   * piconic-ai/barefootjs#1133.
   */
  sourceDirsByManifestKey?: Record<string, string[]>
}

/**
 * Result of resolving a relative import against the on-disk dist
 * layout. Each variant has a clear handling rule in
 * `inlineRelativeImports`:
 *
 *   - `external` — file exists at runtime as a separately-served
 *     artifact (e.g. `./barefoot.js` is the runtime bundle). Inlining
 *     would duplicate code; stripping the import would break runtime
 *     references. Leave the line alone.
 *   - `inline`   — `.ts` source found; transpile and splice in.
 *     `.tsx` is treated as a server component (already rendered at
 *     SSR time) and the import line is stripped instead.
 *   - `missing`  — nothing matched. Strip the import line.
 */
type ResolveResult =
  | { kind: 'external' }
  | { kind: 'inline'; path: string }
  | { kind: 'missing' }

async function resolveSourceFile(importPath: string, searchDirs: string[]): Promise<ResolveResult> {
  for (const dir of searchDirs) {
    const basePath = resolve(dir, importPath)
    // If the import path already points to an existing runtime artifact
    // (e.g. `./barefoot.js`), keep the import as-is. Without this,
    // watch's cached re-builds would silently strip the runtime import
    // line from every component's client JS, and the browser would
    // then fail with `ReferenceError: hydrate is not defined`.
    if (/\.(?:js|mjs|cjs)$/.test(importPath) && await fileExists(basePath)) {
      return { kind: 'external' }
    }
    for (const ext of ['.ts', '.tsx', '.js']) {
      if (await fileExists(basePath + ext)) return { kind: 'inline', path: basePath + ext }
    }
  }
  return { kind: 'missing' }
}

/**
 * Process a single file's relative imports, mutating `content` in place.
 * Recurses into transitively-imported `.ts` modules so that, e.g.,
 * `client.tsx → nav-data.ts → component-registry.ts` all end up inlined
 * in the right declaration order.
 */
async function inlineRelativeImports(
  content: string,
  searchDirs: string[],
  inlinedPaths: Set<string>,
  loggingPath: string
): Promise<string> {
  const re = new RegExp(RELATIVE_IMPORT_RE.source, RELATIVE_IMPORT_RE.flags)
  const matches = [...content.matchAll(re)]
  if (matches.length === 0) return content

  for (const match of matches) {
    const importPath = match[1]
    const fullMatch = match[0]
    const result = await resolveSourceFile(importPath, searchDirs)

    if (result.kind === 'external') {
      // Existing runtime artifact (e.g. ./barefoot.js); keep import as-is.
      continue
    }

    if (result.kind === 'missing' || inlinedPaths.has(result.path)) {
      content = content.replace(new RegExp(escapeRegExp(fullMatch) + '\\n?'), '')
      continue
    }

    if (result.path.endsWith('.tsx')) {
      content = content.replace(new RegExp(escapeRegExp(fullMatch) + '\\n?'), '')
      console.log(`Stripped server component import: ${importPath} from ${loggingPath}`)
      continue
    }

    inlinedPaths.add(result.path)
    const sourceContent = await readText(result.path)
    let jsCode = transpile(sourceContent, { loader: 'ts' })

    // Recursively resolve relative imports inside the inlined module before
    // stripping its import lines. Resolution is anchored to the source file's
    // own directory so transitive paths (e.g. './component-registry') resolve
    // correctly regardless of where the parent client JS lives.
    //
    // The inner inline replaces each transitive import with an IIFE-wrapped
    // splice (see wrapInIIFE), so the inner module's private decls stay
    // hidden from the outer module's scope. The outer wrapInIIFE call below
    // then hides the OUTER module's privates from the parent. Composition:
    // privates only ever leak one frame outward, never to top level.
    jsCode = await inlineRelativeImports(
      jsCode,
      [dirname(result.path), ...searchDirs.slice(1)],
      inlinedPaths,
      loggingPath,
    )

    // Wrap the inlined body in an IIFE that re-exports only the names the
    // parent imported (see wrapInIIFE for shape rules). This scopes
    // module-private decls so two siblings declaring the same identifier
    // (e.g. `const BAR_STYLE`) don't collide in the parent's top-level
    // scope. piconic-ai/barefootjs#1141.
    const shape = parseImportShape(fullMatch)
    const wrapped = wrapInIIFE(jsCode, shape)

    content = content.replace(fullMatch, wrapped)
    console.log(`Inlined: ${importPath} into ${loggingPath}`)
  }

  return content
}

/**
 * Resolve relative imports in compiled client JS files.
 *
 * For each client JS file in the manifest:
 * - `.ts` imports: transpile and inline the code (recursively for transitive `.ts` deps)
 * - `.tsx` imports: strip (server component, already rendered at SSR time)
 * - Not found / already inlined: strip
 */
export async function resolveRelativeImports(options: ResolveRelativeImportsOptions): Promise<void> {
  const { distDir, manifest, sourceDirs = [], sourceDirsByManifestKey = {} } = options

  for (const [name, entry] of Object.entries(manifest)) {
    if (!entry.clientJs) continue
    const filePath = resolve(distDir, entry.clientJs)
    let content: string
    try {
      content = await readText(filePath)
    } catch {
      continue
    }

    const perEntryDirs = sourceDirsByManifestKey[name] ?? []
    const inlinedPaths = new Set<string>()
    const next = await inlineRelativeImports(
      content,
      [dirname(filePath), ...perEntryDirs, ...sourceDirs],
      inlinedPaths,
      entry.clientJs,
    )

    if (next !== content) {
      await writeText(filePath, next)
    }
  }
}
