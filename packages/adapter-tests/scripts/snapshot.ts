/**
 * Unified snapshot generator for shared-component fixtures.
 *
 * Imports each fixture's `spec` (no snapshot IO at import time —
 * `defineSharedFixture` tolerates missing snapshot files via existsSync),
 * runs SSR via `renderHonoComponent` with a deterministic
 * `${componentName}_test` instanceId, compiles client JS through
 * `compileJSX` (the same multi-component-merged-import path `bf build`
 * consumers use, avoiding the duplicate-`import` crash that raw
 * `generateClientJs` concatenation produces), and writes the frozen pair
 * to `fixtures/__snapshots__/`.
 *
 * Usage:
 *   bun run packages/adapter-tests/scripts/snapshot.ts             # all fixtures
 *   bun run packages/adapter-tests/scripts/snapshot.ts counter-shared toggle-shared
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { compileJSX } from '@barefootjs/jsx'
import {
  SHARED_COMPONENTS_DIR,
  SNAPSHOT_DIR,
  sourceFileBasename,
  type SharedFixtureSpec,
} from '../fixtures/_helpers'
import { spec as counterSharedSpec } from '../fixtures/counter-shared'
import { spec as toggleSharedSpec } from '../fixtures/toggle-shared'
import { spec as conditionalReturnButtonSpec } from '../fixtures/conditional-return-button'
import { spec as conditionalReturnLinkSpec } from '../fixtures/conditional-return-link'
import { spec as reactivePropsSpec } from '../fixtures/reactive-props'
import { spec as propsReactivityComparisonSpec } from '../fixtures/props-reactivity-comparison'
import { spec as formSpec } from '../fixtures/form'

const ALL_SPECS: SharedFixtureSpec[] = [
  counterSharedSpec,
  toggleSharedSpec,
  conditionalReturnButtonSpec,
  conditionalReturnLinkSpec,
  reactivePropsSpec,
  propsReactivityComparisonSpec,
  formSpec,
]

const requested = process.argv.slice(2)
const selected =
  requested.length === 0
    ? ALL_SPECS
    : ALL_SPECS.filter(s => requested.includes(s.id))

if (requested.length > 0 && selected.length !== requested.length) {
  const knownIds = ALL_SPECS.map(s => s.id).join(', ')
  const unknown = requested.filter(id => !ALL_SPECS.some(s => s.id === id))
  throw new Error(
    `Unknown fixture id(s): ${unknown.join(', ')}. Known: ${knownIds}`,
  )
}

for (const spec of selected) {
  await generateSnapshot(spec)
}

async function generateSnapshot(spec: SharedFixtureSpec): Promise<void> {
  const sourceBasename = sourceFileBasename(spec)
  const sourcePath = resolve(SHARED_COMPONENTS_DIR, `${sourceBasename}.tsx`)
  const source = await Bun.file(sourcePath).text()

  // Pin the root scope's `bf-s` via `__instanceId` so the hydration walker's
  // scopeName parser (`id.slice(0, id.indexOf('_'))`) resolves the registered
  // component. The conformance default `__instanceId: 'test'` yields an
  // underscore-less id the walker cannot dispatch from.
  const ssrProps = { ...spec.props, __instanceId: `${spec.componentName}_test` }
  const ssrHtml = await renderHonoComponent({
    source,
    adapter: new HonoAdapter(),
    props: ssrProps,
    // Pin the target export — `Object.keys(mod)` iterates alphabetically
    // for dynamically imported modules in Bun, so multi-component files
    // can otherwise render the wrong component.
    componentName: spec.componentName,
  })

  const compiled = compileJSX(
    source,
    `${sourceBasename}.tsx`,
    { adapter: new HonoAdapter() },
  )
  const clientJsFile = compiled.files.find(f => f.type === 'clientJs')
  if (!clientJsFile) {
    const errs = compiled.errors.map(e => `${e.severity}: ${e.message}`).join('\n')
    throw new Error(
      `No clientJs file in compileJSX output for ${spec.componentName}.tsx:\n${errs}`,
    )
  }

  const htmlOut = resolve(SNAPSHOT_DIR, `${spec.id}.html`)
  const clientJsOut = resolve(SNAPSHOT_DIR, `${spec.id}.client.js`)
  writeFileSync(htmlOut, ssrHtml.trim() + '\n')
  writeFileSync(clientJsOut, clientJsFile.content.trimEnd() + '\n')

  console.log(
    `[${spec.id}] wrote ${spec.id}.html (${ssrHtml.length}B) + ` +
      `${spec.id}.client.js (${clientJsFile.content.length}B)`,
  )
}
