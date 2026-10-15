/**
 * Loop lowering, across the eight DSL adapters (#3473).
 *
 * Every DSL adapter must make the same decisions for a loop, whatever its
 * spelling. This test pins the decisions that once differed:
 *
 * - the loop body renders once: a diagnostic inside it is reported once,
 *   on every adapter (Jinja, MiniJinja, Pebble, Twig, Blade and Xslate used
 *   to render the children twice and report it twice).
 */
import { describe, test, expect } from 'bun:test'
import type { CompilerError } from '@barefootjs/jsx'
import { compileFixtureJSX } from '../harness-program'
import { DSL_ADAPTERS } from '../dsl-helper-calls'

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
})
