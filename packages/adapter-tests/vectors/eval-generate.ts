/**
 * Golden-vector generator for the lightweight `ParsedExpr` evaluator
 * (issue #2018, Track A — the evaluator contract).
 *
 * Parses every case in eval-cases.ts with the real compiler
 * `parseExpression` (so each vector carries a genuine `ParsedExpr` tree)
 * and runs it through the JS reference evaluator (eval-reference.ts) to
 * compute `expect`. Writes eval-vectors.json — the language-independent
 * conformance data the Go (runtime/eval_vectors_test.go), Perl
 * (t/eval_vectors.t), Python (tests/test_eval_vectors.py), and Ruby
 * (test/eval_vectors_test.rb) harnesses consume to prove their
 * evaluators are isomorphic with JS.
 *
 *   cd packages/adapter-tests && bun run generate:eval-vectors
 *
 * The freshness test in src/__tests__/eval-vectors.test.ts fails CI when
 * eval-vectors.json is out of date with eval-cases.ts.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExpression } from '@barefootjs/jsx'
import { assertEncodable, encodeExpect } from './generate'
import { evalCases } from './eval-cases'
import { evaluate } from './eval-reference'
import type { EvalEnv } from './eval-reference'
import type { ParsedExpr } from '@barefootjs/jsx'

export const EVAL_VECTORS_PATH = join(dirname(fileURLToPath(import.meta.url)), 'eval-vectors.json')

export interface EvalVectorFile {
  version: number
  generator: string
  spec: string
  cases: Array<{ src: string; expr: ParsedExpr; env: EvalEnv; expect: unknown; note: string }>
}

export function buildEvalVectors(): EvalVectorFile {
  return {
    version: 1,
    generator: 'packages/adapter-tests/vectors/eval-generate.ts',
    spec: 'spec/compiler.md#parsedexpr-evaluator-semantics',
    cases: evalCases.map((c) => {
      const context = `${c.note}: ${c.src}`
      const expr = parseExpression(c.src)
      if (expr.kind === 'unsupported') {
        throw new Error(`${context}: parseExpression refused the source (${expr.reason})`)
      }
      // The environment is plain JSON input — hold it to the same
      // encodable-value rule as helper-vector args.
      assertEncodable(c.env, `${context} → env`)
      const expect = encodeExpect(evaluate(expr, c.env), `${context} → expect`)
      return { src: c.src, expr, env: c.env, expect, note: c.note }
    }),
  }
}

export function serializeEvalVectors(): string {
  return JSON.stringify(buildEvalVectors(), null, 2) + '\n'
}

if (import.meta.main) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(EVAL_VECTORS_PATH, serializeEvalVectors())
  console.log(`wrote ${EVAL_VECTORS_PATH} (${evalCases.length} cases)`)
}
