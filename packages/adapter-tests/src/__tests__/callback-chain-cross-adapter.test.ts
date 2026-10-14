/**
 * The higher-order callback chain, across the eight DSL adapters (#3477).
 *
 * Every DSL adapter lowers `.filter` / `.map` / `.sort` / `.reduce` and the
 * rest of `CALLBACK_METHODS` through `@barefootjs/jsx`'s `lowerCallbackMethod`
 * and only spells the result. This test pins that the behaviour is common:
 *
 * - each `methods/` fixture calls the same evaluator helpers, in the same
 *   order, with the same number of operands, on every adapter;
 * - each refusal fixture raises BF101 with the same message on every
 *   adapter, the adapter's name being the only variable part;
 * - the one deliberate difference, a predicate only the native forms of
 *   Xslate, ERB and Mojolicious lower, is declared here.
 */
import { describe, test, expect } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { CompilerError } from '@barefootjs/jsx'
import { compileFixtureJSX } from '../harness-program'
import type { JSXFixture } from '../types'
import { DSL_ADAPTERS, helperCalls, type DslAdapterCase } from '../dsl-helper-calls'

const EVAL_HELPERS: ReadonlySet<string> = new Set([
  'sort_eval',
  'reduce_eval',
  'filter_eval',
  'every_eval',
  'some_eval',
  'find_eval',
  'find_index_eval',
  'flat_map_eval',
  'map_eval',
  'sort',
])

// Eight compiles per fixture; the sort fixtures take about five seconds.
const COMPILE_TIMEOUT_MS = 60_000

const fixturesDir = join(import.meta.dir, '..', '..', 'fixtures')
const load = async (path: string) => (await import(path)).fixture as JSXFixture

function compile(fixture: JSXFixture, adapter: DslAdapterCase): { template: string; errors: CompilerError[] } {
  const result = compileFixtureJSX(fixture.source, `${fixture.id}.tsx`, { adapter: adapter.make() })
  return {
    template: result.files
      .filter((f) => f.type === 'markedTemplate')
      .map((f) => f.content)
      .join('\n'),
    errors: result.errors,
  }
}

/** The adapter's BF101 messages with its display name replaced by `{A}`. */
function refusals(errors: readonly CompilerError[], adapter: DslAdapterCase): string[] {
  return errors.filter((e) => e.code === 'BF101').map((e) => e.message.split(adapter.displayName).join('{A}'))
}

const methodFixtures = await Promise.all(
  readdirSync(join(fixturesDir, 'methods'))
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .map((file) => load(join(fixturesDir, 'methods', file))),
)

describe('callback methods call the same evaluator helpers on every DSL adapter (#3477)', () => {
  for (const fixture of methodFixtures) {
    test(fixture.id, () => {
      const [reference, ...rest] = DSL_ADAPTERS.map((adapter) => ({
        adapter: adapter.name,
        calls: helperCalls(compile(fixture, adapter).template, adapter, EVAL_HELPERS),
      }))
      for (const other of rest) expect(other).toEqual({ adapter: other.adapter, calls: reference!.calls })
    }, COMPILE_TIMEOUT_MS)
  }
})

/** Each refusal fixture and the one BF101 message every adapter raises for it. */
const REFUSALS: Record<string, string> = {
  'sort-opaque-comparator': `'.toSorted(...)' comparator is outside the {A} adapter's evaluable / structured surface`,
  'map-opaque-projection': `'.map(...)' projection is outside the {A} adapter's evaluable surface`,
  'reduce-nonliteral-seed': `'.reduce(...)' is outside the {A} adapter's evaluable surface (needs a literal initial value and an evaluable reducer body)`,
  'filter-opaque-predicate': `'.filter(...)' predicate is outside the {A} adapter's evaluable surface`,
  'filter-nested-find-predicate': `Filter predicate contains a nested '.find(...)' callback, which has no {A} scalar form`,
}

describe('callback refusals read the same on every DSL adapter (#3477)', () => {
  for (const [id, message] of Object.entries(REFUSALS)) {
    test(id, async () => {
      const fixture = await load(join(fixturesDir, `${id}.ts`))
      for (const adapter of DSL_ADAPTERS) {
        expect({ adapter: adapter.name, refusals: refusals(compile(fixture, adapter).errors, adapter) }).toEqual({
          adapter: adapter.name,
          refusals: [message],
        })
      }
    }, COMPILE_TIMEOUT_MS)
  }

  test('a callback reading its index is refused by the support gate, identically', async () => {
    const fixture = await load(join(fixturesDir, 'callback-index-param.ts'))
    const results = DSL_ADAPTERS.map((adapter) => {
      const { errors } = compile(fixture, adapter)
      const bf101 = errors.filter((e) => e.code === 'BF101')
      return { adapter: adapter.name, count: bf101.length, messages: refusals(errors, adapter) }
    })
    for (const result of results) {
      expect(result).toEqual({ adapter: result.adapter, count: 1, messages: results[0]!.messages })
    }
  }, COMPILE_TIMEOUT_MS)

  test('a string-method predicate: native on Xslate / ERB / Mojolicious, refused elsewhere', async () => {
    const fixture = await load(join(fixturesDir, 'filter-array-method-predicate.ts'))
    for (const adapter of DSL_ADAPTERS) {
      const { template, errors } = compile(fixture, adapter)
      if (adapter.nativePredicate) {
        expect({ adapter: adapter.name, refusals: refusals(errors, adapter) }).toEqual({ adapter: adapter.name, refusals: [] })
        expect(template).toContain('starts_with')
      } else {
        expect({ adapter: adapter.name, refusals: refusals(errors, adapter) }).toEqual({
          adapter: adapter.name,
          refusals: [`'.filter(...)' predicate is outside the {A} adapter's evaluable surface`],
        })
      }
    }
  }, COMPILE_TIMEOUT_MS)
})
