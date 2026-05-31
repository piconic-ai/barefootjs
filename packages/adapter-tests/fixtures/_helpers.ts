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
export const SNAPSHOT_DIR = resolve(HERE, '__snapshots__')

/** Which source-root layout a fixture's component is loaded from. */
export type FixtureSourceRoot = 'shared' | 'ui'

export interface SharedFixtureSpec {
  /** Fixture id; also the `__snapshots__/<id>.{html,client.js}` basename. */
  id: string
  /**
   * Source-root layout (#1467 Phase 2a). `'shared'` (default) resolves
   * `integrations/shared/components/<sourceFile>.tsx`; `'ui'` resolves
   * `ui/components/ui/<sourceFile>/index.tsx` and auto-infers sibling
   * `../<name>` imports. `defineUiFixture` sets this for you, so fixture
   * files using that helper never need to spell it out.
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
  return root === 'ui'
    ? resolve(UI_COMPONENTS_DIR, basename, 'index.tsx')
    : resolve(SHARED_COMPONENTS_DIR, `${basename}.tsx`)
}

/** Absolute path to a fixture's root component source. */
export function componentSourcePath(spec: SharedFixtureSpec): string {
  return componentPath(fixtureSourceRoot(spec), sourceFileBasename(spec))
}

/**
 * The relative-import specifier a parent uses to reference a sibling,
 * used as the `components` map key so `renderHonoComponent`'s
 * import-strip filter recognises the line and inlines the child for SSR.
 * Shared: `./<name>.tsx` (matches `import Child from './Child'`). UI:
 * `../<name>` (matches `import { Slot } from '../slot'`).
 */
export function siblingImportKey(root: FixtureSourceRoot, basename: string): string {
  return root === 'ui' ? `../${basename}` : `./${basename}.tsx`
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
 * Map of import specifier → committed pre-compiled module path for a UI
 * fixture's siblings, or `undefined` when not a UI fixture / no siblings
 * / the modules haven't been generated yet. Existence-tolerant like the
 * `expectedHtml` read: pre-snapshot the fixture simply has no module map
 * (and the runner skips it for lack of `expectedHtml` anyway).
 */
export function resolveSiblingModuleMap(
  spec: SharedFixtureSpec,
): Record<string, string> | undefined {
  if (fixtureSourceRoot(spec) !== 'ui') return undefined
  const out: Record<string, string> = {}
  for (const base of resolveSiblingBasenames(spec)) {
    const modPath = uiChildModulePath(spec.id, base)
    if (existsSync(modPath)) out[siblingImportKey('ui', base)] = modPath
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// `import { X } from '../<name>'` — value imports of a single-segment
// sibling under the UI root. Excludes `import type` (erased, no runtime
// dep) and deeper paths like `../../../types` (the char class stops at
// the first `/`, so `../../../types` never matches).
const UI_SIBLING_IMPORT_RE =
  /^[ \t]*import\s+(?!type\b)[^;\n]*?\sfrom\s+['"]\.\.\/([a-zA-Z0-9_-]+)['"]/gm

function inferUiSiblingImports(source: string): string[] {
  return [...source.matchAll(UI_SIBLING_IMPORT_RE)].map(m => m[1])
}

/**
 * Transitive closure of sibling components a fixture's root depends on.
 * For `ui` fixtures this is auto-inferred from `../<name>` imports
 * (root + each discovered sibling, breadth-first), unioned with any
 * explicit `additionalComponents`. For `shared` fixtures it is the
 * explicit list verbatim. Sorted for deterministic ordering.
 */
export function resolveSiblingBasenames(spec: SharedFixtureSpec): string[] {
  const explicit = spec.additionalComponents ?? []
  if (fixtureSourceRoot(spec) !== 'ui') return [...explicit]

  const root = sourceFileBasename(spec)
  const seen = new Set<string>()
  const result: string[] = []
  const stack: string[] = [...explicit]
  stack.push(...inferUiSiblingImports(readFileSync(componentSourcePath(spec), 'utf8')))
  while (stack.length > 0) {
    const name = stack.pop()!
    if (name === root || seen.has(name)) continue
    seen.add(name)
    result.push(name)
    stack.push(...inferUiSiblingImports(readFileSync(componentPath('ui', name), 'utf8')))
  }
  return result.sort()
}

/**
 * `components` map (import-key → source) for the renderer and fixture,
 * or `undefined` when the root has no siblings.
 */
export function resolveSiblingComponents(
  spec: SharedFixtureSpec,
): Record<string, string> | undefined {
  const root = fixtureSourceRoot(spec)
  const basenames = resolveSiblingBasenames(spec)
  if (basenames.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const base of basenames) {
    out[siblingImportKey(root, base)] = readFileSync(componentPath(root, base), 'utf8')
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
