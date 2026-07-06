/**
 * Hoisted shared-template fast path for `mapArray` loop bodies (perf).
 *
 * Background: the legacy emission builds a fresh `document.createElement
 * ('template')` + interpolated `innerHTML` per row inside `renderItem`,
 * re-parsing the same HTML shape on every iteration and re-computing
 * `escapeText`/`escapeAttr` for values a loop-child `createEffect` is about
 * to overwrite anyway on its eager first run (double work). When the loop
 * body is a statically-analyzable single-root element tree whose dynamic
 * parts are text/attribute slots already covered by a loop-child effect,
 * `buildLoopSkeletonTemplate` (html-template.ts) builds a STATIC-ONLY
 * skeleton once, and the stringifier (`control-flow/stringify/loop.ts`)
 * declares it before the `mapArray` call and clones from it per row instead.
 *
 * These tests pin:
 *   - the fast path fires for the classic js-framework-benchmark row shape
 *     (reactive class attr + two reactive text slots + static cells)
 *   - the hoisted template contains no `${...}` interpolations and no
 *     escapeText/escapeAttr calls
 *   - the fast path refuses (falls back to the legacy per-row emission) for
 *     an inline ternary/conditional body
 *   - the fast path refuses for a loop body carrying a `{...spread}` attr
 *   - an SVG loop body either takes the fast path with the correct
 *     `<svg>`-wrapped clone, or falls back — never silently mis-namespaces
 *   - the SSR-mirror `template:` lambda is unaffected either way (still
 *     carries the fully interpolated per-row template with escaping)
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compile(source: string, filename: string): { clientJs: string; template: string } {
  const result = compileJSX(source, filename, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  const template = result.files.find(f => f.type === 'markedTemplate')
  expect(clientJs).toBeDefined()
  expect(template).toBeDefined()
  return { clientJs: clientJs!.content, template: template!.content }
}

describe('hoisted loop-body skeleton template (perf)', () => {
  test('fast path applies to the classic benchmark row shape', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface RowData { id: number; label: string }

      export function Bench() {
        const [rows, setRows] = createSignal<RowData[]>([])
        const [selected, setSelected] = createSignal<number>(0)
        return (
          <table>
            <tbody>
              {rows().map(row => (
                <tr key={row.id} className={selected() === row.id ? 'danger' : ''}>
                  <td className="col-md-1">{row.id}</td>
                  <td className="col-md-4">
                    <a className="lbl" onClick={() => setSelected(row.id)}>{row.label}</a>
                  </td>
                  <td className="col-md-6"></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    `
    const { clientJs, template } = compile(source, 'Bench.tsx')

    // Hoisted declaration present, before the mapArray call.
    const declIdx = clientJs.indexOf('.innerHTML = `<tr')
    const mapArrayIdx = clientJs.indexOf('mapArray(')
    expect(declIdx).toBeGreaterThan(-1)
    expect(mapArrayIdx).toBeGreaterThan(-1)
    expect(declIdx).toBeLessThan(mapArrayIdx)

    // renderItem clones from the hoisted template instead of re-parsing
    // innerHTML per row.
    expect(clientJs).toMatch(/const __el = __existing \?\? __tpl_\w+\.content\.firstElementChild\.cloneNode\(true\)/)

    // The hoisted template itself carries no interpolations and no dynamic
    // `class` attribute (that's covered by the reactive-attr createEffect).
    const declMatch = clientJs.match(/\.innerHTML = `(<tr[^\n]*<\/tr>)`/)
    expect(declMatch).not.toBeNull()
    const skeleton = declMatch![1]
    expect(skeleton).not.toContain('${')
    // The `<tr>` root's own reactive `class` attr is omitted entirely
    // (covered by the reactive-attr createEffect) — only its static
    // descendants (`<td class="col-md-1">`, `<a class="lbl">`) keep theirs.
    expect(skeleton).toMatch(/^<tr data-key="" bf="\w+">/)
    expect(skeleton).not.toContain('danger')
    expect(skeleton).toContain('data-key=""')
    expect(skeleton).toContain('<!--bf:')
    // Text slots are empty between their markers.
    expect(skeleton).toMatch(/<!--bf:s\d+--><!--\/-->/)

    // Static content (the empty col-md-6 cell, the "x"-less <a> shell) is
    // still present verbatim.
    expect(skeleton).toContain('col-md-6')

    // No escaping helpers in the `init`/renderItem body now that the per-row
    // interpolation is gone (only the reactive createEffects remain, which
    // use textContent/setAttribute — inherently safe). The CSR-mount
    // `template:` lambda passed to `hydrate(...)` is a SEPARATE SSR-mirror
    // string (unchanged by this optimization — see below), so scope the
    // assertion to the code before that lambda.
    const initBody = clientJs.slice(0, clientJs.indexOf('hydrate('))
    expect(initBody).not.toContain('escapeAttr(')
    expect(initBody).not.toContain('escapeText(')

    // SSR/adapter markedTemplate output is untouched by this optimization —
    // still the reactive `className={...}` expression verbatim (the
    // TestAdapter emits JSX, not a string template, so there's no
    // escapeAttr/escapeText call here — that's a CSR-string-template-only
    // concern, checked below).
    expect(template).toContain("className={`${selected() === row.id ? 'danger' : ''}`}")

    // The `template:` lambda embedded in the CSR bundle (used for
    // from-scratch, no-existing-DOM mounts) is a separate SSR-mirror string
    // and stays fully interpolated + escaped, unaffected by the hoisted
    // renderItem clone path above.
    const csrMirror = clientJs.slice(clientJs.indexOf('hydrate('))
    expect(csrMirror).toContain('escapeAttr(')
    expect(csrMirror).toContain('escapeText(')
  })

  test('falls back to per-row emission for an inline conditional/ternary body', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function List() {
        const [items, setItems] = createSignal<string[]>([])
        return (
          <ul onClick={() => setItems(prev => [...prev, 'x'])}>
            {items().map(item => (
              <li key={item}>
                {item.length > 3 ? <b>{item}</b> : <i>{item}</i>}
              </li>
            ))}
          </ul>
        )
      }
    `
    const { clientJs } = compile(source, 'List.tsx')
    expect(clientJs).toContain('mapArray(')
    // No hoisted-template declaration — the fast path refused.
    expect(clientJs).not.toMatch(/__tpl_\w+ = document\.createElement\('template'\)/)
  })

  test('falls back to per-row emission for a spread attribute in the loop body', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Item { id: string; extra: Record<string, string> }

      export function List() {
        const [items, setItems] = createSignal<Item[]>([])
        return (
          <ul onClick={() => setItems([])}>
            {items().map(item => (
              <li key={item.id} {...item.extra}>{item.id}</li>
            ))}
          </ul>
        )
      }
    `
    const { clientJs } = compile(source, 'SpreadList.tsx')
    expect(clientJs).toContain('mapArray(')
    expect(clientJs).not.toMatch(/__tpl_\w+ = document\.createElement\('template'\)/)
  })

  test('SVG loop body either hoists with the correct <svg> wrap, or falls back — never mis-namespaced', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Point { id: string; x: number; y: number }

      export function Dots() {
        const [points, setPoints] = createSignal<Point[]>([])
        return (
          <svg onClick={() => setPoints([])}>
            {points().map(p => (
              <circle key={p.id} cx={p.x} cy={p.y} r="4" />
            ))}
          </svg>
        )
      }
    `
    const { clientJs } = compile(source, 'Dots.tsx')
    expect(clientJs).toContain('mapArray(')
    // A `<circle>` root with only dynamic attrs (all covered by reactive-attr
    // createEffects) and a literal `r="4"` is exactly the shape the fast path
    // proves safe — this DOES hoist, and it must wrap in a synthetic `<svg>`
    // (mirroring `templateRootIsSvg`, #135/#1088) so the cloned node keeps the
    // SVG namespace instead of becoming an inert `HTMLUnknownElement`.
    const hoisted = /__tpl_\w+\.innerHTML = `<svg>(.*?)<\/svg>`/.exec(clientJs)
    expect(hoisted).not.toBeNull()
    expect(hoisted![1]).not.toContain('${')
    expect(hoisted![1]).toContain('<circle')
    expect(clientJs).toMatch(/\.content\.firstElementChild\.firstElementChild\.cloneNode\(true\)/)
  })

  test('fast path refuses (conservative fallback) whenever it cannot prove the wrap safe', () => {
    // Defensive net: whatever shape a future fixture exercises, the compiler
    // must never emit an un-wrapped hoisted template for an SVG root (that
    // would silently mis-namespace the clone) — either it hoists WITH the
    // `<svg>` wrap, or it doesn't hoist at all.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Seg { id: string; d: string }
      export function Paths() {
        const [segs, setSegs] = createSignal<Seg[]>([])
        return (
          <svg onClick={() => setSegs([])}>
            {segs().map(s => (
              <path key={s.id} d={s.d} />
            ))}
          </svg>
        )
      }
    `
    const { clientJs } = compile(source, 'Paths.tsx')
    const unwrappedHoist = /__tpl_\w+\.innerHTML = `<path/.test(clientJs)
    expect(unwrappedHoist).toBe(false)
  })
})
