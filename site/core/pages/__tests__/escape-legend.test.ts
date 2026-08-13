/**
 * The compat matrix's escape surfacing (#2614) has two seams that are
 * correct only by agreement with something OUTSIDE this page, and both are
 * silent when they break — which is why they are pinned here rather than
 * left to review:
 *
 *  1. `ESCAPE_LABELS` mirrors the compiler's `EscapeKind` union. The page
 *     re-declares it because `@barefootjs/jsx` is not a runtime dependency
 *     of the site Worker (every other compat type here is mirrored the
 *     same way). A kind added to the compiler and not here would be
 *     DROPPED from the legend by `formatEscapes` — the reader would simply
 *     never learn that escape exists.
 *
 *  2. Every diagnostic code the page links carries an anchor in
 *     `docs/core/advanced/error-codes.md`. `errorCodeDocLink` computes
 *     `#bf101` from the code alone; if the doc has no matching anchor the
 *     link still renders and still navigates — to the top of the page,
 *     silently landing the reader on the wrong section.
 */

import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ESCAPE_SSR_COST } from '@barefootjs/jsx'
import { ESCAPE_LABELS, errorCodeDocLink } from '../compat-matrix'

const ERROR_CODES_DOC = readFileSync(
  resolve(import.meta.dir, '../../../../docs/core/advanced/error-codes.md'),
  'utf-8',
)

const compatLock = JSON.parse(
  readFileSync(resolve(import.meta.dir, '../../../../ui/compat.lock.json'), 'utf-8'),
) as {
  components: Record<string, Record<string, { diagnostics?: { code: string }[] }>>
  fixtureDivergences?: { fixtures: Record<string, Record<string, { codes?: string[] }>> }
}

/** Every diagnostic code the page can render a link for, from both of its sections. */
function codesReachableFromTheLock(): string[] {
  const codes = new Set<string>()
  for (const adapterMap of Object.values(compatLock.components)) {
    for (const cell of Object.values(adapterMap)) {
      for (const d of cell.diagnostics ?? []) codes.add(d.code)
    }
  }
  for (const row of Object.values(compatLock.fixtureDivergences?.fixtures ?? {})) {
    for (const cell of Object.values(row)) {
      for (const code of cell.codes ?? []) codes.add(code)
    }
  }
  return [...codes].sort()
}

describe('compat matrix — escape legend', () => {
  test('ESCAPE_LABELS covers exactly the compiler\'s EscapeKind union', () => {
    expect(Object.keys(ESCAPE_LABELS).sort()).toEqual(Object.keys(ESCAPE_SSR_COST).sort())
  })

  test('every label states its SSR cost, so the trade is never dropped on the way to a reader', () => {
    for (const [kind, label] of Object.entries(ESCAPE_LABELS)) {
      const cost = ESCAPE_SSR_COST[kind as keyof typeof ESCAPE_SSR_COST]
      // `'none'` reads as "full SSR" and `'client-render'` as "no SSR
      // content until hydration" — assert the DISTINCTION survives into
      // the wording rather than pinning the exact sentence, which is
      // ordinary editable prose.
      if (cost === 'client-render') {
        expect(label).toContain('client-render')
      } else {
        expect(label).toContain('full SSR')
      }
    }
  })
})

describe('compat matrix — error-code doc anchors', () => {
  const codes = codesReachableFromTheLock()

  test('the lock exposes at least one diagnostic code (otherwise this suite proves nothing)', () => {
    expect(codes.length).toBeGreaterThan(0)
  })

  for (const code of codes) {
    test(`${code} has an anchor in error-codes.md`, () => {
      const anchor = errorCodeDocLink(code).split('#')[1]
      expect(ERROR_CODES_DOC).toContain(`<a id="${anchor}"></a>`)
    })
  }
})
