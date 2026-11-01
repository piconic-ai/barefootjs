/**
 * The native-operator claims each runtime harness runs against the
 * `primitives/` vectors (spec/js-primitive-semantics.md, "Conformance"
 * item 3), generated from the template adapters' `NATIVE_SAFE` tables.
 *
 *   cd packages/adapter-tests && bun run generate:primitive-vectors
 *
 * Each harness binds an op to its runtime's native operator as well as to
 * its helper, and runs the native binding over exactly the cases whose
 * `domain` the runtime claims here. A runtime's claim is the union of the
 * tables of the adapters that run on it (Mojolicious and Xslate share Perl,
 * Twig and Blade share PHP), since they share one native operator. A claimed
 * proof with no vector domain cannot be pinned, so generation refuses it.
 * The freshness test (src/__tests__/primitive-vectors.test.ts) fails when
 * the committed JSON drifts from the tables.
 *
 * Only the ops whose native binding the harnesses wire are listed: `truthy`
 * (rollout step 1), `get` (step 2), `to_number` and `lt` / `le` / `gt` /
 * `ge` (step 3), `number`, the number-literal plan's host literal
 * (step 6), and `to_string` and `plus` (step 4). Each later step adds its op here and to every harness.
 */
import { dirname, join } from 'node:path'
import type { NativeSafeTable, PrimitiveOp, Proof } from '@barefootjs/jsx'
import { NATIVE_SAFE as BLADE } from '@barefootjs/blade/adapter'
import { NATIVE_SAFE as ERB } from '@barefootjs/erb/adapter'
import { NATIVE_SAFE as GO } from '@barefootjs/go-template/adapter'
import { NATIVE_SAFE as JINJA } from '@barefootjs/jinja/adapter'
import { NATIVE_SAFE as MOJO } from '@barefootjs/mojolicious/adapter'
import { NATIVE_SAFE as PEBBLE } from '@barefootjs/pebble/adapter'
import { NATIVE_SAFE as MINIJINJA } from '@barefootjs/rust/adapter'
import { NATIVE_SAFE as TWIG } from '@barefootjs/twig/adapter'
import { NATIVE_SAFE as XSLATE } from '@barefootjs/xslate/adapter'
import { PRIMITIVES_DIR } from './generate'
import type { Domain } from './types'

export const NATIVE_SAFE_PATH = join(dirname(PRIMITIVES_DIR), 'primitives-native-safe.json')

/** The adapters each runtime harness speaks for, by ledger key. */
export const RUNTIME_TABLES: Readonly<Record<string, readonly NativeSafeTable[]>> = {
  go: [GO],
  java: [PEBBLE],
  perl: [MOJO, XSLATE],
  php: [TWIG, BLADE],
  python: [JINJA],
  ruby: [ERB],
  rust: [MINIJINJA],
}

/**
 * Each vector op with a native binding: the plan op its native operator
 * spells, and the vector domains a claimed proof covers.
 */
const RELATIONAL_BINDING = { op: 'relational', domains: { 'number-pair': ['number-pair'] } } as const

const NATIVE_BINDINGS: Readonly<
  Record<string, { op: PrimitiveOp; domains: Partial<Record<Proof, readonly Domain[]>>; elsewhere?: readonly Proof[] }>
> = {
  truthy: { op: 'to-boolean', domains: { boolean: ['boolean'] } },
  get: { op: 'get', domains: { 'array-index': ['array-index'] } },
  // A unary `+` over a proven number is the operand itself. The plan's
  // `to-number` op also covers binary `-` / `*` (`number-pair`, and
  // `unproven` on the targets that keep their native operator for them),
  // which no single-operand `to_number` vector exercises.
  to_number: { op: 'to-number', domains: { number: ['number'] }, elsewhere: ['number-pair', 'unproven'] },
  lt: RELATIONAL_BINDING,
  le: RELATIONAL_BINDING,
  gt: RELATIONAL_BINDING,
  ge: RELATIONAL_BINDING,
  number: { op: 'number-literal', domains: { 'safe-integer': ['safe-integer'] } },
  // A proven string is its own ToString (#3824 step 4).
  to_string: { op: 'to-string', domains: { string: ['string'] } },
  // Two proven numbers: the host's `+`. One proven string: the host's
  // concatenation, the other operand through `to_string` (#3824 step 4). The
  // `beyond-safe-integer` cases are claimed by no proof ("Decisions" (5)).
  plus: { op: 'plus', domains: { 'number-pair': ['number-pair'], string: ['string-pair', 'string-mixed'] } },
}

export interface NativeSafeMirror {
  version: number
  generator: string
  spec: string
  about: string
  runtimes: Record<string, Record<string, Domain[]>>
}

/** The domains `tables` claim for `fn`'s native binding. */
function claimedDomains(fn: string, tables: readonly NativeSafeTable[]): Domain[] {
  const binding = NATIVE_BINDINGS[fn]!
  const domains = new Set<Domain>()
  for (const proof of new Set(tables.flatMap((t) => t[binding.op] ?? []))) {
    if (binding.elsewhere?.includes(proof)) continue
    const covered = binding.domains[proof]
    if (!covered) throw new Error(`a NATIVE_SAFE table claims '${binding.op}' for proof '${proof}', which no ${fn} vector domain pins`)
    for (const d of covered) domains.add(d)
  }
  return [...domains].sort()
}

export function buildNativeSafeMirror(): NativeSafeMirror {
  return {
    version: 1,
    generator: 'packages/adapter-tests/vectors/primitives/native-safe.ts',
    spec: 'spec/js-primitive-semantics.md',
    about:
      "Per runtime, the vector domains each op's NATIVE operator binding runs over: the union of the NATIVE_SAFE tables of the adapters on that runtime. Generated; never hand-edited.",
    runtimes: Object.fromEntries(
      Object.entries(RUNTIME_TABLES).map(([runtime, tables]) => [
        runtime,
        Object.fromEntries(Object.keys(NATIVE_BINDINGS).map((fn) => [fn, claimedDomains(fn, tables)])),
      ]),
    ),
  }
}

export function serializeNativeSafeMirror(): string {
  return JSON.stringify(buildNativeSafeMirror(), null, 2) + '\n'
}

if (import.meta.main) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(NATIVE_SAFE_PATH, serializeNativeSafeMirror())
  console.log(`wrote ${NATIVE_SAFE_PATH}`)
}
