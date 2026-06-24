/**
 * Helpers for fixtures lifted from `integrations/shared/components/`.
 *
 * Each shared-component fixture conformed to a near-identical recipe:
 *   1. Read the .tsx source from `integrations/shared/components/`.
 *   2. Read the matching SSR HTML + client JS snapshots from
 *      `__snapshots__/`.
 *   3. Hand them to `createFixture` along with declared `props` and
 *      `interactions`.
 *
 * `defineSharedFixture` collapses that recipe into a single call so each
 * fixture file is ~20 lines of example-specific data instead of ~60 lines
 * of plumbing. The CLI generator at `scripts/snapshot.ts` imports the
 * same `spec` object each fixture exports, so the source-of-truth for
 * `(componentName, props, id)` is the fixture file itself — no parallel
 * registry to drift out of sync.
 *
 * Missing snapshots are tolerated (the runner already skips fixtures
 * without `expectedHtml` / `expectedClientJs`), so importing a fixture
 * before `bun run snapshot` has produced its frozen pair does not throw —
 * the CLI itself can import the spec to know what to generate.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import {
  createFixture,
  type InteractionStep,
  type JSXFixture,
} from '../src/types'

const HERE = dirname(fileURLToPath(import.meta.url))

export const SHARED_COMPONENTS_DIR = resolve(
  HERE,
  '../../../integrations/shared/components',
)
/**
 * Second source root (#1467 Phase 2a): the `site/ui` component library.
 * Components here live one directory deeper as `<name>/index.tsx` and
 * import siblings with a `../<name>` relative specifier (e.g. Button's
 * `import { Slot } from '../slot'`), so the path + import-key shapes
 * differ from the flat `integrations/shared/components/<name>.tsx`
 * layout. `componentPath` / `siblingImportKey` below branch on the
 * fixture's `sourceRoot` to absorb that difference.
 */
export const UI_COMPONENTS_DIR = resolve(HERE, '../../../ui/components/ui')
/**
 * Third source root (#1467 Phase 2b follow-up / Phase 2c): composed demo
 * components under `site/ui/components/<name>.tsx`. These are the only
 * sources that compose multiple `site/ui` primitives with JSX children +
 * context propagation (`<RadioGroup><RadioGroupItem/></RadioGroup>`),
 * which the single-root `ui` fixture model can't express. Demo sources
 * import their primitives through the site-wide `@ui/components/ui/<name>`
 * alias rather than the `../<name>` relative shape ui siblings use, so
 * sibling inference resolves both shapes (see `uiSiblingBasename`).
 */
export const DEMO_COMPONENTS_DIR = resolve(HERE, '../../../site/ui/components')
export const SNAPSHOT_DIR = resolve(HERE, '__snapshots__')

/** Which source-root layout a fixture's component is loaded from. */
export type FixtureSourceRoot = 'shared' | 'ui' | 'demo'

