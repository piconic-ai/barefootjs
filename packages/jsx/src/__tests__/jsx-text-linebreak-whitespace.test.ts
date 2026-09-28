/**
 * Regression tests for #3237: a JSX text child that sits on its own line
 * kept the surrounding whitespace (collapsed to one space on each side)
 * instead of following the JSX whitespace rule TypeScript/Babel/React all
 * implement — trim whitespace that straddles a line break, drop lines that
 * end up empty, join what remains with a single space.
 *
 * `transformText` (`../jsx-to-ir.ts`) is Phase 1 of the shared
 * JSX → IR → template pipeline: every adapter (CSR included, exercised
 * here via `TestAdapter`) renders from the same `IRText.value`, so a fix
 * at this single call site covers CSR and SSR alike. This is the same
 * `compileJSX` entry point `@barefootjs/vite`'s plugin calls per file
 * (`packages/vite/src/plugin.ts`), so exercising it here — rather than
 * calling `transformText` in isolation — pins the real pipeline's output,
 * not just a convenient unit-level call order.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function getClientJs(source: string, filename = '/x/Probe.tsx'): string {
  const result = compileJSX(source, filename, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('JSX text whitespace across line breaks (#3237)', () => {
  test('text alone on its own line between tags loses the surrounding blank lines', () => {
    const source = `
      'use client'
      export function Probe() {
        return (
          <div>
            <div className="label">
              Light
            </div>
          </div>
        )
      }
    `
    const js = getClientJs(source)
    expect(js).toContain('<div class="label">Light</div>')
    expect(js).not.toContain('> Light <')
    expect(js).not.toContain(' Light ')
  })

  test('multi-line text is trimmed per line and joined with a single space', () => {
    const source = `
      'use client'
      export function Probe() {
        return (
          <p>
            first line
            second line
          </p>
        )
      }
    `
    const js = getClientJs(source)
    expect(js).toContain('<p>first line second line</p>')
  })

  test('whitespace within a single line (no line break) is left untouched', () => {
    const source = `
      'use client'
      export function Probe() {
        return (
          <div><b>a</b> <i>b</i></div>
        )
      }
    `
    const js = getClientJs(source)
    expect(js).toContain('<div><b>a</b> <i>b</i></div>')
  })
})
