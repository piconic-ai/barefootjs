/**
 * Shared-component fixture snapshot generator.
 *
 * Library-shaped wrapper around the snapshot pipeline both
 * `scripts/snapshot.ts` (interactive CLI) and
 * `scripts/generate-expected-html.ts` (auto-update workflow entry point)
 * call into, so the fixture-hydrate layer and the inline-expectedHtml
 * conformance corpus stay in sync from a single source of truth.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { compileJSX, combineParentChildClientJs } from '@barefootjs/jsx'
import {
  SNAPSHOT_DIR,
  componentPath,
  componentSourcePath,
  fixtureSourceRoot,
  loadAllSharedSpecs,
  resolveSiblingBasenames,
  resolveSiblingComponents,
  resolveSiblingModuleMap,
  resolveSiblingSpecifiers,
  sharedFixtureInstanceId,
  siblingSourceRoot,
  sourceFileBasename,
  uiChildModulePath,
  type FixtureSourceRoot,
  type SharedFixtureSpec,
} from '../fixtures/_helpers'

/**
 * Derive a stable 32-bit seed from a fixture id so each fixture's PRNG
 * state is a pure function of its own id — adding or reordering fixtures
 * never churns another fixture's frozen output (#1494). FNV-1a 32-bit.
 */
export function seedFromId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Temporarily swap `Math.random` for a seeded PRNG (mulberry32) while
 * `fn` runs, then restore. Scoped tightly around the SSR render so the
 * compiled-template `__scopeId = name + Math.random()...` fallback in
 * `HonoAdapter` produces byte-stable `bf-s` suffixes across regens —
 * otherwise every fixture regeneration that hits the random fallback
 * (loop children of `"use client"` roots) reshuffles those suffixes
 * and the snapshot file diffs even when nothing semantic changed (#1494).
 *
 * Restoration runs in `finally` so a throwing render does not leak the
 * stub into unrelated callers in the same process.
 */
async function withSeededMathRandom<T>(seed: number, fn: () => Promise<T>): Promise<T> {
  const originalRandom = Math.random
  let state = (seed >>> 0) || 1
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  try {
    return await fn()
  } finally {
    Math.random = originalRandom
  }
}

/**
 * Pre-compile a UI/demo fixture's siblings to committed, export-intact
 * SSR modules (#1467 Phase 2a) and return the import-specifier → path
 * map the Hono render re-anchors to. Writing the export-intact marked
 * template (with a jsx pragma) as a real module is what lets SSR load
 * children through the module system instead of inlining + stripping
 * their exports. Deterministic: the marked template is a pure function
 * of the child source (the `Math.random()` scope-id fallback lives in
 * the emitted string, evaluated only at render time).
 *
 * A sibling reachable through several specifiers (demo root alias +
 * another sibling's `../<name>` relative) registers the same module
 * under each of them — one file write, several map keys.
 */
async function writeUiChildModules(
  spec: SharedFixtureSpec,
): Promise<Record<string, string> | undefined> {
  const root = fixtureSourceRoot(spec)
  if (root === 'shared' || root === 'fixture') return undefined
  const entries = resolveSiblingSpecifiers(spec)
  if (entries.size === 0) return undefined

  const map: Record<string, string> = {}
  for (const [base, specifiers] of entries) {
    const childSource = await Bun.file(componentPath(siblingSourceRoot(root), base)).text()
    const compiled = compileJSX(childSource, `${base}.tsx`, { adapter: new HonoAdapter() })
    const tmpl = compiled.files.find(f => f.type === 'markedTemplate')
    if (!tmpl) {
      const errs = compiled.errors.map(e => `${e.severity}: ${e.message}`).join('\n')
      throw new Error(`No marked template for sibling ${base}.tsx:\n${errs}`)
    }
    const moduleContent = `/** @jsxImportSource hono/jsx */\n${tmpl.content.trimEnd()}\n`
    const modPath = uiChildModulePath(spec.id, base)
    writeFileSync(modPath, moduleContent)
    for (const specifier of specifiers) map[specifier] = modPath
  }
  return map
}

async function compileClientJs(root: FixtureSourceRoot, basename: string): Promise<string> {
  const source = await Bun.file(componentPath(root, basename)).text()
  return compileClientJsFromSource(source, basename)
}

/**
 * `compileClientJs` minus the disk read — the mutation sweep already has
 * the (mutated) source text in memory and must not read the original
 * on-disk file back over it.
 */
function compileClientJsFromSource(source: string, basename: string): string {
  const compiled = compileJSX(source, `${basename}.tsx`, { adapter: new HonoAdapter() })
  const file = compiled.files.find(f => f.type === 'clientJs')
  if (!file) {
    const errs = compiled.errors.map(e => `${e.severity}: ${e.message}`).join('\n')
    throw new Error(`No clientJs file in compileJSX output for ${basename}.tsx:\n${errs}`)
  }
  return file.content
}

/**
 * Remove top-level import declarations whose specifier names one of the
 * fixture's inlined siblings (`@ui/components/ui/<name>` / `../<name>`)
 * from combined client JS. TS AST walk over top-level statements with
 * span-based splicing — the repo-wide idiom for editing compiled client
 * JS (see `combine-client-js.ts`); a regex would false-match import-like
 * text inside string literals. The extra parse is fine here: snapshot
 * generation is off the build hot path.
 */
function stripInlinedSiblingImports(clientJs: string, spec: SharedFixtureSpec): string {
  const siblingSpecifiers = new Set(
    [...resolveSiblingSpecifiers(spec).values()].flat(),
  )
  if (siblingSpecifiers.size === 0) return clientJs
  const sourceFile = ts.createSourceFile(
    'combined.js',
    clientJs,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ false,
    ts.ScriptKind.JS,
  )
  const dropSpans: Array<[number, number]> = []
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (!siblingSpecifiers.has(stmt.moduleSpecifier.text)) continue
    // Include the trailing newline so the splice doesn't leave blanks.
    const end = stmt.getEnd()
    dropSpans.push([stmt.getStart(sourceFile), clientJs[end] === '\n' ? end + 1 : end])
  }
  if (dropSpans.length === 0) return clientJs
  let out = ''
  let cursor = 0
  for (const [start, end] of dropSpans) {
    out += clientJs.slice(cursor, start)
    cursor = end
  }
  return out + clientJs.slice(cursor)
}

