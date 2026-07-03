/**
 * Central validation for the per-backend divergence declarations
 * (packages/adapter-tests/vectors/divergences/*.json).
 *
 * Each backend's conformance harness declares the golden-vector cases
 * where it deliberately diverges from the JS reference (or can't
 * support a helper at all). This test enforces the declaration schema
 * centrally, independent of any per-language harness, so a malformed
 * or stale declaration fails fast in `bun test` rather than only
 * inside a Go/Perl/Python/Ruby CI job:
 *
 *   - every declared key names a real `fn/note` case in vectors.json
 *   - every entry has a reason and exactly one of expect/throws
 *   - every `unsupported` key names a real helper (`fn`) in vectors.json
 *   - the runner path a declaration points at actually exists
 *   - the four expected backends are exactly the set of files present
 */
import { describe, test, expect } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildVectors } from '../../vectors/generate'

const DIVERGENCES_DIR = join(import.meta.dir, '../../vectors/divergences')
const REPO_ROOT = join(import.meta.dir, '../../../..')

const EXPECTED_BACKENDS = ['go', 'perl', 'python', 'ruby']

const NUM_SENTINELS = new Set(['NaN', 'Infinity', '-Infinity'])

function isNumSentinel(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 1 &&
    typeof (value as { $num?: unknown }).$num === 'string' &&
    NUM_SENTINELS.has((value as { $num: string }).$num)
  )
}

const caseKeys = new Set(buildVectors().cases.map((c) => `${c.fn}/${c.note}`))
const helperFns = new Set(buildVectors().cases.map((c) => c.fn))

const files = readdirSync(DIVERGENCES_DIR).filter((f) => f.endsWith('.json'))

describe('per-backend divergence declarations', () => {
  test('the four expected backends are exactly the set of files present', () => {
    const stems = files.map((f) => f.replace(/\.json$/, '')).sort()
    expect(stems).toEqual([...EXPECTED_BACKENDS].sort())
  })

  for (const file of files) {
    const stem = file.replace(/\.json$/, '')

    describe(stem, () => {
      const raw = readFileSync(join(DIVERGENCES_DIR, file), 'utf8')
      const decl = JSON.parse(raw) as {
        version: unknown
        backend: unknown
        runner: unknown
        spec: unknown
        divergences: Record<string, unknown>
        unsupported: Record<string, unknown>
      }

      test('version is 1', () => {
        expect(decl.version).toBe(1)
      })

      test('backend matches the filename stem', () => {
        expect(decl.backend).toBe(stem)
      })

      test('runner is a non-empty string pointing at an existing file', () => {
        expect(typeof decl.runner).toBe('string')
        expect((decl.runner as string).length).toBeGreaterThan(0)
        const resolved = join(REPO_ROOT, decl.runner as string)
        expect(existsSync(resolved)).toBe(true)
      })

      test('every divergence key matches a real fn/note case in vectors.json', () => {
        for (const key of Object.keys(decl.divergences ?? {})) {
          expect(caseKeys.has(key)).toBe(true)
        }
      })

      test('every divergence entry has a valid reason and exactly one of expect/throws', () => {
        for (const [key, entry] of Object.entries(decl.divergences ?? {})) {
          const e = entry as Record<string, unknown>
          expect(typeof e.reason).toBe('string')
          expect((e.reason as string).length).toBeGreaterThan(0)

          const hasExpect = Object.prototype.hasOwnProperty.call(e, 'expect')
          const hasThrows = Object.prototype.hasOwnProperty.call(e, 'throws')
          expect(hasExpect !== hasThrows).toBe(true)

          if (hasThrows) {
            expect(e.throws).toBe(true)
          }

          if (hasExpect) {
            // $num sentinels are only meaningful for non-finite numbers.
            const walk = (value: unknown): void => {
              if (value !== null && typeof value === 'object' && '$num' in (value as object)) {
                expect(isNumSentinel(value)).toBe(true)
                return
              }
              if (Array.isArray(value)) {
                value.forEach(walk)
              } else if (value !== null && typeof value === 'object') {
                Object.values(value as object).forEach(walk)
              }
            }
            walk(e.expect)
          }

          if ('exception' in e) {
            expect(hasThrows).toBe(true)
            expect(typeof e.exception).toBe('string')
          }

          const allowedKeys = new Set(['expect', 'throws', 'exception', 'reason'])
          for (const k of Object.keys(e)) {
            expect(allowedKeys.has(k)).toBe(true)
          }

          void key
        }
      })

      test('unsupported maps helper ids to non-empty reasons that match a real fn', () => {
        for (const [fn, reason] of Object.entries(decl.unsupported ?? {})) {
          expect(typeof reason).toBe('string')
          expect((reason as string).length).toBeGreaterThan(0)
          expect(helperFns.has(fn)).toBe(true)
        }
      })
    })
  }
})
