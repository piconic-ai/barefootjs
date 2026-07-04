/**
 * Central validation for the per-backend divergence declarations.
 *
 * Each backend adapter owns its declarations as a file named
 * `vector-divergences.json` living inside that adapter's own package
 * (e.g. `packages/adapter-perl/t/vector-divergences.json`,
 * `packages/adapter-go-template/runtime/testdata/vector-divergences.json`)
 * — not centralized under adapter-tests. This test discovers every such
 * file by walking `packages/` from the repo root and matching on that
 * exact basename, so a new adapter's declarations are picked up
 * automatically without editing this file.
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
 *   - the declaration file lives in the same package as its runner
 *   - backend values are unique and include the expected backend set
 */
import { describe, test, expect } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { buildVectors } from '../../vectors/generate'

const REPO_ROOT = join(import.meta.dir, '../../../..')
const PACKAGES_ROOT = join(REPO_ROOT, 'packages')

const DECLARATION_BASENAME = 'vector-divergences.json'

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

/**
 * Recursively finds every file named `vector-divergences.json` under
 * `dir`, skipping `node_modules`, `dist`, and hidden directories
 * (dotfiles). Returns absolute paths.
 */
function findDivergenceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      found.push(...findDivergenceFiles(full))
    } else if (entry === DECLARATION_BASENAME) {
      found.push(full)
    }
  }
  return found
}

/** The first path segment under `packages/`, e.g. `adapter-perl`. */
function packageNameOf(absPath: string): string {
  const rel = relative(PACKAGES_ROOT, absPath)
  return rel.split(sep)[0] ?? ''
}

const caseKeys = new Set(buildVectors().cases.map((c) => `${c.fn}/${c.note}`))
const helperFns = new Set(buildVectors().cases.map((c) => c.fn))

const files = findDivergenceFiles(PACKAGES_ROOT)

describe('per-backend divergence declarations', () => {
  test('discovered backend values are unique and include the expected set', () => {
    const backends = files.map((f) => {
      const raw = readFileSync(f, 'utf8')
      const decl = JSON.parse(raw) as { backend: unknown }
      return decl.backend
    })

    for (const backend of backends) {
      expect(typeof backend).toBe('string')
      expect((backend as string).length).toBeGreaterThan(0)
    }

    const uniqueBackends = new Set(backends)
    expect(uniqueBackends.size).toBe(backends.length)

    for (const expectedBackend of EXPECTED_BACKENDS) {
      expect(uniqueBackends.has(expectedBackend)).toBe(true)
    }
  })

  for (const file of files) {
    const relPath = relative(REPO_ROOT, file)

    describe(relPath, () => {
      const raw = readFileSync(file, 'utf8')
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

      test('runner is a non-empty string pointing at an existing file', () => {
        expect(typeof decl.runner).toBe('string')
        expect((decl.runner as string).length).toBeGreaterThan(0)
        const resolved = join(REPO_ROOT, decl.runner as string)
        expect(existsSync(resolved)).toBe(true)
      })

      test('declaration file lives in the same package as its declared runner', () => {
        const runnerAbs = join(REPO_ROOT, decl.runner as string)
        expect(packageNameOf(file)).toBe(packageNameOf(runnerAbs))
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
