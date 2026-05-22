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
export const SNAPSHOT_DIR = resolve(HERE, '__snapshots__')

export interface SharedFixtureSpec {
  /** Fixture id; also the `__snapshots__/<id>.{html,client.js}` basename. */
  id: string
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
   * Additional component file basenames (without `.tsx`) under
   * `integrations/shared/components/` whose client JS must be loaded
   * alongside the main component for hydration to succeed — typically
   * children imported with `import Child from './Child'`. The CLI
   * concatenates each compiled output and dedupes the resulting
   * `@barefootjs/client/runtime` import block.
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

export function defineSharedFixture(spec: SharedFixtureSpec): JSXFixture {
  const sourcePath = resolve(
    SHARED_COMPONENTS_DIR,
    `${sourceFileBasename(spec)}.tsx`,
  )
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
  // Bundle sibling component sources into `fixture.components` keyed
  // with the leading `./` so the conformance runner's import-strip
  // filter recognises the parent's `import Child from './Child'` line
  // and inlines the child function for SSR. Without this, the temp
  // file the runner writes can't resolve relative imports outside
  // its dir.
  const components: Record<string, string> | undefined = (() => {
    if (!spec.additionalComponents?.length) return undefined
    const out: Record<string, string> = {}
    for (const extra of spec.additionalComponents) {
      const extraPath = resolve(SHARED_COMPONENTS_DIR, `${extra}.tsx`)
      out[`./${extra}.tsx`] = readFileSync(extraPath, 'utf8')
    }
    return out
  })()
  return createFixture({
    id: spec.id,
    description: spec.description,
    source: readFileSync(sourcePath, 'utf8'),
    components,
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
