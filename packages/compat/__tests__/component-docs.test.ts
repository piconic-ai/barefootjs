// Guards the "every Matrix / Render-Conformance row is explained"
// property the docs page relies on: `computeComponentDocs` /
// `computeFixtureDocs` must produce a non-empty description and a
// well-formed GitHub source link for every row the committed
// `ui/compat.lock.json` renders. CI additionally regenerates the lock
// and `git diff`s it (`ci-compat.yml`); this in-test check is defense so
// `bun test` alone catches a component that lost its description (e.g.
// removed from `ui/registry.json` and missing a JSDoc tagline).

import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeComponentDocs, computeFixtureDocs } from '../src/component-docs'

interface FixtureDivergenceCell {
  kind: 'refusal' | 'render'
  escape?: { state: 'escapable' | 'debt' | 'not-owed'; twin?: string }
}

const LOCK_PATH = resolve(import.meta.dir, '../../../ui/compat.lock.json')
const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as {
  components: Record<string, unknown>
  componentDocs?: Record<string, { title: string; description: string; url: string; uiUrl?: string }>
  fixtureDivergences: {
    fixtures: Record<string, Record<string, FixtureDivergenceCell>>
    docs?: Record<string, { description: string; url: string }>
  }
}

const BLOB_PREFIX = 'https://github.com/piconic-ai/barefootjs/blob/main/'

describe('computeComponentDocs', () => {
  const names = Object.keys(lock.components)
  const docs = computeComponentDocs(names)

  test('covers every component in the matrix', () => {
    expect(Object.keys(docs).sort()).toEqual(names.sort())
  })

  test('every component has a non-empty description and a source link', () => {
    for (const name of names) {
      const doc = docs[name]
      expect(doc.description.length, `${name} has an empty description`).toBeGreaterThan(0)
      expect(doc.title.length).toBeGreaterThan(0)
      expect(doc.url).toBe(`${BLOB_PREFIX}ui/components/ui/${name}/index.tsx`)
    }
  })

  test('descriptions stay within the table-cell budget', () => {
    for (const name of names) {
      // 100-char budget + a 1-char ellipsis when trimmed.
      expect(docs[name].description.length).toBeLessThanOrEqual(101)
    }
  })

  test('uiUrl, when present, points at the public component page', () => {
    for (const name of names) {
      const { uiUrl } = docs[name]
      if (uiUrl !== undefined) {
        expect(uiUrl).toBe(`https://ui.barefootjs.dev/components/${name}`)
      }
    }
    // The catalogue is broadly published — most components have a page.
    const withPage = names.filter(n => docs[n].uiUrl !== undefined)
    expect(withPage.length).toBeGreaterThan(names.length / 2)
  })

  test('matches the committed lock (regen freshness)', () => {
    expect(docs).toEqual(lock.componentDocs ?? {})
  })
})

describe('computeFixtureDocs', () => {
  // (#2613) The lock's `fixtureDivergences.docs` covers the divergent
  // fixtures themselves PLUS every `'escapable'` cell's escape-twin id —
  // `cli.ts` widens the id set the same way before calling
  // `computeFixtureDocs`, so the docs page can link straight to the twin
  // that demonstrates the escape. Mirrored here rather than re-imported
  // from `cli.ts` (a script entry point, not a library export) so this
  // "regen freshness" check recomputes independently, same as the
  // `computeComponentDocs` describe block above.
  const escapeTwinIds = new Set<string>()
  for (const row of Object.values(lock.fixtureDivergences.fixtures)) {
    for (const cell of Object.values(row)) {
      if (cell.escape?.state === 'escapable' && cell.escape.twin) escapeTwinIds.add(cell.escape.twin)
    }
  }
  const ids = [...new Set([...Object.keys(lock.fixtureDivergences.fixtures), ...escapeTwinIds])]
  const docs = computeFixtureDocs(ids)

  test('every divergent fixture has a description and a source link', () => {
    for (const id of ids) {
      expect(docs[id].description.length, `${id} has an empty description`).toBeGreaterThan(0)
      expect(docs[id].url.startsWith(`${BLOB_PREFIX}packages/adapter-tests/fixtures/`)).toBe(true)
    }
  })

  test('matches the committed lock (regen freshness)', () => {
    expect(docs).toEqual(lock.fixtureDivergences.docs ?? {})
  })
})
