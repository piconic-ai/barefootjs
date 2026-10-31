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
 * Only the ops whose native binding the harnesses wire are listed: `get`
 * (rollout step 2). Each rollout step adds its op here and to every harness.
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
const NATIVE_BINDINGS: Readonly<Record<string, { op: PrimitiveOp; domains: Partial<Record<Proof, readonly Domain[]>> }>> = {
  get: { op: 'get', domains: { 'array-index': ['array-index'] } },
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
