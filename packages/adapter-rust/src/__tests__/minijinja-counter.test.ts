/**
 * Near-verbatim port of
 * `packages/adapter-jinja/src/__tests__/jinja-adapter-unit.test.ts`'s sibling
 * `jinja-counter.test.ts` (itself ported from
 * `packages/adapter-xslate/src/__tests__/xslate-counter.test.ts`).
 *
 * Only the FIRST (structural "compiles to a template") test is ported here.
 * A real-render counterpart lives in the conformance test file
 * (`minijinja-adapter.test.ts`, via `renderMinijinjaComponent` in
 * `src/test-render.ts`), which spawns the compiled `bf-render` Rust binary
 * rather than asserting on generated template text.
 */

import { test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { MinijinjaAdapter } from '../adapter'

const COUNTER_SRC = `"use client"
import { createSignal } from '@barefootjs/client'
export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = createSignal(initial)
  const doubled = () => count() * 2
  return (
    <div class="counter">
      <p>count: {count()}</p>
      <p>doubled: {doubled()}</p>
      <button onClick={() => setCount(n => n + 1)}>+1</button>
    </div>
  )
}`

test('Counter compiles to a minijinja .j2 template', () => {
  const result = compileJSX(COUNTER_SRC, 'Counter.tsx', {
    adapter: new MinijinjaAdapter(),
    outputIR: true,
  })
  const errors = result.errors.filter(e => e.severity === 'error')
  expect(errors).toEqual([])

  const tpl = result.files.find(f => f.type === 'markedTemplate')
  expect(tpl).toBeDefined()
  const content = tpl!.content
  // Script registration as `{% set %}` statements (Jinja's `{% %}` tag never
  // prints, so — unlike Kolon's bare `:` line — no throwaway-bind trick is
  // needed to suppress a leaked return value; see `minijinja-adapter.ts`'s
  // `generateScriptRegistrations`).
  expect(content).toContain(`bf.register_script('/static/components/barefoot.js')`)
  expect(content).toContain(`bf.register_script('/static/components/Counter.client.js')`)
  // Hydration markers
  expect(content).toContain(`bf-s="{{ bf.scope_attr() }}"`)
  expect(content).toContain(`{{ bf.hydration_attrs() | safe }}`)
  expect(content).toContain(`{{ bf.props_attr() | safe }}`)
  // Text slots — every text interpolation routes through `bf.string(...)`
  // (divergence 2: Python's default stringification diverges from JS's
  // further than Perl's does, so this port wraps every text-position value,
  // unlike the Kolon port's bare `<: $count :>`).
  expect(content).toContain(`{{ bf.text_start("s0") | safe }}{{ bf.string(count) }}{{ bf.text_end() | safe }}`)
  expect(content).toContain(`{{ bf.text_start("s2") | safe }}{{ bf.string(doubled) }}{{ bf.text_end() | safe }}`)
  // Button stays a plain element (onClick is client-only)
  expect(content).toContain(`+1</button>`)
})