export interface GenerateSnapshotOptions {
  /**
   * Root component source text to compile/render instead of the on-disk
   * file at `componentSourcePath(spec)` (mutation sweep, #2481 step 2:
   * `mutation-generate.ts` feeds a mutated source through the exact same
   * seeded-render pipeline the frozen fixtures use, so a mutant's SSR
   * HTML + client JS are produced identically to how the original
   * fixture's were). Siblings are NOT re-derived from this override —
   * mutation only ever touches the fixture's own root file, so the
   * committed sibling SSR modules (`writeUiChildModules`'s prior output)
   * are reused read-only via `resolveSiblingModuleMap` instead of being
   * regenerated, which would otherwise dirty the committed
   * `__snapshots__/*.ssr.tsx` files on every mutation sweep.
   */
  sourceOverride?: string
  /**
   * Directory to write `<id>.html` / `<id>.client.js` into. Defaults to
   * `SNAPSHOT_DIR`. Mutation sweep output goes to `.mutants/` (gitignored)
   * so mutant artifacts never mix with the committed fixture corpus.
   */
  outDir?: string
  /**
   * Basename (without extension) for the written files, in place of
   * `spec.id`. Lets the mutation sweep write `<fixtureId>__<mutationId>`
   * pairs into one shared `.mutants/` directory without clobbering.
   */
  outBasename?: string
  /**
   * Seed for `withSeededMathRandom`, in place of `seedFromId(spec.id)`.
   * The mutation sweep seeds on `${fixtureId}::${mutationId}` so each
   * mutant gets its own stable-but-distinct scope-id stream rather than
   * silently colliding with the base fixture's.
   */
  seed?: number
}

/**
 * Core render pipeline shared by `generateSharedComponentSnapshot`
 * (writes the committed fixture corpus) and the mutation sweep's
 * `mutation-generate.ts` (writes disposable mutant artifacts under
 * `.mutants/`). Split out so both callers stay byte-for-byte aligned on
 * how a root source becomes SSR HTML + client JS — the only difference
 * between them is which source text and which output directory.
 */
