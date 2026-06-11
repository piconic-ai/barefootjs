/**
 * Freshness + shape guard for the golden helper vectors
 * (spec/template-helpers.md).
 *
 * vectors.json is generated from helper-vectors/cases.ts and committed;
 * the Go and Perl harnesses consume the committed file. This test fails
 * when the file drifts from the case definitions, so "edited cases.ts
 * but forgot to regenerate" (or hand-edited vectors.json) can't land.
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { buildVectors, serializeVectors, VECTORS_PATH } from '../../helper-vectors/generate'
import { reference } from '../../helper-vectors/cases'

describe('helper golden vectors', () => {
  test('vectors.json is up to date with cases.ts (run `bun run generate:helper-vectors`)', () => {
    expect(readFileSync(VECTORS_PATH, 'utf8')).toBe(serializeVectors())
  })

  test('every case has a JS reference implementation', () => {
    for (const c of buildVectors().cases) {
      expect(reference).toHaveProperty(c.fn)
    }
  })

  test('case keys (fn/note) are unique — harness declarations reference them', () => {
    const seen = new Set<string>()
    for (const c of buildVectors().cases) {
      const key = `${c.fn}/${c.note}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })
})
