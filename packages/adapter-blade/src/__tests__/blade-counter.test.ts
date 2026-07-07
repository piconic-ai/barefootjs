/**
 * Ported from `packages/adapter-jinja/src/__tests__/jinja-counter.test.ts`
 * (itself ported from Xslate's counter test).
 *
 * Only the FIRST (structural "compiles to a template") test is ported here.
 * The Jinja analog's second test renders the compiled template through REAL
 * Jinja2 via `renderJinjaComponent`; the Blade analog of that harness
 * (`renderBladeComponent`, spawning `php` against the bundled PHP runtime) is
 * `src/test-render.ts` — workstream C, exercised end-to-end by
 * `blade-adapter.test.ts`'s conformance suite, not duplicated here.
 */

import { test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { BladeAdapter } from '../adapter'

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

test('Counter compiles to a Blade .blade.php template', () => {
  const result = compileJSX(COUNTER_SRC, 'Counter.tsx', {
    adapter: new BladeAdapter(),
    outputIR: true,
  })
  const errors = result.errors.filter(e => e.severity === 'error')
  expect(errors).toEqual([])

  const tpl = result.files.find(f => f.type === 'markedTemplate')
  expect(tpl).toBeDefined()
  const content = tpl!.content
  // Script registration as `@php(...)` statements (`@php(...)` never
  // prints, so — unlike Kolon's bare `:` line — no throwaway-bind trick is
  // needed to suppress a leaked return value; see `blade-adapter.ts`'s
  // `generateScriptRegistrations`).
  expect(content).toContain(`@php($bf->register_script('/static/components/barefoot.js'))`)
  expect(content).toContain(`@php($bf->register_script('/static/components/Counter.client.js'))`)
  // Hydration markers
  expect(content).toContain(`bf-s="{!! e($bf->scope_attr()) !!}"`)
  expect(content).toContain(`{!! $bf->hydration_attrs() !!}`)
  expect(content).toContain(`{!! $bf->props_attr() !!}`)
  // Text slots — every text interpolation routes through `$bf->string(...)`,
  // wrapped in `{!! e(...) !!}` rather than Blade's own `{{ }}` (its
  // regex-based tag matcher breaks on evaluator-JSON payload text containing
  // a literal `}}` — see `blade-adapter.ts`'s file header, divergence 0).
  // ("Stringification": PHP's default stringification diverges from JS's
  // further than Perl's does, so this port wraps every text-position value,
  // unlike the Kolon port's bare `<: $count :>`).
  expect(content).toContain(`{!! $bf->text_start("s0") !!}{!! e($bf->string($count)) !!}{!! $bf->text_end() !!}`)
  expect(content).toContain(`{!! $bf->text_start("s2") !!}{!! e($bf->string($doubled)) !!}{!! $bf->text_end() !!}`)
  // Button stays a plain element (onClick is client-only)
  expect(content).toContain(`+1</button>`)
})
