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
import { ARRAY_METHOD_CATALOGUE } from '@barefootjs/jsx'
import { compileFixtureJSX } from '../harness-program'
import type { JSXFixture } from '../types'
import { DSL_ADAPTERS, helperCalls, type DslAdapterCase } from '../dsl-helper-calls'

const ADAPTERS = DSL_ADAPTERS
const HELPERS: ReadonlySet<string> = new Set(Object.values(ARRAY_METHOD_CATALOGUE).map((entry) => entry.helper))

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

function templateOf(fixture: JSXFixture, adapter: DslAdapterCase): string {
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
        calls: helperCalls(templateOf(fixture, adapter), adapter, HELPERS),
      }))
      for (const call of reference!.calls) seen.add(call.split('/')[0]!)
      for (const other of rest) expect(other).toEqual({ adapter: other.adapter, calls: reference!.calls })
    }, COMPILE_TIMEOUT_MS)
  }

  test('the family exercises every catalogue helper', () => {
    expect([...HELPERS].filter((helper) => !seen.has(helper)).sort()).toEqual([])
  })
})