export interface SharedFixtureSpec {
  /** Fixture id; also the `__snapshots__/<id>.{html,client.js}` basename. */
  id: string
  /**
   * Source-root layout (#1467 Phase 2a). `'shared'` (default) resolves
   * `integrations/shared/components/<sourceFile>.tsx`; `'ui'` resolves
   * `ui/components/ui/<sourceFile>/index.tsx` and auto-infers sibling
   * `../<name>` imports; `'demo'` resolves
   * `site/ui/components/<sourceFile>.tsx` and additionally infers the
   * `@ui/components/ui/<name>` alias imports demo sources compose
   * primitives with. `defineUiFixture` / `defineDemoFixture` set this
   * for you, so fixture files using those helpers never need to spell
   * it out.
   */
  sourceRoot?: FixtureSourceRoot
  /**
   * Component name as it appears in the hydration registry. Used as the
   * SSR render target and to derive the deterministic
   * `__instanceId` (`${componentName}_test`) the snapshot generator pins
   * so the hydration walker resolves the registered component.
   */
  componentName: string
  /**
   * Override for the basename inside
   * `integrations/shared/components/<sourceFile>.tsx` when it differs
   * from `componentName` — e.g. `PropsReactivityComparison` is the
   * second export inside `ReactiveProps.tsx`, so the spec sets
   * `sourceFile: 'ReactiveProps'`. Defaults to `componentName` when omitted.
   */
  sourceFile?: string
  /**
   * Sibling component basenames whose client JS must be loaded alongside
   * the main component for hydration to succeed — typically children
   * imported by the root. The CLI concatenates each compiled output and
   * dedupes the resulting `@barefootjs/client/runtime` import block.
   *
   * For `sourceRoot: 'ui'` fixtures these are **auto-inferred** from the
   * root's (and transitively each sibling's) `../<name>` relative
   * imports, so this field is only an escape hatch for deps the inferer
   * can't see. For `sourceRoot: 'shared'` fixtures the list is taken
   * verbatim (the flat layout has no reliable import shape to infer).
   */
  additionalComponents?: string[]
  /** Human-readable description for `JSXFixture.description`. */
  description: string
  /**
   * Props passed into the component at SSR render time AND embedded in the
   * frozen HTML via `bf-p`. The fixture-hydrate runner reads them back from
   * the DOM when re-mounting; the snapshot generator reads them from this
   * field when first producing the frozen HTML.
   */
  props?: Record<string, unknown>
  /** Scripted post-hydration interactions; see `JSXFixture.interactions`. */
  interactions?: ReadonlyArray<InteractionStep>
  /**
   * Bare specifier → absolute ESM-bundle path for any third-party module
   * the fixture's client JS resolves at runtime (#1467 Phase 3). Passed
   * straight through to `JSXFixture.externalImports`; the fixture-hydrate
   * host page serves the bundle and adds the importmap entry only for
   * fixtures that declare it. `carousel` is the first user (embla).
   */
  externalImports?: Record<string, string>
  /**
   * Inline CSS injected into the host page `<head>`, gated like
   * `externalImports`. Passed through to `JSXFixture.hostStyles`; reserved
   * for components (carousel/embla) whose hydrated behaviour needs *some*
   * layout to measure. See `JSXFixture.hostStyles`.
   */
  hostStyles?: string
}

export function sourceFileBasename(spec: SharedFixtureSpec): string {
  return spec.sourceFile ?? spec.componentName
}

export function fixtureSourceRoot(spec: SharedFixtureSpec): FixtureSourceRoot {
  return spec.sourceRoot ?? 'shared'
}

/** Absolute path to a component's `.tsx` for the given source root. */
export function componentPath(
  root: FixtureSourceRoot,
  basename: string,
): string {
  switch (root) {
    case 'ui':
      return resolve(UI_COMPONENTS_DIR, basename, 'index.tsx')
    case 'demo':
      return resolve(DEMO_COMPONENTS_DIR, `${basename}.tsx`)
    case 'shared':
      return resolve(SHARED_COMPONENTS_DIR, `${basename}.tsx`)
  }
}

/**
 * Source root a fixture's *siblings* are loaded from. Demo fixtures
 * compose `site/ui` primitives, so their sibling graph lives entirely
 * under the `ui` root; `shared` fixtures keep their flat layout.
 */
export function siblingSourceRoot(root: FixtureSourceRoot): FixtureSourceRoot {
  return root === 'shared' ? 'shared' : 'ui'
}

/** Absolute path to a fixture's root component source. */
export function componentSourcePath(spec: SharedFixtureSpec): string {
  return componentPath(fixtureSourceRoot(spec), sourceFileBasename(spec))
}

/**
 * The import specifier a fixture's *root* uses to reference a sibling,
 * used as the `components` map key so `renderHonoComponent`'s
 * import-strip filter recognises the line and inlines the child for SSR.
 * Shared: `./<name>.tsx` (matches `import Child from './Child'`). UI:
 * `../<name>` (matches `import { Slot } from '../slot'`). Demo:
 * `@ui/components/ui/<name>` (the site-wide alias).
 *
 * Only the `additionalComponents` escape hatch still needs this guess —
 * auto-inferred siblings carry the specifier they were actually
 * imported by (see `resolveSiblingSpecifiers`).
 */
export function siblingImportKey(root: FixtureSourceRoot, basename: string): string {
  switch (root) {
    case 'ui':
      return `../${basename}`
    case 'demo':
      return `${UI_ALIAS_PREFIX}${basename}`
    case 'shared':
      return `./${basename}.tsx`
  }
}

/**
 * Committed pre-compiled SSR module for a UI fixture's sibling (#1467
 * Phase 2a). The snapshot generator writes each sibling's export-intact
 * marked template here; `renderHonoComponent` re-anchors the parent's
 * `../<child>` import to this path and loads it as a real module, so SSR
 * never has to strip the child's exports. Co-located with the other
 * `<id>.*` snapshot artifacts.
 */
