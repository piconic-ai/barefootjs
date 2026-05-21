/**
 * Toggle fixture lifted from `integrations/shared/components/Toggle.tsx`.
 *
 * Multi-scope variant of `counter-shared`: `Toggle` (parent) +
 * `ToggleItem` (child, repeated three times via `toggleItems.map(...)`)
 * yields four distinct scopes the runtime must hydrate independently.
 *
 * Random child ScopeIDs in the frozen HTML are intentional — the client
 * JS reads scope IDs from `bf-s` via `__scope.getAttribute(...)`, so the
 * only invariant the snapshot needs to satisfy is internal consistency.
 * Re-running `scripts/snapshot-toggle.ts` after a compiler change will
 * pick new random IDs; that's fine.
 *
 * Interactions exercise signal isolation between sibling ToggleItem
 * instances — toggling one must not flip another. The shared Playwright
 * spec at `integrations/shared/e2e/toggle.spec.ts` carries the same
 * assertions in a richer form (CSS state, ScopeID format checks).
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFixture } from '../src/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT_DIR = resolve(HERE, '__snapshots__')
const SOURCE_PATH = resolve(
  HERE,
  '../../../integrations/shared/components/Toggle.tsx',
)

// Direct-child CSS selectors against `.settings-panel`'s element children
// (comment loop markers are ignored by nth-child): h3 is :nth-child(1),
// the three ToggleItems are :nth-child(2..4).
const item = (n: 1 | 2 | 3) =>
  `.toggle-item:nth-child(${n + 1}) button` as const

export const fixture = createFixture({
  id: 'toggle-shared',
  description:
    'Toggle parent + ToggleItem children (loop with key, multi-scope hydration)',
  source: readFileSync(SOURCE_PATH, 'utf8'),
  props: {
    toggleItems: [
      { label: 'Setting 1', defaultOn: true },
      { label: 'Setting 2', defaultOn: false },
      { label: 'Setting 3' },
    ],
  },
  expectedHtml: readFileSync(
    resolve(SNAPSHOT_DIR, 'toggle-shared.html'),
    'utf8',
  ),
  expectedClientJs: readFileSync(
    resolve(SNAPSHOT_DIR, 'toggle-shared.client.js'),
    'utf8',
  ),
  interactions: [
    // Initial state from defaultOn props.
    { type: 'expectText', selector: item(1), text: 'ON' },
    { type: 'expectText', selector: item(2), text: 'OFF' },
    { type: 'expectText', selector: item(3), text: 'OFF' },
    // Flip Setting 1.
    { type: 'click', selector: item(1) },
    { type: 'expectText', selector: item(1), text: 'OFF' },
    // Setting 2 unaffected (signal isolation between sibling scopes).
    { type: 'expectText', selector: item(2), text: 'OFF' },
    // Flip Setting 2 — Setting 3 must still be OFF.
    { type: 'click', selector: item(2) },
    { type: 'expectText', selector: item(2), text: 'ON' },
    { type: 'expectText', selector: item(3), text: 'OFF' },
    // Flip Setting 3, then re-verify the others survived the previous clicks.
    { type: 'click', selector: item(3) },
    { type: 'expectText', selector: item(3), text: 'ON' },
    { type: 'expectText', selector: item(1), text: 'OFF' },
    { type: 'expectText', selector: item(2), text: 'ON' },
  ],
})
