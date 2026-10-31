/**
 * Freshness + shape guard for the `primitives/` vector corpus
 * (spec/js-primitive-semantics.md, "Conformance") and its step-0
 * expected-failure ledger (vectors/primitives-expected-failures.json).
 *
 * The runtime harnesses (vectors/README.md, "Current runners") consume the
 * committed JSON; this test fails when a file drifts from its case
 * definitions, when a JSON file has no case definition, and when a ledger
 * entry names no case, an unknown runtime, or a step other than the one
 * that owns its operation.
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

const LEDGER_PATH = join(dirname(PRIMITIVES_DIR), 'primitives-expected-failures.json')
const RUNTIMES = ['go', 'java', 'perl', 'php', 'python', 'ruby', 'rust']

interface Ledger {
  version: number
  runtimes: Record<string, Record<string, { step: number }>>
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
  })

  test('every entry names a real case and the step that owns its operation', () => {
    const problems: string[] = []
    for (const [runtime, entries] of Object.entries(ledger.runtimes)) {
      for (const [key, entry] of Object.entries(entries)) {
        const step = stepByKey.get(key)
        if (step === undefined) problems.push(`${runtime}: "${key}" names no case`)
        else if (entry.step !== step) problems.push(`${runtime}: "${key}" names step ${entry.step}, its op is step ${step}`)
      }
    }
    expect(problems).toEqual([])
  })
})