export async function generateSharedComponentSnapshotCore(
  spec: SharedFixtureSpec,
  options: GenerateSnapshotOptions = {},
): Promise<{ htmlBytes: number; clientJsBytes: number; html: string; clientJs: string }> {
  const root = fixtureSourceRoot(spec)
  const sourceBasename = sourceFileBasename(spec)
  const isOverride = options.sourceOverride !== undefined
  const source = options.sourceOverride ?? (await Bun.file(componentSourcePath(spec)).text())

  // Pin the root scope's `bf-s` via `__instanceId`. The shared id
  // helper keeps snapshot generation and adapter-conformance runs
  // aligned on the same `<ComponentName>_test` token, which both the
  // hydration walker and `normalizeHTML` know how to dispatch /
  // canonicalise.
  const ssrProps = { ...spec.props, __instanceId: sharedFixtureInstanceId(spec) }

  // SSR-side child handling.
  //   - Shared fixtures: pass each sibling's source through `components`
  //     (keyed by the parent's import specifier) so renderHonoComponent
  //     inlines them.
  //   - UI fixtures (#1467 Phase 2a): pre-write each sibling as a
  //     committed, export-intact SSR module and pass `componentModules`
  //     so the parent's `../<child>` import is re-anchored to a real
  //     module — no export stripping. The sibling set is auto-inferred
  //     from `../<name>` imports.
  //   - A source override (mutation sweep) never touches siblings, so it
  //     reuses the already-committed modules read-only instead of
  //     rewriting them via `writeUiChildModules`.
  const components = resolveSiblingComponents(spec)
  const componentModules = isOverride
    ? resolveSiblingModuleMap(spec)
    : await writeUiChildModules(spec)

  const ssrHtml = await withSeededMathRandom(options.seed ?? seedFromId(spec.id), () =>
    renderHonoComponent({
      source,
      adapter: new HonoAdapter(),
      props: ssrProps,
      // Pin the target export — `Object.keys(mod)` iterates alphabetically
      // for dynamically imported modules in Bun, so multi-component files
      // can otherwise render the wrong component.
      componentName: spec.componentName,
      components,
      componentModules,
    }),
  )

  let clientJs: string
  const extras = resolveSiblingBasenames(spec)
  if (extras.length === 0) {
    clientJs = isOverride ? await compileClientJsFromSource(source, sourceBasename) : await compileClientJs(root, sourceBasename)
  } else {
    // Use `combineParentChildClientJs` (same helper `bf build` uses) to
    // inline child component bundles into the parent and resolve the
    // `import '/* @bf-child:... */'` placeholders the compiler emits.
    // Raw concat would leave the placeholders intact and the browser
    // would 404 on `/* @bf-child:... */` URLs.
    const files = new Map<string, string>()
    files.set(
      sourceBasename,
      isOverride ? await compileClientJsFromSource(source, sourceBasename) : await compileClientJs(root, sourceBasename),
    )
    for (const extra of extras) {
      files.set(extra, await compileClientJs(siblingSourceRoot(root), extra))
    }
    const combined = combineParentChildClientJs(files)
    clientJs = combined.get(sourceBasename) ?? files.get(sourceBasename)!
    // The compiler sometimes keeps a *value* import for a sibling
    // alongside its `@bf-child` placeholder (command-demo's
    // `import { Command } from '@ui/components/ui/command'`). After
    // combining, the inlined bundle declares the same identifier
    // (`export function Command…`), so the leftover import is both a
    // duplicate declaration and an unresolvable bare specifier in the
    // fixture-hydrate browser page. Drop imports whose specifier is one
    // of this fixture's sibling specifiers — the inlined code provides
    // those bindings.
    clientJs = stripInlinedSiblingImports(clientJs, spec)
  }

  const outDir = options.outDir ?? SNAPSHOT_DIR
  const outBasename = options.outBasename ?? spec.id
  const htmlOut = resolve(outDir, `${outBasename}.html`)
  const clientJsOut = resolve(outDir, `${outBasename}.client.js`)
  writeFileSync(htmlOut, ssrHtml.trim() + '\n')
  writeFileSync(clientJsOut, clientJs.trimEnd() + '\n')

  return { htmlBytes: ssrHtml.length, clientJsBytes: clientJs.length, html: ssrHtml, clientJs }
}

export async function generateSharedComponentSnapshot(
  spec: SharedFixtureSpec,
): Promise<{ htmlBytes: number; clientJsBytes: number }> {
  return generateSharedComponentSnapshotCore(spec)
}

export async function generateAllSharedComponentSnapshots(
  filter?: { ids?: ReadonlyArray<string> },
): Promise<{ generated: number; specs: SharedFixtureSpec[] }> {
  const all = await loadAllSharedSpecs()
  const requested = filter?.ids
  const selected = requested
    ? all.filter(s => requested.includes(s.id))
    : all

  if (requested && selected.length !== requested.length) {
    const knownIds = all.map(s => s.id).join(', ')
    const unknown = requested.filter(id => !all.some(s => s.id === id))
    throw new Error(
      `Unknown fixture id(s): ${unknown.join(', ')}. Known: ${knownIds}`,
    )
  }

  for (const spec of selected) {
    const { htmlBytes, clientJsBytes } = await generateSharedComponentSnapshot(spec)
    console.log(
      `[${spec.id}] wrote ${spec.id}.html (${htmlBytes}B) + ` +
        `${spec.id}.client.js (${clientJsBytes}B)`,
    )
  }

  return { generated: selected.length, specs: selected }
}
