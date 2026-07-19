/**
 * Build-cache invalidation for reactive-factory helper files (#2325).
 *
 * `collectRelativeImportDeps` records every relative import a component
 * source references so an edit to an imported helper invalidates the
 * importer's cache entry, not just edits to the component file itself. That
 * scanner's extension probe list historically stopped at `.tsx`/`.ts` —
 * missing `.jsx`/`.js` — while the analyzer's own `resolveRelativeImportToFile`
 * (used to resolve cross-file reactive factories, #2325) already covers all
 * four. This file pins the end-to-end consequence: a factory helper authored
 * as plain `.ts` must be tracked as a dependency, so editing it triggers a
 * real recompile of the importing component (not a stale cache hit) on the
 * next build, while an untouched sibling component is still served from cache.
 *
 * Harness modeled on `build-manifest-components.test.ts` (`makeTmpDir`,
 * `linkClientRuntime`, try/finally cleanup).
 */

import { describe, test, expect } from 'bun:test'
import { build } from '../lib/build'
import { loadCache } from '../lib/build-cache'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { mkdirSync, writeFileSync, rmSync, readFileSync, realpathSync, symlinkSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'

function makeTmpDir(label: string) {
  const dir = resolve(tmpdir(), `bf-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return realpathSync(dir)
}

/**
 * Link the workspace `@barefootjs/client` into the throwaway project so the
 * build can copy `barefoot.js` — without it the compiled client bundles'
 * `../../barefoot.js` imports don't resolve on disk and the rebuild pass
 * raises BF053, which is noise unrelated to what this file pins.
 */
function linkClientRuntime(projectDir: string) {
  const scope = resolve(projectDir, 'node_modules/@barefootjs')
  mkdirSync(scope, { recursive: true })
  symlinkSync(resolve(import.meta.dir, '../../../client'), resolve(scope, 'client'))
}

// The factory helper, deliberately `.ts` — not `.tsx` — so `discoverComponentFiles`
// (which only picks up `.tsx`) never treats it as its own component entry,
// while the relative-import resolution (both the analyzer's cross-file
// factory resolution and this file's `collectRelativeImportDeps` dep
// scanner) still finds it.
function hooksSource(initial: number): string {
  return `import { createSignal } from '@barefootjs/client'

export function createCounter() {
  const [count, setCount] = createSignal(${initial})
  return { count, setCount }
}
`
}

const COUNTER_SOURCE = `'use client'
import { createCounter } from './hooks'

export function Counter() {
  const { count, setCount } = createCounter()
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`

// Untouched sibling — the cache-hit control.
const SIBLING_SOURCE = `'use client'
import { createSignal } from '@barefootjs/client'

export function Sibling() {
  const [value, setValue] = createSignal('sibling')
  return <p onClick={() => setValue('clicked')}>{value()}</p>
}
`

async function runBuild(projectDir: string, outDir: string) {
  return build({
    projectDir,
    adapter: new TestAdapter(),
    componentDirs: [resolve(projectDir, 'components')],
    outDir,
    minify: false,
    contentHash: false,
    clientOnly: true,
  })
}

describe('build-cache invalidation for reactive-factory helper files (#2325)', () => {
  test('editing a .ts factory helper invalidates only the importing component', async () => {
    const projectDir = makeTmpDir('factory-invalidation-src')
    const outDir = makeTmpDir('factory-invalidation-out')
    try {
      const componentsDir = resolve(projectDir, 'components')
      mkdirSync(componentsDir, { recursive: true })
      writeFileSync(resolve(componentsDir, 'hooks.ts'), hooksSource(0))
      writeFileSync(resolve(componentsDir, 'Counter.tsx'), COUNTER_SOURCE)
      writeFileSync(resolve(componentsDir, 'Sibling.tsx'), SIBLING_SOURCE)
      linkClientRuntime(projectDir)

      const first = await runBuild(projectDir, outDir)
      expect(first.errorCount).toBe(0)
      expect(first.compiledCount).toBe(2)

      const counterClientJsPath = resolve(outDir, 'components/Counter.client.js')
      const firstCounterJs = readFileSync(counterClientJsPath, 'utf8')
      expect(firstCounterJs).toContain('createSignal(0)')

      // The build-cache entry for Counter must record the helper file as a
      // dependency — this is the #2325 fix under test (EXT_CANDIDATES now
      // covers `.ts` via the same list the analyzer itself probes).
      const cacheAfterFirst = await loadCache(outDir)
      expect(cacheAfterFirst).not.toBeNull()
      const counterEntry = cacheAfterFirst!.entries[resolve(componentsDir, 'Counter.tsx')]
      expect(counterEntry).toBeDefined()
      expect(Object.keys(counterEntry.deps)).toContain(resolve(componentsDir, 'hooks.ts'))

      // Edit the helper only — neither component file changes.
      writeFileSync(resolve(componentsDir, 'hooks.ts'), hooksSource(42))

      const second = await runBuild(projectDir, outDir)
      expect(second.errorCount).toBe(0)
      // Counter recompiles (its dep changed); Sibling is untouched and
      // served from cache.
      expect(second.compiledCount).toBe(1)
      expect(second.cachedCount).toBe(1)

      const secondCounterJs = readFileSync(counterClientJsPath, 'utf8')
      expect(secondCounterJs).toContain('createSignal(42)')
      expect(secondCounterJs).not.toContain('createSignal(0)')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