export function uiChildModulePath(id: string, basename: string): string {
  return resolve(SNAPSHOT_DIR, `${id}.${basename}.ssr.tsx`)
}

/**
 * Map of import specifier → committed pre-compiled module path for a
 * UI/demo fixture's siblings, or `undefined` when shared-rooted / no
 * siblings / the modules haven't been generated yet. Existence-tolerant
 * like the `expectedHtml` read: pre-snapshot the fixture simply has no
 * module map (and the runner skips it for lack of `expectedHtml` anyway).
 *
 * A sibling reachable through several specifiers (e.g. the demo root's
 * `@ui/components/ui/icon` alias AND another sibling's `../icon`
 * relative) registers its module under every one of them, so each
 * importer's line is re-anchored regardless of which shape it used.
 */
export function resolveSiblingModuleMap(
  spec: SharedFixtureSpec,
): Record<string, string> | undefined {
  if (fixtureSourceRoot(spec) === 'shared') return undefined
  const out: Record<string, string> = {}
  for (const [base, specifiers] of resolveSiblingSpecifiers(spec)) {
    const modPath = uiChildModulePath(spec.id, base)
    if (!existsSync(modPath)) continue
    for (const specifier of specifiers) out[specifier] = modPath
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Alias prefixes `site/ui` sources use to import `ui/components/ui/<name>` roots. */
const UI_ALIAS_PREFIX = '@ui/components/ui/'
/**
 * Second alias shape (#1467 Phase 2e): `@/*` maps to `site/ui/dist/*`,
 * whose `components/ui/<name>` entries are the built copies of the same
 * `ui/components/ui/<name>` sources — so for compile/SSR purposes the
 * specifier resolves to the identical sibling source as the `@ui` form.
 */
const SITE_DIST_ALIAS_PREFIX = '@/components/ui/'

/**
 * Value-import specifiers of a .tsx source, via a TS AST walk over the
 * top-level statements (the repo-wide idiom — regex import-matching
 * false-positives inside literals/comments and misses multi-line
 * clauses, which demo sources actually use). `import type` is erased at
 * runtime and carries no hydration dependency, so type-only clauses are
 * excluded.
 */
function valueImportSpecifiers(source: string): string[] {
  const sf = ts.createSourceFile(
    'module.tsx',
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ false,
    ts.ScriptKind.TSX,
  )
  const out: string[] = []
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    if (stmt.importClause?.isTypeOnly) continue
    if (ts.isStringLiteral(stmt.moduleSpecifier)) out.push(stmt.moduleSpecifier.text)
  }
  return out
}

/**
 * Resolve an import specifier to the `ui/components/ui/<name>` sibling it
 * targets, or `undefined` for non-sibling imports. Three shapes resolve:
 *
 *   - `../<name>` — the relative shape ui siblings use among themselves;
 *     only meaningful when the importer itself lives under the ui root
 *     (from a demo source `../<name>` would point at `site/ui/<name>`).
 *     Single path segment only — `../../../types` never matches.
 *   - `@ui/components/ui/<name>` — the site-wide alias demo sources use.
 *   - `@/components/ui/<name>` — the site-dist alias some demo sources
 *     use instead; same sibling source (see `SITE_DIST_ALIAS_PREFIX`).
 */
function uiSiblingBasename(
  specifier: string,
  importerIsUiComponent: boolean,
): string | undefined {
  for (const prefix of [UI_ALIAS_PREFIX, SITE_DIST_ALIAS_PREFIX]) {
    if (specifier.startsWith(prefix)) {
      const base = specifier.slice(prefix.length)
      return /^[a-zA-Z0-9_-]+$/.test(base) ? base : undefined
    }
  }
  if (!importerIsUiComponent) return undefined
  const m = /^\.\.\/([a-zA-Z0-9_-]+)$/.exec(specifier)
  return m ? m[1] : undefined
}

/**
 * Transitive sibling graph of a fixture: ui-component basename → every
 * import specifier the fixture's module graph references it by, both
 * sorted for deterministic ordering.
 *
 * For `ui`/`demo` fixtures the graph is auto-inferred breadth-first from
 * the root's value imports and each discovered sibling's own, unioned
 * with the explicit `additionalComponents` escape hatch (keyed by the
 * root-shaped `siblingImportKey`). For `shared` fixtures it is the
 * explicit list verbatim (the flat layout has no reliable import shape
 * to infer).
 */
export function resolveSiblingSpecifiers(
  spec: SharedFixtureSpec,
): Map<string, string[]> {
  const root = fixtureSourceRoot(spec)
  const found = new Map<string, Set<string>>()
  const queue: string[] = []
  const add = (base: string, specifier: string): void => {
    // A ui root importing itself can't happen via `../<name>`/alias, but
    // guard against an explicit-list entry naming the root.
    if (root === 'ui' && base === sourceFileBasename(spec)) return
    let specifiers = found.get(base)
    if (!specifiers) {
      specifiers = new Set()
      found.set(base, specifiers)
      queue.push(base)
    }
    specifiers.add(specifier)
  }

  for (const base of spec.additionalComponents ?? []) {
    if (root === 'shared') {
      found.set(base, new Set([siblingImportKey(root, base)]))
    } else {
      add(base, siblingImportKey(root, base))
    }
  }
  if (root !== 'shared') {
    const scan = (source: string, importerIsUiComponent: boolean): void => {
      for (const specifier of valueImportSpecifiers(source)) {
        const base = uiSiblingBasename(specifier, importerIsUiComponent)
        if (base) add(base, specifier)
      }
    }
    scan(readFileSync(componentSourcePath(spec), 'utf8'), root === 'ui')
    while (queue.length > 0) {
      scan(readFileSync(componentPath('ui', queue.pop()!), 'utf8'), true)
    }
  }

  return new Map(
    [...found]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([base, specifiers]) => [base, [...specifiers].sort()]),
  )
}

