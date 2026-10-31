/**
 * Generator for the `primitives/` vector corpus
 * (spec/js-primitive-semantics.md, "Conformance").
 *
 * Runs every case of every operation in index.ts through the operation's
 * JS reference and writes `primitives/<fn>.json`, the language-neutral data
 * every runtime harness binds to its helper (vectors/README.md, "Current
 * runners").
 *
 *   cd packages/adapter-tests && bun run generate:primitive-vectors
 *
 * The freshness test in src/__tests__/primitive-vectors.test.ts fails CI
 * when a committed file drifts from its case definitions.
 *
 * Encoding differs from vectors.json in one way: the sentinel
 * `{"$num": "NaN" | "Infinity" | "-Infinity" | "-0"}` is used in `args` as
 * well as in `expect`, because these operations are defined on exactly
 * those values (`truthy(NaN)`, `neg(0)`), and `-0` is spelled by the
 * sentinel because JSON cannot carry the sign of zero. Harnesses compare a
 * zero by sign.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { primitiveOps } from './index'
import { DOMAINS, type PrimitiveOp } from './types'

export const PRIMITIVES_DIR = dirname(fileURLToPath(import.meta.url))

export interface PrimitiveVectorFile {
  version: number
  generator: string
  spec: string
  fn: string
  step: number
  cases: Array<{ fn: string; args: unknown[]; expect: unknown; domain: string; note: string }>
}

function encodeNumber(n: number): unknown {
  if (Number.isNaN(n)) return { $num: 'NaN' }
  if (n === Number.POSITIVE_INFINITY) return { $num: 'Infinity' }
  if (n === Number.NEGATIVE_INFINITY) return { $num: '-Infinity' }
  if (Object.is(n, -0)) return { $num: '-0' }
  return n
}

/**
 * Encode one value. `undefined` becomes `null` in an expect (the runtimes
 * have one nil) and is refused in an argument, where it would be ambiguous.
 */
export function encodePrimitiveValue(value: unknown, context: string, isArg: boolean): unknown {
  if (value === undefined) {
    if (isArg) throw new Error(`${context}: undefined is not encodable as an argument`)
    return null
  }
  if (typeof value === 'number') return encodeNumber(value)
  if (Array.isArray(value)) return value.map((v, i) => encodePrimitiveValue(v, `${context}[${i}]`, isArg))
  if (value !== null && typeof value === 'object') {
    if ('$num' in value) throw new Error(`${context}: the "$num" key is reserved for the sentinel`)
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, encodePrimitiveValue(v, `${context}.${k}`, isArg)]),
    )
  }
  return value
}

export function buildPrimitiveFile(op: PrimitiveOp): PrimitiveVectorFile {
  const seen = new Set<string>()
  return {
    version: 1,
    generator: 'packages/adapter-tests/vectors/primitives/generate.ts',
    spec: 'spec/js-primitive-semantics.md',
    fn: op.fn,
    step: op.step,
    cases: op.cases.map((c) => {
      const key = `${c.fn}/${c.note}`
      if (c.fn !== op.fn) throw new Error(`${key}: case fn does not match its file (${op.fn})`)
      if (seen.has(key)) throw new Error(`${key}: duplicate case key`)
      if (!DOMAINS.has(c.domain)) throw new Error(`${key}: unknown domain "${c.domain}"`)
      seen.add(key)
      const args = c.args.map((a, i) => encodePrimitiveValue(a, `${key} → args[${i}]`, true))
      const result = (op.reference as (...args: unknown[]) => unknown)(...c.args)
      const expect = encodePrimitiveValue(result, `${key} → expect`, false)
      return { fn: c.fn, args, expect, domain: c.domain, note: c.note }
    }),
  }
}

export function primitiveFilePath(fn: string): string {
  return join(PRIMITIVES_DIR, `${fn}.json`)
}

export function serializePrimitiveFile(op: PrimitiveOp): string {
  return JSON.stringify(buildPrimitiveFile(op), null, 2) + '\n'
}

if (import.meta.main) {
  const { writeFileSync } = await import('node:fs')
  for (const op of primitiveOps) {
    writeFileSync(primitiveFilePath(op.fn), serializePrimitiveFile(op))
    console.log(`wrote ${primitiveFilePath(op.fn)} (${op.cases.length} cases)`)
  }
}
