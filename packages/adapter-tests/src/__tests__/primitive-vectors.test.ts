/**
 * Freshness + shape guard for the `primitives/` vector corpus
 * (spec/js-primitive-semantics.md, "Conformance") and its step-0
 * expected-failure ledger (vectors/primitives-expected-failures.json).
 *
 * The runtime harnesses (vectors/README.md, "Current runners") consume the
 * committed JSON; this test fails when a file drifts from its case
 * definitions, when a JSON file has no case definition, and when a ledger
 * entry names no case, an unknown runtime, or a step other than the one
 * that owns it: a #3824 step number must be its operation's step, and a
 * U-step id (`"U2"`, spec/js-undefined-value.md §6) must be its runtime's. It also holds the native-operator claims the
 * harnesses run (vectors/primitives-native-safe.json) to the adapters'
 * `NATIVE_SAFE` tables.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { primitiveOps } from '../../vectors/primitives/index'
import {
  buildPrimitiveFile,
  PRIMITIVES_DIR,
  primitiveFilePath,
  serializePrimitiveFile,
} from '../../vectors/primitives/generate'
import { NATIVE_SAFE_PATH, RUNTIME_TABLES, serializeNativeSafeMirror } from '../../vectors/primitives/native-safe'
import { UNDEFINED_STEP_BY_RUNTIME, VECTOR_RUNTIMES } from '../../vectors/undefined-rollout'

const LEDGER_PATH = join(dirname(PRIMITIVES_DIR), 'primitives-expected-failures.json')
const RUNTIMES = ['go', 'java', 'perl', 'php', 'python', 'ruby', 'rust']

interface Ledger {
  version: number
  runtimes: Record<string, Record<string, { step: number | string }>>
}

/**
 * Why a ledger entry's `step` is wrong, or null. A number is a #3824 step and
 * must be the step of the case's operation; a string is a U step of the
 * undefined rollout and must be the runtime's.
 */
function stepProblem(runtime: string, step: unknown, opStep: number): string | null {
  if (typeof step === 'number') return step === opStep ? null : `names step ${step}, its op is step ${opStep}`
  if (typeof step === 'string') {
    const owner = UNDEFINED_STEP_BY_RUNTIME[runtime]
    return step === owner ? null : `names step "${step}", the ${runtime} runtime's U step is "${owner}"`
  }
  return `names step ${JSON.stringify(step)}, which is neither a step number nor a U-step id`
}

describe('primitives/ golden vectors', () => {
  test.each(primitiveOps.map((op) => [op.fn, op] as const))(
    'primitives/%s.json is up to date (run `bun run generate:primitive-vectors`)',
    (_fn, op) => {
      expect(readFileSync(primitiveFilePath(op.fn), 'utf8')).toBe(serializePrimitiveFile(op))
    },
  )

  test('every primitives/*.json file has a case definition in index.ts', () => {
    const onDisk = readdirSync(PRIMITIVES_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
    expect(onDisk).toEqual(primitiveOps.map((op) => `${op.fn}.json`).sort())
  })
})

describe('primitives expected-failure ledger', () => {
  const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger
  const stepByKey = new Map<string, number>()
  for (const op of primitiveOps) {
    for (const c of buildPrimitiveFile(op).cases) stepByKey.set(`${c.fn}/${c.note}`, op.step)
  }

  test('names exactly the runtimes that run the corpus', () => {
    expect(Object.keys(ledger.runtimes).sort()).toEqual(RUNTIMES)
    expect(VECTOR_RUNTIMES).toEqual(RUNTIMES)
  })

  test('every entry names a real case and the step that owns it', () => {
    const problems: string[] = []
    for (const [runtime, entries] of Object.entries(ledger.runtimes)) {
      for (const [key, entry] of Object.entries(entries)) {
        const step = stepByKey.get(key)
        if (step === undefined) {
          problems.push(`${runtime}: "${key}" names no case`)
          continue
        }
        const problem = stepProblem(runtime, entry.step, step)
        if (problem) problems.push(`${runtime}: "${key}" ${problem}`)
      }
    }
    expect(problems).toEqual([])
  })

  test('a U-step id is accepted only for its own runtime', () => {
    expect(stepProblem('python', 'U2', 4)).toBeNull()
    expect(stepProblem('python', 'U8', 4)).not.toBeNull()
    expect(stepProblem('go', 4, 4)).toBeNull()
    expect(stepProblem('go', 3, 4)).not.toBeNull()
    expect(stepProblem('go', null, 4)).not.toBeNull()
  })
})

describe('primitives native-operator claims', () => {
  test('primitives-native-safe.json is up to date with the NATIVE_SAFE tables (run `bun run generate:primitive-vectors`)', () => {
    expect(readFileSync(NATIVE_SAFE_PATH, 'utf8')).toBe(serializeNativeSafeMirror())
  })

  test('names exactly the runtimes that run the corpus', () => {
    expect(Object.keys(RUNTIME_TABLES).sort()).toEqual(RUNTIMES)
  })
})