/**
 * Transitive closure of sibling components a fixture's root depends on,
 * sorted. See `resolveSiblingSpecifiers` for the inference rules.
 */
export function resolveSiblingBasenames(spec: SharedFixtureSpec): string[] {
  return [...resolveSiblingSpecifiers(spec).keys()]
}

/**
 * `components` map (import-key → source) for the renderer and fixture,
 * or `undefined` when the root has no siblings. Each sibling appears
 * exactly once — keyed by its first (sorted) specifier — because the CSR
 * harness compiles every map entry and a duplicate would register the
 * same component's client JS twice.
 */
export function resolveSiblingComponents(
  spec: SharedFixtureSpec,
): Record<string, string> | undefined {
  const root = fixtureSourceRoot(spec)
  const entries = resolveSiblingSpecifiers(spec)
  if (entries.size === 0) return undefined
  const out: Record<string, string> = {}
  for (const [base, specifiers] of entries) {
    out[specifiers[0]] = readFileSync(
      componentPath(siblingSourceRoot(root), base),
      'utf8',
    )
  }
  return out
}

/**
 * Deterministic root-scope id for shared-component fixtures. The
 * hydration walker keys component dispatch on `bf-s` matching
 * `<ComponentName>_<id>`; `normalizeHTML` further canonicalises any
 * `<ComponentName>_<rest>` to `<ComponentName>_*` for cross-adapter
 * comparison. Pinning the suffix to a literal `test` makes both
 * happen: hydration dispatches (because of the underscore), and the
 * conformance comparison normalises both sides to the same canonical
 * `Counter_*` token regardless of which adapter rendered.
 */
export function sharedFixtureInstanceId(spec: SharedFixtureSpec): string {
  return `${spec.componentName}_test`
}

