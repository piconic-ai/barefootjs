/**
 * Freshness + shape guard for the golden helper vectors
 * (spec/template-helpers.md).
 *
 * vectors.json is generated from vectors/cases.ts and committed; the
 * Go, Perl, Python, and Ruby harnesses consume the committed file. This
 * test fails when the file drifts from the case definitions, so "edited
 * cases.ts but forgot to regenerate" (or hand-edited vectors.json)
 * can't land.
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { buildVectors, encodeExpect, encodeInput, serializeVectors, VECTORS_PATH } from '../../vectors/generate'
import { reference } from '../../vectors/cases'

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

  test('an input array hole encodes as $undef, like an expect hole', () => {
    // The hole is the case under test.
    const sparse = [, 1]
    const undef = { $undef: true }
    expect(encodeInput(sparse, 'probe')).toEqual([undef, 1])
    expect(encodeInput({ a: sparse }, 'probe')).toEqual({ a: [undef, 1] })
    expect(encodeExpect(sparse, 'probe')).toEqual([undef, 1])
  })
})
