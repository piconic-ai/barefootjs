/**
 * Element attribute emission, across the eight DSL adapters (#3478).
 *
 * Every DSL adapter plans an `{expr}` attribute value and a `{...spread}`
 * through `@barefootjs/jsx`'s `planAttrExpression` / `planSpreadAttr` and
 * only spells the result. This test compiles the attribute fixtures with
 * each adapter and reads the plan back out of the template:
 *
 * - `temporaries`: the `bf_pu<N>` bindings a `presence` or `omit-nil` plan
 *   allocates, one per attribute;
 * - `spreads`: the `spread_attrs(...)` calls a spread plan emits;
 * - `boolStr`: attribute values routed through `bool_str`.
 *
 * The one declared difference: Mojolicious and Xslate also route a boolean
 * branch of a ternary attribute through `bool_str`, because Perl has no
 * boolean to stringify (`stringifyBooleanTernaryBranches`).
 */
import { describe, test, expect } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { compileFixtureJSX } from '../harness-program'
import type { JSXFixture } from '../types'
import { DSL_ADAPTERS, type DslAdapterCase } from '../dsl-helper-calls'

const PERL_BOOLEAN_BRANCHES: ReadonlySet<string> = new Set(['mojolicious', 'xslate'])

// Eight compiles per fixture.
const COMPILE_TIMEOUT_MS = 60_000

const fixturesDir = join(import.meta.dir, '..', '..', 'fixtures')
const ATTRIBUTE_FIXTURE = /attr|nullable|nullish|presence|aria|boolean|spread|undefined/i
const fixtures: JSXFixture[] = await Promise.all(
  readdirSync(fixturesDir)
    .filter((file) => file.endsWith('.ts') && ATTRIBUTE_FIXTURE.test(file) && !file.endsWith('-client.ts'))
    .sort()
    .map(async (file) => (await import(join(fixturesDir, file))).fixture as JSXFixture),
)

function planSignature(fixture: JSXFixture, adapter: DslAdapterCase) {
  const result = compileFixtureJSX(fixture.source, `${fixture.id}.tsx`, { adapter: adapter.make() })
  const template = result.files
    .filter((f) => f.type === 'markedTemplate')
    .map((f) => f.content)
    .join('\n')
  return {
    temporaries: new Set(template.match(/bf_pu\d+/g) ?? []).size,
    spreads: (template.match(/spread_attrs\(/g) ?? []).length,
    boolStr: (template.match(/[\w-]+="[^"]*bool_str\(/g) ?? []).length,
  }
}

describe('element attributes take the same plan on every DSL adapter (#3478)', () => {
  test('the family is not empty', () => {
    expect(fixtures.length).toBeGreaterThan(40)
  })

  for (const fixture of fixtures) {
    test(fixture.id, () => {
      const [reference, ...rest] = DSL_ADAPTERS.map((adapter) => ({ adapter: adapter.name, ...planSignature(fixture, adapter) }))
      for (const other of rest) {
        const expected = { ...reference!, adapter: other.adapter }
        if (PERL_BOOLEAN_BRANCHES.has(other.adapter)) {
          expect(other.boolStr).toBeGreaterThanOrEqual(reference!.boolStr)
          expected.boolStr = other.boolStr
        }
        expect(other).toEqual(expected)
      }
    }, COMPILE_TIMEOUT_MS)
  }
})
