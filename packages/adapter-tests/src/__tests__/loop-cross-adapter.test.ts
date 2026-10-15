/**
 * Loop lowering, across the eight DSL adapters (#3473).
 *
 * Every DSL adapter must make the same decisions for a loop, whatever its
 * spelling. This test pins the decisions that once differed:
 *
 * - the loop body renders once: a diagnostic inside it is reported once,
 *   on every adapter (Jinja, MiniJinja, Pebble, Twig, Blade and Xslate used
 *   to render the children twice and report it twice);
 * - `planLoop`'s gates refuse the same loops on every adapter: an
 *   unlowerable destructure (BF104) and a computed const source no
 *   template binds (BF101), over the loop fixture families (destructure,
 *   entries / keys / values, shadowing, preamble, sort, static and computed
 *   sources, filter chains).
 *
 * The one declared difference: Perl has no boolean literal, so Mojolicious
 * and Xslate cannot spell a static source with a boolean item and refuse it
 * (BF101) where the other adapters inline it.
 */
import { describe, test, expect } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { CompilerError } from '@barefootjs/jsx'
import { compileFixtureJSX } from '../harness-program'
import type { JSXFixture } from '../types'
import { DSL_ADAPTERS } from '../dsl-helper-calls'

const fixturesDir = join(import.meta.dir, '..', '..', 'fixtures')
const LOOP_FIXTURE = /destructure|entries|loop-param-shadows|preamble|sort|static-loop|static-array|const-loop|filter-.*(loop|map)/
const loopFixtures: JSXFixture[] = await Promise.all(
  readdirSync(fixturesDir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('-client.ts') && LOOP_FIXTURE.test(file))
    .sort()
    .map(async (file) => (await import(join(fixturesDir, file))).fixture as JSXFixture),
)

/** Static sources with a boolean item, which Perl cannot spell. */
const PERL_UNSPELLABLE_STATIC: Record<string, ReadonlySet<string>> = {
  mojolicious: new Set(['static-loop-item-boolean-attr', 'static-loop-item-conditional']),
  xslate: new Set(['static-loop-item-boolean-attr', 'static-loop-item-conditional']),
}

// Eight compiles per case.
const COMPILE_TIMEOUT_MS = 60_000

function errorsOf(source: string, adapter: (typeof DSL_ADAPTERS)[number]): string[] {
  const result = compileFixtureJSX(source, 'Loop.tsx', { adapter: adapter.make() })
  return result.errors.map((e: CompilerError) => e.code)
}

describe('loop lowering decides the same on every DSL adapter (#3473)', () => {
  test('a diagnostic in the loop body is reported once', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'
export function Loop(props: { seed: number }) {
  const [rows, setRows] = createSignal<{ id: string; xs: number[] }[]>([])
  return <ul>{rows().map(row => <li key={row.id}>{row.xs.reduce((a, x) => a + x, props.seed)}</li>)}</ul>
}
`
    for (const adapter of DSL_ADAPTERS) {
      const bf101 = errorsOf(source, adapter).filter((code) => code === 'BF101')
      expect({ adapter: adapter.name, bf101: bf101.length }).toEqual({ adapter: adapter.name, bf101: 1 })
    }
  }, COMPILE_TIMEOUT_MS)

  test('a nested loop body is reported once too', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'
export function Loop(props: { seed: number }) {
  const [rows, setRows] = createSignal<{ id: string; groups: { id: string; xs: number[] }[] }[]>([])
  return <ul>{rows().map(row => <li key={row.id}>{row.groups.map(g => <b key={g.id}>{g.xs.reduce((a, x) => a + x, props.seed)}</b>)}</li>)}</ul>
}
`
    for (const adapter of DSL_ADAPTERS) {
      const bf101 = errorsOf(source, adapter).filter((code) => code === 'BF101')
      expect({ adapter: adapter.name, bf101: bf101.length }).toEqual({ adapter: adapter.name, bf101: 1 })
    }
  }, COMPILE_TIMEOUT_MS)

  for (const fixture of loopFixtures) {
    test(`the loop gates agree: ${fixture.id}`, () => {
      const results = DSL_ADAPTERS.map((adapter) => {
        const { errors } = compileFixtureJSX(fixture.source, `${fixture.id}.tsx`, { adapter: adapter.make() })
        return {
          adapter: adapter.name,
          bf104: errors.filter((e) => e.code === 'BF104').length,
          constSource: errors.filter((e) => e.code === 'BF101' && e.message.startsWith('Loop array `')).length,
        }
      })
      const reference = results.find((r) => !PERL_UNSPELLABLE_STATIC[r.adapter])!
      for (const result of results) {
        const unspellable = PERL_UNSPELLABLE_STATIC[result.adapter]?.has(fixture.id) === true
        expect(result).toEqual({ ...reference, adapter: result.adapter, constSource: unspellable ? 1 : reference.constSource })
      }
    }, COMPILE_TIMEOUT_MS)
  }
})
