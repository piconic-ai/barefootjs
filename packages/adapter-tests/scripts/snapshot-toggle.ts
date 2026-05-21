/**
 * One-off snapshot generator for the toggle-shared fixture.
 *
 * Multi-scope variant of `snapshot-counter.ts` — `Toggle.tsx` declares
 * both `Toggle` (parent) and `ToggleItem` (child, repeated in a `.map()`),
 * so the client JS file emitted by `compileJSX` is the merged bundle
 * `compileMultipleComponents` produces (one consolidated import block,
 * dedup'd across siblings). Calling `generateClientJs` per component and
 * concatenating raw would emit duplicate `import` lines and crash with
 * `Identifier '$' has already been declared` in the browser.
 *
 * Usage: `bun run packages/adapter-tests/scripts/snapshot-toggle.ts`
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { compileJSX } from '@barefootjs/jsx'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../..')
const SOURCE_PATH = resolve(REPO_ROOT, 'integrations/shared/components/Toggle.tsx')
const SNAPSHOT_DIR = resolve(HERE, '../fixtures/__snapshots__')

const source = readFileSync(SOURCE_PATH, 'utf8')

// `__instanceId` pins the parent ScopeID so the hydration walker resolves
// `Toggle` at the root. Child ToggleItems continue to roll random IDs
// during SSR; the client JS reads them back from the DOM via
// `__scope.getAttribute('bf-s')`, so internal consistency within the
// snapshot is the only invariant — global determinism is not required.
const ssrHtml = await renderHonoComponent({
  source,
  adapter: new HonoAdapter(),
  props: {
    __instanceId: 'Toggle_test',
    toggleItems: [
      { label: 'Setting 1', defaultOn: true },
      { label: 'Setting 2', defaultOn: false },
      { label: 'Setting 3' },
    ],
  },
})

// `compileJSX` returns the same merged-import bundle `bf build` writes
// to `<file>.client.js`. Using the lower-level `generateClientJs` per
// component would duplicate imports across the join — see file header.
const compiled = compileJSX(source, 'Toggle.tsx', { adapter: new HonoAdapter() })
const clientJsFile = compiled.files.find(f => f.type === 'clientJs')
if (!clientJsFile) {
  const errs = compiled.errors.map(e => `${e.severity}: ${e.message}`).join('\n')
  throw new Error(`No clientJs file in compileJSX output for Toggle.tsx:\n${errs}`)
}

writeFileSync(resolve(SNAPSHOT_DIR, 'toggle-shared.html'), ssrHtml.trim() + '\n')
writeFileSync(resolve(SNAPSHOT_DIR, 'toggle-shared.client.js'), clientJsFile.content.trimEnd() + '\n')

console.log(`Wrote ${SNAPSHOT_DIR}/toggle-shared.html (${ssrHtml.length} bytes)`)
console.log(`Wrote ${SNAPSHOT_DIR}/toggle-shared.client.js (${clientJsFile.content.length} bytes)`)
