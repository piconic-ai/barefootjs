/**
 * Array / string method lowering, across the eight DSL adapters (#3476).
 *
 * Each DSL adapter lowers `xs.join(sep)`, `s.padStart(n, c)` and the rest of
 * `ArrayMethod` through `@barefootjs/jsx`'s `ARRAY_METHOD_CATALOGUE` and only
 * spells the call. This test compiles every fixture of the `methods/` family
 * (plus `number-tofixed`, the one catalogued method without a fixture there)
 * with each adapter and reads the catalogue helper calls back out of the
 * template: every adapter must call the same helpers, in the same order, with
 * the same number of operands. A local special case in one adapter's
 * `renderArrayMethod` (a different default, a dropped argument, another
 * helper) breaks the agreement.
 */
import { describe, test, expect } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ARRAY_METHOD_CATALOGUE, type TemplateAdapter } from '@barefootjs/jsx'
import { compileFixtureJSX } from '../harness-program'
import type { JSXFixture } from '../types'
import { BladeAdapter } from '@barefootjs/blade/adapter'
import { ErbAdapter } from '@barefootjs/erb/adapter'
import { JinjaAdapter } from '@barefootjs/jinja/adapter'
import { MojoAdapter } from '@barefootjs/mojolicious/adapter'
import { PebbleAdapter } from '@barefootjs/pebble/adapter'
import { MinijinjaAdapter } from '@barefootjs/rust/adapter'
import { TwigAdapter } from '@barefootjs/twig/adapter'
import { XslateAdapter } from '@barefootjs/xslate/adapter'

interface AdapterCase {
  name: string
  make: () => TemplateAdapter
  /** The text before a runtime helper's name (`bf.join(` → `bf.`). */
  prefix: string
  /** Helpers this adapter lowers to a native operator, and how to find each call. */
  native?: Record<string, RegExp>
}

const ADAPTERS: readonly AdapterCase[] = [
  { name: 'blade', make: () => new BladeAdapter(), prefix: '$bf->' },
  {
    name: 'erb',
    make: () => new ErbAdapter(),
    prefix: 'bf.',
    native: { lc: /\)\.downcase\b/g, uc: /\)\.upcase\b/g },
  },
  { name: 'jinja', make: () => new JinjaAdapter(), prefix: 'bf.' },
  {
    name: 'mojolicious',
    make: () => new MojoAdapter(),
    prefix: 'bf->',
    native: { lc: /(?<![\w>$])lc\(/g, uc: /(?<![\w>$])uc\(/g },
  },
  { name: 'pebble', make: () => new PebbleAdapter(), prefix: 'bf.' },
  { name: 'rust', make: () => new MinijinjaAdapter(), prefix: 'bf.' },
  { name: 'twig', make: () => new TwigAdapter(), prefix: 'bf.' },
  { name: 'xslate', make: () => new XslateAdapter(), prefix: '$bf.' },
]

const HELPERS = new Set(Object.values(ARRAY_METHOD_CATALOGUE).map((entry) => entry.helper))

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The number of top-level comma-separated operands from `src[open]` (an opening paren). */
function operandCount(src: string, open: number): number {
  let depth = 0
  let count = 1
  for (let i = open; i < src.length; i++) {
    const ch = src[i]!
    if (ch === "'" || ch === '"') {
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (--depth === 0) return count
    } else if (ch === ',' && depth === 1) {
      count++
    }
  }
  throw new Error(`unbalanced call at ${open}`)
}

/** The catalogue helper calls in `src`, as `helper/operands`, in source order. */
function helperCalls(src: string, adapter: AdapterCase): string[] {
  const calls: Array<[number, string]> = []
  const prefixed = new RegExp(`(?<![\\w$])${escapeRe(adapter.prefix)}(\\w+)\\(`, 'g')
  for (const m of src.matchAll(prefixed)) {
    if (HELPERS.has(m[1] as never)) calls.push([m.index!, `${m[1]}/${operandCount(src, m.index! + m[0].length - 1)}`])
  }
  for (const [helper, re] of Object.entries(adapter.native ?? {})) {
    for (const m of src.matchAll(re)) calls.push([m.index!, `${helper}/1`])
  }
  return calls.sort((a, b) => a[0] - b[0]).map(([, call]) => call)
}

const methodsDir = join(import.meta.dir, '..', '..', 'fixtures', 'methods')
const fixturePaths = [
  ...readdirSync(methodsDir)
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .map((file) => join(methodsDir, file)),
  join(methodsDir, '..', 'number-tofixed.ts'),
]
const fixtures: JSXFixture[] = await Promise.all(
  fixturePaths.map(async (path) => (await import(path)).fixture as JSXFixture),
)

// Eight compiles per fixture; the sort fixtures take about five seconds.
const COMPILE_TIMEOUT_MS = 60_000

function templateOf(fixture: JSXFixture, adapter: AdapterCase): string {
  const result = compileFixtureJSX(fixture.source, `${fixture.id}.tsx`, { adapter: adapter.make() })
  return result.files
    .filter((f) => f.type === 'markedTemplate')
    .map((f) => f.content)
    .join('\n')
}

describe('array / string methods lower to the same catalogue helpers on every DSL adapter (#3476)', () => {
  const seen = new Set<string>()
  for (const fixture of fixtures) {
    test(fixture.id, () => {
      const [reference, ...rest] = ADAPTERS.map((adapter) => ({
        adapter: adapter.name,
        calls: helperCalls(templateOf(fixture, adapter), adapter),
      }))
      for (const call of reference!.calls) seen.add(call.split('/')[0]!)
      for (const other of rest) expect(other).toEqual({ adapter: other.adapter, calls: reference!.calls })
    }, COMPILE_TIMEOUT_MS)
  }

  test('the family exercises every catalogue helper', () => {
    expect([...HELPERS].filter((helper) => !seen.has(helper)).sort()).toEqual([])
  })
})
