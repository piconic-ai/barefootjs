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

import { existsSync, readFileSync } from 'node:fs'
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

export function defineSharedFixture(spec: SharedFixtureSpec): JSXFixture {
  const sourcePath = resolve(
    SHARED_COMPONENTS_DIR,
    `${sourceFileBasename(spec)}.tsx`,
  )
  const htmlPath = resolve(SNAPSHOT_DIR, `${spec.id}.html`)
  const clientJsPath = resolve(SNAPSHOT_DIR, `${spec.id}.client.js`)
  return createFixture({
    id: spec.id,
    description: spec.description,
    source: readFileSync(sourcePath, 'utf8'),
    props: spec.props,
    expectedHtml: existsSync(htmlPath)
      ? readFileSync(htmlPath, 'utf8')
      : undefined,
    expectedClientJs: existsSync(clientJsPath)
      ? readFileSync(clientJsPath, 'utf8')
      : undefined,
    interactions: spec.interactions,
  })
}
