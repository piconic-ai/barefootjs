/**
 * SVG-rooted loop item templates cloned via `template.innerHTML` (#2219).
 *
 * `template.innerHTML` parses in the HTML namespace, so an inner reactive
 * loop whose item root is an SVG element (`<line>`, `<circle>`, ...) cloned
 * as an `HTMLUnknownElement` — present in the DOM but never drawn by the
 * SVG renderer, with no error. The top-level loop path has wrapped these
 * templates in a synthetic `<svg>` since #135/#1088 (`templateRootIsSvg` /
 * `emitTemplateCloneInline` in `stringify/template-parse.ts`) and the
 * branch-arm path since its plan-ification, but the inner-loop reactive
 * clone (`stringify/inner-loop.ts`) and the static-loop CSR materialize
 * clones (#1247, `stringify/loop.ts`) parsed bare and stayed in the wrong
 * namespace.
 *
 * The fix mirrors the established wrap: parse `<svg>${template}</svg>` and
 * descend one extra level (`.firstElementChild.firstElementChild`).
 * HTML-rooted templates keep byte-identical output.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('inner reactive loop with an SVG element root (#2219)', () => {
  test('SVG-rooted inner item clones inside a synthetic <svg> wrap', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Sheet { id: number; ticks: number[] }
      export function Repro() {
        const [sheets] = createSignal<Sheet[]>([])
        return (
          <div>
            {sheets().map((s) => (
              <svg key={s.id} viewBox="0 0 100 100">
                {s.ticks.map((y) => (
                  <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="black" />
                ))}
              </svg>
            ))}
          </div>
        )
      }
    `)

    // The inner renderItem clone parses inside `<svg>...</svg>` and descends
    // one extra level to reach the real `<line>` root.
    expect(content).toMatch(/__t\.innerHTML = `<svg><line /)
    expect(content).toContain('return __t.content.firstElementChild.firstElementChild.cloneNode(true)')
  })

  test('HTML-rooted inner item keeps the bare clone byte-identical', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Group { id: number; items: string[] }
      export function Repro() {
        const [groups] = createSignal<Group[]>([])
        return (
          <ul>
            {groups().map((g) => (
              <li key={g.id}>
                {g.items.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </li>
            ))}
          </ul>
        )
      }
    `)

    expect(content).toMatch(/__t\.innerHTML = `<span /)
    expect(content).toContain('return __t.content.firstElementChild.cloneNode(true)')
    // No synthetic wrap anywhere in the inner clone.
    expect(content).not.toContain('`<svg><span')
  })

  test('conditional inner body whose branches are all SVG wraps too (#1088 shape)', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Sheet { id: number; ticks: number[] }
      export function Repro() {
        const [sheets] = createSignal<Sheet[]>([])
        return (
          <div>
            {sheets().map((s) => (
              <svg key={s.id}>
                {s.ticks.map((y) => (
                  y > 50
                    ? <line key={y} y1={y} y2={y} />
                    : <circle key={y} cy={y} r="1" />
                ))}
              </svg>
            ))}
          </div>
        )
      }
    `)

    // Both branches are SVG roots, so the interpolated conditional template
    // still gets the wrap (templateRootIsSvg recurses into the branches).
    expect(content).toMatch(/__t\.innerHTML = `<svg>\$\{/)
    expect(content).toContain('return __t.content.firstElementChild.firstElementChild.cloneNode(true)')
  })
})

describe('static-loop CSR materialize with an SVG element root (#2219, #1247 path)', () => {
  test('SVG-rooted materialize clone wraps and descends the extra level', () => {
    const content = clientJsFor(`
      'use client'
      type Props = { ticks: Record<string, number> }
      export function Repro(props: Props) {
        const entries = Object.entries(props.ticks ?? {}).filter(([, y]) => y > 0)
        return (
          <svg viewBox="0 0 100 100">
            {entries.map(([id, y]) => (
              <line key={id} x1="0" x2="100" y1={y} y2={y} />
            ))}
          </svg>
        )
      }
    `)

    // Materialize branch present (unsafe prop-derived array, #1247) ...
    expect(content).toMatch(/if \(!__iterEl\)/)
    // ... and its template parse is namespace-aware.
    expect(content).toMatch(/__tpl\.innerHTML = `<svg><line /)
    expect(content).toContain('const __cloned = __tpl.content.firstElementChild.firstElementChild')
  })

  test('multi-root (fragment) SVG materialize iterates the wrap one level down', () => {
    const content = clientJsFor(`
      'use client'
      type Props = { ticks: Record<string, number> }
      export function Repro(props: Props) {
        const entries = Object.entries(props.ticks ?? {}).filter(([, y]) => y > 0)
        return (
          <svg viewBox="0 0 100 100">
            {entries.map(([id, y]) => (
              <>
                <line key={id} x1="0" x2="100" y1={y} y2={y} />
                <text x="0" y={y}>{id}</text>
              </>
            ))}
          </svg>
        )
      }
    `)

    expect(content).toMatch(/__mtpl\.innerHTML = `<svg><line /)
    // Sibling iteration starts inside the synthetic wrap.
    expect(content).toContain('let __sib = __mtpl.content.firstElementChild.firstElementChild')
  })

  test('HTML-rooted materialize clone keeps the bare parse byte-identical', () => {
    const content = clientJsFor(`
      'use client'
      type Props = { reactions: Record<string, string[]> }
      export function Repro(props: Props) {
        const entries = Object.entries(props.reactions ?? {}).filter(([, users]) => users.length > 0)
        return (
          <div>
            {entries.map(([emoji, users]) => (
              <button key={emoji} type="button">{emoji}: {String(users.length)}</button>
            ))}
          </div>
        )
      }
    `)

    expect(content).toMatch(/if \(!__iterEl\)/)
    expect(content).toMatch(/__tpl\.innerHTML = `<button /)
    expect(content).toContain('const __cloned = __tpl.content.firstElementChild')
    expect(content).not.toContain('`<svg>')
  })
})
