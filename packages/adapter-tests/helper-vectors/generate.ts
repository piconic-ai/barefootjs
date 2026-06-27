/**
 * Golden-vector generator (spec/template-helpers.md).
 *
 * Runs every case in cases.ts through its JS reference implementation
 * and writes vectors.json — the language-independent conformance data
 * consumed by the Go (runtime/vectors_test.go) and Perl
 * (t/helper_vectors.t) harnesses.
 *
 *   cd packages/adapter-tests && bun run generate:helper-vectors
 *
 * The freshness test in src/__tests__/helper-vectors.test.ts fails CI
 * when vectors.json is out of date with cases.ts.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cases, reference } from './cases'

export const VECTORS_PATH = join(dirname(fileURLToPath(import.meta.url)), 'vectors.json')

export interface VectorFile {
  version: number
  generator: string
  spec: string
  cases: Array<{ fn: string; args: unknown[]; expect: unknown; note: string }>
}

/**
 * Vectors are plain JSON: finite numbers, strings, booleans, null, and
 * arrays/objects thereof. Per the spec, a non-finite number in an
 * EXPECT value is encoded as the reserved sentinel
 * `{"$num": "NaN" | "Infinity" | "-Infinity"}`; `undefined` is never
 * encodable. Args must stay finite (refused loudly) until a
 * composition case needs otherwise.
 */
export function assertEncodable(value: unknown, context: string): void {
  if (value === undefined) throw new Error(`${context}: undefined is not encodable in vectors.json`)
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`${context}: non-finite number ${value} is not encodable in vectors.json`)
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertEncodable(v, `${context}[${i}]`))
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertEncodable(v, `${context}.${k}`)
  }
}

export function encodeExpect(value: unknown, context: string): unknown {
  // JS distinguishes undefined from null; the template backends have a
  // single absent value (Go nil / Perl undef). Per the spec, an
  // undefined EXPECT encodes as null (value-compat).
  if (value === undefined) return null
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $num: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity' }
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => encodeExpect(v, `${context}[${i}]`))
  }
  if (value !== null && typeof value === 'object') {
    if ('$num' in value) throw new Error(`${context}: the "$num" key is reserved for the sentinel`)
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, encodeExpect(v, `${context}.${k}`)]),
    )
  }
  return value
}

export function buildVectors(): VectorFile {
  return {
    version: 1,
    generator: 'packages/adapter-tests/helper-vectors/generate.ts',
    spec: 'spec/template-helpers.md',
    cases: cases.map((c) => {
      const ref = reference[c.fn]
      if (!ref) throw new Error(`no JS reference implementation for helper "${c.fn}" in cases.ts`)
      const context = `${c.fn}(${JSON.stringify(c.args)})`
      assertEncodable(c.args, context)
      const expect = encodeExpect(
        (ref as (...args: unknown[]) => unknown)(...c.args),
        `${context} → expect`,
      )
      return { fn: c.fn, args: c.args, expect, note: c.note }
    }),
  }
}

export function serializeVectors(): string {
  return JSON.stringify(buildVectors(), null, 2) + '\n'
}

if (import.meta.main) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(VECTORS_PATH, serializeVectors())
  console.log(`wrote ${VECTORS_PATH} (${cases.length} cases)`)
}
