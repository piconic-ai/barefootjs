/**
 * `isOpaqueLocalAccessorName` (#3144) — the shared "is this a component-body
 * local bound to an opaque call" check every non-JS-runtime adapter's
 * `call()` fallback consults before treating a zero-arg identifier call as
 * a signal getter. See `opaque-local-accessor.ts`'s docstring.
 *
 * The real end-to-end behavior (the refusal firing, with the right BF101
 * diagnostic, through each adapter's actual `call()` method) is covered by
 * the `opaque-local-accessor-call` corpus fixture's `conformancePins`
 * entries, exercised against real PHP/Blade, Ruby/ERB, Python/Jinja2,
 * Rust/minijinja, Perl/Mojolicious, Java/Pebble, PHP/Twig, Perl/Xslate and
 * Go rendering. This file pins the pure classification function itself,
 * built from the real analyzer's `ConstantInfo[]` (via `compileJSX`) rather
 * than hand-built fixtures, so the shape this function actually receives in
 * production is what gets tested.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler.ts'
import { TestAdapter } from '../adapters/test-adapter.ts'
import { isOpaqueLocalAccessorName } from '../opaque-local-accessor.ts'
import type { ComponentIR } from '../types.ts'

function localConstantsFor(source: string, filePath: string, componentName: string): ComponentIR['metadata']['localConstants'] {
  const result = compileJSX(source, filePath, { adapter: new TestAdapter(), outputIR: true })
  expect(result.errors).toEqual([])
  const irFile = result.files.find(
    (f) => f.type === 'ir' && f.path.includes(`.${componentName}.ir.json`),
  ) ?? result.files.find((f) => f.type === 'ir')
  expect(irFile).toBeDefined()
  const ir = JSON.parse(irFile!.content) as ComponentIR
  return ir.metadata.localConstants
}

describe('isOpaqueLocalAccessorName', () => {
  test('true for a component-body const bound to an opaque call', () => {
    const localConstants = localConstantsFor(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function makeLabel() { return () => 'ready' }
      export function Widget() {
        const [count] = createSignal(0)
        const label = makeLabel()
        return <div><span>{label()}</span><button>{count()}</button></div>
      }
      `,
      'Widget.tsx',
      'Widget',
    )
    expect(isOpaqueLocalAccessorName('label', localConstants)).toBe(true)
  })

  test('false for a plain literal-valued local', () => {
    const localConstants = localConstantsFor(
      `
      export function Widget({ label }: { label: string }) {
        const greeting = 'hi'
        return <div>{greeting}: {label}</div>
      }
      `,
      'Widget.tsx',
      'Widget',
    )
    expect(isOpaqueLocalAccessorName('greeting', localConstants)).toBe(false)
  })

  test('false for a name that names no local constant at all (e.g. a real signal getter)', () => {
    expect(isOpaqueLocalAccessorName('count', [])).toBe(false)
    expect(isOpaqueLocalAccessorName('count', undefined)).toBe(false)
  })

  test('false for a MODULE-scope const bound to an opaque call (a different, already-handled shape)', () => {
    const localConstants = localConstantsFor(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function makeLabel() { return () => 'ready' }
      const label = makeLabel()
      export function Widget() {
        const [count] = createSignal(0)
        return <div><span>{label()}</span><button>{count()}</button></div>
      }
      `,
      'Widget.tsx',
      'Widget',
    )
    expect(isOpaqueLocalAccessorName('label', localConstants)).toBe(false)
  })
})
