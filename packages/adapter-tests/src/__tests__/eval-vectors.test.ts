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
import {
  buildEvalVectors,
  serializeEvalVectors,
  EVAL_VECTORS_PATH,
} from '../../vectors/eval-generate'

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
