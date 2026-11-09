/**
 * Freshness + shape guard for the `primitives/` vector corpus
 * (spec/js-primitive-semantics.md, "Conformance").
 *
 * The runtime harnesses (vectors/README.md, "Current runners") consume the
 * committed JSON and fail on any case their runtime does not pass; this
 * test fails when a file drifts from its case definitions and when a JSON
 * file has no case definition. It also holds the native-operator claims the
 * harnesses run (vectors/primitives-native-safe.json) to the adapters'
 * `NATIVE_SAFE` tables.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { primitiveOps } from '../../vectors/primitives/index'
import {
  PRIMITIVES_DIR,
  primitiveFilePath,
  serializePrimitiveFile,
} from '../../vectors/primitives/generate'
import { NATIVE_SAFE_PATH, RUNTIME_TABLES, serializeNativeSafeMirror } from '../../vectors/primitives/native-safe'

const RUNTIMES = ['go', 'java', 'perl', 'php', 'python', 'ruby', 'rust']

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

describe('primitives native-operator claims', () => {
  test('primitives-native-safe.json is up to date with the NATIVE_SAFE tables (run `bun run generate:primitive-vectors`)', () => {
    expect(readFileSync(NATIVE_SAFE_PATH, 'utf8')).toBe(serializeNativeSafeMirror())
  })

  test('names exactly the runtimes that run the corpus', () => {
    expect(Object.keys(RUNTIME_TABLES).sort()).toEqual(RUNTIMES)
  })
})
