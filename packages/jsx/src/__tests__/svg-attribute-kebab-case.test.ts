/**
 * BarefootJS Compiler - SVG presentation attributes are emitted in kebab-case (#135).
 *
 * SVG presentation attributes are written camelCase in JSX (React-style)
 * but must reach the DOM as kebab-case. Both SSR template output and
 * client-side reactive `setAttribute` calls go through `toHtmlAttrName`,
 * so they must agree on the spelling.
 *
 * Without the conversion, SSR emits `stroke-width="1.5"` while
 * hydration writes `setAttribute('strokeWidth', '2.5')`, leaving both
 * attributes on the DOM. The SVG renderer reads the kebab-case form,
 * so reactive updates become invisible. Discovered by the Graph/DAG
 * Editor block (#135) — edge selection failed to thicken the stroke
 * even though `selectedEdgeId()` updated correctly.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('SVG attribute kebab-case emission (#135)', () => {
  test('static SVG attributes are emitted as kebab-case in template', () => {
    const source = `
      export function Edge() {
        return <path d="M0 0" strokeWidth={1.5} fillOpacity={0.5} markerEnd="url(#a)" textAnchor="middle" />
      }
    `
    const result = compileJSXSync(source, 'Edge.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    // Template literal must use kebab-case
    expect(content).toContain('stroke-width')
    expect(content).toContain('fill-opacity')
    expect(content).toContain('marker-end')
    expect(content).toContain('text-anchor')

    // Must NOT keep the camelCase form alongside the kebab form
    expect(content).not.toContain('strokeWidth=')
    expect(content).not.toContain('fillOpacity=')
    expect(content).not.toContain('markerEnd=')
    expect(content).not.toContain('textAnchor=')
  })

  test('reactive SVG attributes use kebab-case for setAttribute', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Edge() {
        const [width, setWidth] = createSignal(1.5)
        return <path d="M0 0" strokeWidth={width()} />
      }
    `
    const result = compileJSXSync(source, 'Edge.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    // Reactive setAttribute must use kebab-case so SSR and hydration agree.
    expect(content).toContain("'stroke-width'")
    expect(content).not.toContain("'strokeWidth'")
  })

  test('className still maps to class (existing behavior preserved)', () => {
    const source = `
      export function Box() {
        return <div className="foo" />
      }
    `
    const result = compileJSXSync(source, 'Box.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    expect(content).toContain('class="foo"')
    expect(content).not.toContain('className=')
  })

  test('non-SVG camelCase attributes are NOT converted', () => {
    // tabIndex, autoFocus, etc. are HTML attributes that stay camelCase
    // in the JSX → DOM property pipeline (or get specific handling
    // elsewhere). The SVG conversion map must not touch them.
    const source = `
      export function Btn() {
        return <button tabIndex={0} autoFocus={true}>x</button>
      }
    `
    const result = compileJSXSync(source, 'Btn.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    // tabIndex / autoFocus should not be converted to tab-index / auto-focus
    expect(content).not.toContain('tab-index')
    expect(content).not.toContain('auto-focus')
  })
})
