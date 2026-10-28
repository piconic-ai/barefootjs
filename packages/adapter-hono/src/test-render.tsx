/**
 * Hono test renderer
 *
 * Compiles JSX source with HonoAdapter and renders to HTML via Hono's app.request().
 * Used by adapter-tests conformance runner.
 */

/** @jsxImportSource hono/jsx */

import { compileFixtureJSX } from '@barefootjs/adapter-tests/harness-program'
import type { TemplateAdapter } from '@barefootjs/jsx'
import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { readFileSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import ts from 'typescript'
import { BfPortals } from "./portals.tsx"

// Place temp files inside the hono package so hono/jsx resolves correctly
const RENDER_TEMP_DIR = resolve(import.meta.dir, '../.render-temp')

export interface RenderOptions {
  /** JSX source code */
  source: string
  /** Template adapter to use */
  adapter: TemplateAdapter
  /** Props to inject (optional) */
  props?: Record<string, unknown>
  /** Additional component files (filename → source) */
  components?: Record<string, string>
  /**
   * Pre-compiled child component modules (import specifier → absolute
   * module path) — #1467 Phase 2a. When the parent imports one of these
   * specifiers, the import is *re-anchored* to the given module path
   * (kept as a real ESM import) instead of having the child inlined via
   * `components`. The module is a committed, export-intact marked
   * template, so SSR loads it through the module system — no export
   * stripping. Takes precedence over `components` for the same key.
   */
  componentModules?: Record<string, string>
  /**
   * Explicit component to render when the source declares multiple
   * exports. When omitted, the first function-valued export in
   * `Object.keys(mod)` iteration order is picked — that order is
   * alphabetical for dynamically imported ES modules in Bun/V8, so
   * relying on declaration order can pick the wrong component
   * (e.g. `PropsReactivityComparison` before `ReactiveProps`).
   */
  componentName?: string
}

/** One replacement of `code.slice(start, end)`. */
interface SourceEdit {
  start: number
  end: number
  text: string
}

/** Apply non-overlapping `edits` to `code`. */
function applySourceEdits(code: string, edits: readonly SourceEdit[]): string {
  let out = code
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out
}

/** The top-level statements of a compiled marked template. */
function topLevelStatements(code: string): readonly ts.Statement[] {
  return ts.createSourceFile('module.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).statements
}

/**
 * Drop module-level exports from a compiled marked template so it can be
 * inlined as plain declarations alongside other components. Specifier
 * blocks (`export { … }`, `export type { … }`, with or without a
 * trailing `from '…'` re-export source) are removed whole; declaration
 * forms (`export function/const/let/type/interface`, `export default`)
 * keep their body with only the `export` / `default` keywords removed.
 * A top-level statement walk, so text inside a string, template literal
 * or comment is never touched.
 */
function stripModuleExports(code: string): string {
  const edits: SourceEdit[] = []
  for (const statement of topLevelStatements(code)) {
    if (ts.isExportDeclaration(statement)) {
      edits.push({ start: statement.getStart(), end: statement.end, text: '' })
    } else if (ts.isExportAssignment(statement)) {
      // `export default <expr>` keeps the expression as a statement.
      edits.push({ start: statement.getStart(), end: statement.expression.getStart(), text: '' })
    } else if (ts.canHaveModifiers(statement)) {
      for (const modifier of ts.getModifiers(statement) ?? []) {
        if (modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword) {
          edits.push({ start: modifier.getStart(), end: modifier.end, text: '' })
        }
      }
    }
  }
  return applySourceEdits(code, edits)
}

/**
 * What replaces an import of a child that's being INLINED (its
 * declarations are spliced in verbatim, see `stripModuleExports` above):
 * `const <local> = <declared>` for every aliased named specifier
 * (`{ Label as AliasedLabel }`), or nothing when every specifier is a
 * bare, non-aliased name (nothing left to bind). A default-import
 * specifier (`import Label from …`) has no declared name to alias
 * against and is dropped, matching what a bare inlined child needs.
 */
function aliasDeclarationsFor(declaration: ts.ImportDeclaration): string {
  const bindings = declaration.importClause?.namedBindings
  if (!bindings || !ts.isNamedImports(bindings)) return ''
  return bindings.elements
    .filter(element => element.propertyName !== undefined)
    .map(element => `const ${element.name.text} = ${element.propertyName!.text};`)
    .join(' ')
}

export async function renderHonoComponent(options: RenderOptions): Promise<string> {
  const { source, adapter, props, components, componentModules, componentName: requestedName } = options

  // Child imports re-anchored to a pre-compiled module (#1467 Phase 2a):
  // import specifier → absolute path. These are NOT inlined; the parent's
  // matching import is rewritten to the path and loaded as a real module.
  const moduleMap = new Map<string, string>(Object.entries(componentModules ?? {}))

  // Compile child components first (inline path). Keys also present in
  // `moduleMap` are skipped here — they load as real modules instead.
  const childCodes: string[] = []
  const componentKeys = new Set<string>()
  if (components) {
    for (const [filename, childSource] of Object.entries(components)) {
      if (moduleMap.has(filename)) continue
      componentKeys.add(filename)
      const childResult = compileFixtureJSX(childSource, filename, { adapter })
      const childErrors = childResult.errors.filter(e => e.severity === 'error')
      if (childErrors.length > 0) {
        throw new Error(`Compilation errors in ${filename}:\n${childErrors.map(e => e.message).join('\n')}`)
      }
      const childTemplate = childResult.files.find(f => f.type === 'markedTemplate')
      if (!childTemplate) throw new Error(`No marked template for ${filename}`)
      // Strip exports so only the parent component is exported, inlining
      // the child as plain top-level declarations. The marked template's
      // export forms are fixed by `generateModuleExports` (+ the
      // component's own `export function`) in @barefootjs/jsx, each on
      // its own line:
      //
      //   export const/let X = …      export function / async function …
      //   export type X = …           export interface X { … }
      //   export { A, B } [from '…']   export type { A } [from '…']
      //
      // The `export { … }` / `export type { … }` *specifier* blocks
      // (with or without a trailing `from '…'`) must be dropped whole —
      // their bindings are already declared inline, and naively removing
      // just the `export ` keyword leaves a bare `{ A }` / `type { A }`
      // (the latter a syntax error). Declaration forms keep their body;
      // only the leading `export `/`export default ` is removed.
      const localCode = stripModuleExports(childTemplate.content)
      childCodes.push(localCode)
    }
  }

  // Compile parent source
  const result = compileFixtureJSX(source, 'component.tsx', { adapter })

  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors:\n${errors.map(e => e.message).join('\n')}`)
  }

  const templateFile = result.files.find(f => f.type === 'markedTemplate')
  if (!templateFile) throw new Error('No marked template in compile output')

  // Pre-compiled child modules are committed under the adapter-tests
  // fixtures tree, where `hono/jsx` is NOT resolvable (hono lives in
  // this package's node_modules — the very reason render temp files go
  // here). Copy each committed module verbatim into the render temp dir
  // and re-anchor the parent import there. The committed file stays the
  // reviewable source of truth; this is a byte copy, not export surgery.
  const childModuleWrites: Array<{ path: string; content: string }> = []
  const moduleTempPaths = new Map<string, string>()
  for (const [key, modPath] of moduleMap) {
    const safe = key.replace(/[^a-zA-Z0-9]+/g, '_')
    const tempPath = resolve(
      RENDER_TEMP_DIR,
      `child-${safe}-${Date.now()}-${Math.random().toString(36).slice(2)}.tsx`,
    )
    moduleTempPaths.set(key, tempPath)
    childModuleWrites.push({ path: tempPath, content: readFileSync(modPath, 'utf8') })
  }

  // Resolve each child import: re-anchor to a pre-compiled module's temp
  // copy (`moduleTempPaths`), strip it (inlined via `components`), or
  // leave it. Both maps key on the import specifier; match the importing
  // module's path with or without a `.tsx` extension (`./badge` ↔
  // `./badge.tsx`). A top-level `ImportDeclaration` walk, so an
  // import-looking line inside a template literal or comment is text.
  const rewriteChildImports = (code: string): string => {
    if (componentKeys.size === 0 && moduleTempPaths.size === 0) return code
    const matchKey = (importPath: string, keys: Iterable<string>): string | undefined => {
      for (const key of keys) {
        const keyWithoutExt = key.replace(/\.tsx?$/, '')
        if (importPath === keyWithoutExt || importPath === key) return key
      }
      return undefined
    }
    const edits: SourceEdit[] = []
    for (const statement of topLevelStatements(code)) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      const specifier = statement.moduleSpecifier
      const moduleKey = matchKey(specifier.text, moduleTempPaths.keys())
      if (moduleKey) {
        edits.push({ start: specifier.getStart(), end: specifier.end, text: JSON.stringify(moduleTempPaths.get(moduleKey)) })
      } else if (matchKey(specifier.text, componentKeys)) {
        // The inlined child keeps its OWN declared name (`stripModuleExports`
        // only removes `export `, it doesn't rename), but the importing
        // module's JSX still references whatever LOCAL name it imported the
        // child under (#2777 — Hono correctly keeps the caller's local
        // binding rather than the declared name). An aliased specifier
        // (`import { Label as AliasedLabel } from './label'`) needs a
        // `const AliasedLabel = Label` left behind, or the JSX throws
        // `ReferenceError: AliasedLabel is not defined` — this harness
        // inlines the child by source splice, not through a real module
        // boundary, so there's no `import … as …` left to do the binding.
        edits.push({ start: statement.getStart(), end: statement.end, text: aliasDeclarationsFor(statement) })
      }
    }
    return applySourceEdits(code, edits)
  }

  const parentCode = rewriteChildImports(templateFile.content)
  // Pre-compiled child modules may themselves import other pre-compiled
  // siblings (#1467 Phase 2c: the demo root's `accordion` sibling imports
  // `../icon`). Their committed copies keep the source specifier, which
  // doesn't resolve from the temp dir — re-anchor through the same map so
  // nested sibling imports land on their own temp copies. `moduleTempPaths`
  // is fully populated before any content is rewritten, so ordering
  // between siblings doesn't matter.
  for (const write of childModuleWrites) {
    write.content = rewriteChildImports(write.content)
  }

  // Combine: JSX pragma + child compiled functions + parent compiled code
  const codeParts = ['/** @jsxImportSource hono/jsx */']
  // A child may import a sibling child (`./mid` rendering `./tag`): that
  // sibling is inlined too, so its import line goes like the parent's.
  for (const childCode of childCodes) {
    codeParts.push(rewriteChildImports(childCode))
  }
  codeParts.push(parentCode)
  const code = codeParts.join('\n')

  await mkdir(RENDER_TEMP_DIR, { recursive: true })
  // Materialise the verbatim child-module copies next to the parent so
  // their `hono/jsx` pragma resolves.
  for (const { path, content } of childModuleWrites) {
    await Bun.write(path, content)
  }
  // Unique filename per render to avoid Bun's process-level module cache
  // (bun#12371: re-importing the same path returns stale module)
  const tempFile = resolve(
    RENDER_TEMP_DIR,
    `render-${Date.now()}-${Math.random().toString(36).slice(2)}.tsx`,
  )
  await Bun.write(tempFile, code)

  try {
    const mod = await import(tempFile)

    // Explicit `componentName` wins; otherwise pick the first
    // function-valued export. `Object.keys` for dynamically imported
    // modules iterates alphabetically in Bun/V8, so the fallback can
    // surprise multi-component files — pass `componentName` to pin.
    let resolvedName: string | undefined = requestedName
    if (resolvedName) {
      if (typeof mod[resolvedName] !== 'function') {
        const available = Object.keys(mod).filter(k => typeof mod[k] === 'function')
        throw new Error(
          `Requested component "${resolvedName}" not found in compiled module. Available: ${available.join(', ')}`,
        )
      }
    } else {
      resolvedName = Object.keys(mod).find(k => typeof mod[k] === 'function')
      if (!resolvedName) throw new Error('No component function found in compiled module')
    }

    const Component = mod[resolvedName]

    // Render using Hono's app.request(), through the `jsxRenderer`
    // middleware + `<BfPortals />` outlet — matching the real page shape
    // (`site/ui/renderer.tsx`'s `{children}<BfPortals /><BfScripts />`)
    // instead of the bare `c.html(Component(...))` this used before #3059:
    // an SSR-portal-marked element (`ssrPortalOwnerScope`) is collected via
    // `useRequestContext()` (from `hono/jsx-renderer`) and only reachable
    // through this middleware — without it `collectSsrPortalElement` falls
    // back to inline rendering (its documented no-context fallback), silently
    // hiding the very divergence this harness exists to catch. `docType:
    // false` keeps the fixture's `expectedHtml` free of an added
    // `<!DOCTYPE html>` prefix; no other fixture's output changes, since
    // `BfPortals` renders nothing when nothing was collected.
    const app = new Hono()
    app.use(
      '*',
      jsxRenderer(({ children }) => <>{children}<BfPortals /></>, { docType: false }),
    )
    // `<Component .../>` (a lazy element), NOT `Component(...)` (an eager
    // call): `Component(...)` would run the WHOLE component body —
    // including any `collectSsrPortalElement` call inside it — as an
    // ordinary argument evaluation, BEFORE `c.render` gets a chance to
    // wrap it in the `RequestContext.Provider` that
    // `useRequestContext()` reads from. JSX defers that call to Hono's
    // own stringification walk, which happens AFTER the render tree
    // (and so the Provider) is in place.
    app.get('/', (c) =>
      c.render(<Component __instanceId="test" __bfChild={false} {...props} />),
    )

    const res = await app.request('/')
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Render failed with status ${res.status}: ${body}`)
    }
    return await res.text()
  } finally {
    await rm(tempFile, { force: true }).catch(() => {})
    for (const { path } of childModuleWrites) {
      await rm(path, { force: true }).catch(() => {})
    }
  }
}