function defineFixture(spec: SharedFixtureSpec): JSXFixture {
  const htmlPath = resolve(SNAPSHOT_DIR, `${spec.id}.html`)
  const clientJsPath = resolve(SNAPSHOT_DIR, `${spec.id}.client.js`)
  // Merge the deterministic `__instanceId` here so adapter-conformance
  // runs (which pass `fixture.props` verbatim to the live render) and
  // snapshot generation share the same root-scope id. The renderer
  // strips internal `__`-prefixed keys before serialising `bf-p`, so
  // this does not bloat the embedded props payload.
  const mergedProps = {
    ...spec.props,
    __instanceId: sharedFixtureInstanceId(spec),
  }
  // Sibling sources keyed by their parent's import specifier. Used by
  // the CSR harness (child client JS) and by the inline SSR path for
  // shared fixtures. For UI fixtures the Hono SSR render prefers
  // `componentModules` below (real pre-compiled modules), so `components`
  // there only feeds CSR.
  const components = resolveSiblingComponents(spec)
  // UI fixtures (#1467 Phase 2a): re-anchor the parent's `../<child>`
  // imports to committed, export-intact SSR modules so the Hono render
  // loads them as real modules instead of inlining + stripping exports.
  const componentModules = resolveSiblingModuleMap(spec)
  return createFixture({
    id: spec.id,
    description: spec.description,
    source: readFileSync(componentSourcePath(spec), 'utf8'),
    components,
    componentModules,
    // Explicit pin — `Object.keys(mod)` iterates alphabetically for
    // dynamically-imported modules in Bun, so multi-export sources
    // (e.g. `ReactiveProps.tsx`) would render the wrong sibling
    // without this. Single-export sources tolerate the absent field.
    componentName: spec.componentName,
    props: mergedProps,
    expectedHtml: existsSync(htmlPath)
      ? readFileSync(htmlPath, 'utf8')
      : undefined,
    expectedClientJs: existsSync(clientJsPath)
      ? readFileSync(clientJsPath, 'utf8')
      : undefined,
    interactions: spec.interactions,
    externalImports: spec.externalImports,
    hostStyles: spec.hostStyles,
  })
}

/** Define a fixture sourced from `integrations/shared/components/`. */
export function defineSharedFixture(spec: SharedFixtureSpec): JSXFixture {
  return defineFixture(spec)
}

/**
 * Define a fixture sourced from the `site/ui` component library
 * (`ui/components/ui/<name>/index.tsx`). Pins `sourceRoot: 'ui'` on the
 * spec — mutating the same object the fixture file exports as `spec` so
 * the snapshot generator (which reads `mod.spec`) regenerates from the
 * UI root too — then auto-infers sibling `../<name>` imports.
 */
export function defineUiFixture(spec: SharedFixtureSpec): JSXFixture {
  spec.sourceRoot = 'ui'
  return defineFixture(spec)
}

/**
 * Define a fixture sourced from the composed demo corpus
 * (`site/ui/components/<name>.tsx`) — #1467 Phase 2c. Pins
 * `sourceRoot: 'demo'` the same way `defineUiFixture` pins `'ui'` (the
 * snapshot generator reads the mutated `spec` export). Demo sources are
 * the corpus shape for components whose interactive surface only exists
 * composed (`<RadioGroup><RadioGroupItem/></RadioGroup>`, tabs, dialog…):
 * sibling primitives are auto-inferred from the root's
 * `@ui/components/ui/<name>` alias imports plus each sibling's own
 * transitive `../<name>` relative imports.
 */
export function defineDemoFixture(spec: SharedFixtureSpec): JSXFixture {
  spec.sourceRoot = 'demo'
  return defineFixture(spec)
}

/**
 * Discover every shared-component fixture file in this directory by
 * convention: any `*.ts` that is neither this `_helpers` module nor
 * `index.ts`, and whose module exports both `spec` and `fixture`. The
 * pair-export contract distinguishes shared-component fixtures from
 * the adapter-conformance corpus fixtures that only export `fixture`.
 *
 * Returning sorted-by-id keeps test ordering deterministic regardless
 * of filesystem iteration order.
 */
async function loadAllModules(): Promise<
  Array<{ spec: SharedFixtureSpec; fixture: JSXFixture }>
> {
  const here = dirname(fileURLToPath(import.meta.url))
  const entries: Array<{ spec: SharedFixtureSpec; fixture: JSXFixture }> = []
  for (const file of readdirSync(here)) {
    if (!file.endsWith('.ts')) continue
    if (file.startsWith('_')) continue
    if (file === 'index.ts') continue
    const moduleName = file.replace(/\.ts$/, '')
    const mod = await import(`./${moduleName}`)
    if (mod.spec && mod.fixture) {
      entries.push({ spec: mod.spec, fixture: mod.fixture })
    }
  }
  return entries.sort((a, b) => a.spec.id.localeCompare(b.spec.id))
}

export async function loadAllSharedFixtures(): Promise<JSXFixture[]> {
  return (await loadAllModules()).map(e => e.fixture)
}

export async function loadAllSharedSpecs(): Promise<SharedFixtureSpec[]> {
  return (await loadAllModules()).map(e => e.spec)
}
