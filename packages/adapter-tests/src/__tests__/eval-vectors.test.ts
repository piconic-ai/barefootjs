/**
 * Freshness + shape guard for the golden ParsedExpr-evaluator vectors
 * (issue #2018, Track A — spec/compiler.md "ParsedExpr Evaluator
 * Semantics").
 *
 * eval-vectors.json is generated from vectors/eval-cases.ts and
 * committed; the Go (runtime/eval_vectors_test.go), Perl
 * (t/eval_vectors.t), Python (tests/test_eval_vectors.py), and Ruby
 * (test/eval_vectors_test.rb) harnesses consume the committed file to
 * prove their evaluators are isomorphic with JS. This test fails when
 * the file drifts from the case definitions, so "edited eval-cases.ts
 * but forgot to regenerate" (or a hand-edited eval-vectors.json) can't
 * land.
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  buildEvalVectors,
  serializeEvalVectors,
  EVAL_VECTORS_PATH,
} from '../../vectors/eval-generate'
import { UNDEFINED_STEP_BY_RUNTIME, VECTOR_RUNTIMES } from '../../vectors/undefined-rollout'

const LEDGER_PATH = join(dirname(EVAL_VECTORS_PATH), 'eval-expected-failures.json')

describe('ParsedExpr evaluator golden vectors', () => {
  test('eval-vectors.json is up to date with eval-cases.ts (run `bun run generate:eval-vectors`)', () => {
    expect(readFileSync(EVAL_VECTORS_PATH, 'utf8')).toBe(serializeEvalVectors())
  })

  test('every case parses to a supported ParsedExpr (none fall to `unsupported`)', () => {
    for (const c of buildEvalVectors().cases) {
      expect(c.expr.kind).not.toBe('unsupported')
    }
  })

  test('case notes are unique — harness diagnostics reference them', () => {
    const seen = new Set<string>()
    for (const c of buildEvalVectors().cases) {
      expect(seen.has(c.note)).toBe(false)
      seen.add(c.note)
    }
  })
})

/**
 * The eval vectors' expected-failure ledger (spec/js-undefined-value.md, §6):
 * the same shrink-only rules as primitives-expected-failures.json, for the
 * life of the undefined rollout. Each runtime's harness fails on an unlisted
 * failure, on a listed case that now passes and on a listed note that names
 * no case; this test holds the file's shape: exactly the seven runtimes,
 * every key a real case note, every entry `{ "step": <the runtime's U step> }`.
 */
describe('eval expected-failure ledger', () => {
  const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as {
    version: number
    runtimes: Record<string, Record<string, unknown>>
  }
  const notes = new Set(buildEvalVectors().cases.map((c) => c.note))

  test('names exactly the runtimes that run the corpus', () => {
    expect(ledger.version).toBe(1)
    expect(Object.keys(ledger.runtimes).sort()).toEqual([...VECTOR_RUNTIMES])
  })

  test("every entry names a real case and its runtime's U step", () => {
    const problems: string[] = []
    for (const [runtime, entries] of Object.entries(ledger.runtimes)) {
      for (const [note, entry] of Object.entries(entries)) {
        if (!notes.has(note)) problems.push(`${runtime}: "${note}" names no case`)
        const owner = UNDEFINED_STEP_BY_RUNTIME[runtime]
        if (JSON.stringify(entry) !== JSON.stringify({ step: owner })) {
          problems.push(`${runtime}: "${note}" is ${JSON.stringify(entry)}, want {"step":"${owner}"}`)
        }
      }
    }
    expect(problems).toEqual([])
  })
})
