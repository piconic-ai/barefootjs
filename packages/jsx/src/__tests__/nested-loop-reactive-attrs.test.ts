/**
 * BarefootJS Compiler — Reactive attributes on a NESTED `.map()` body (#135).
 *
 * Background: top-level `.map()` already wires `createEffect` for
 * signal-driven attributes on the loop body's root element (covered by
 * `reactive-attrs-in-map.test.ts`). Until #135 the same plumbing was
 * missing for INNER loops — `collectInnerLoops` collected reactive
 * texts but no reactive attrs, the per-item renderItem only emitted
 * `__rt.textContent = …` effects, and `style` / `data-*` / `className`
 * bindings stayed frozen at the SSR value.
 *
 * Surfaced by the board demo's drag preview (#135 Concrete Additions)
 * where `style={{'--drag-opacity': draggingTaskId() === task.id ? '0.4'
 * : '1'}}` on a nested `tasks.map()` root never updated.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('reactive attributes inside a nested .map() body (#135)', () => {
  test('object-style binding on a nested .map() root emits per-item createEffect', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Col { id: string; tasks: { id: number; title: string }[] }

      export function Board() {
        const [draggingId, setDraggingId] = createSignal<number | null>(null)
        const [cols, setCols] = createSignal<Col[]>([])
        return (
          <div>
            {cols().map(col => (
              <div key={col.id}>
                {col.tasks.map(task => (
                  <div
                    key={task.id}
                    style={{ '--drag-opacity': draggingId() === task.id ? '0.4' : '1' }}
                    data-dragging={draggingId() === task.id ? 'true' : 'false'}
                    onPointerDown={() => setDraggingId(task.id)}
                  >{task.title}</div>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Board.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // The per-item renderItem callback for the inner `tasks.map(...)`
    // must emit `createEffect` blocks that re-evaluate the reactive
    // `style` and `data-dragging` bindings on the inner-loop root.
    expect(content).toContain("setAttribute('style'")
    expect(content).toContain("setAttribute('data-dragging'")
    expect(content).toContain('styleToCss')
    // Both effects must run inside the inner mapArray's renderItem (so
    // they capture `task` as the inner-loop accessor — `task()` rather
    // than the module-level closure).
    expect(content).toMatch(/createEffect\(\(\) => \{[\s\S]*?styleToCss\([\s\S]*?task\(\)\.id/)
  })

  test('non-style reactive attribute (className) wires up too', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Row = { id: number; label: string }
      type Group = { id: string; rows: Row[] }

      export function Tbl() {
        const [active, setActive] = createSignal<number | null>(null)
        const [groups] = createSignal<Group[]>([])
        return (
          <div>
            {groups().map(g => (
              <div key={g.id}>
                {g.rows.map(r => (
                  <span key={r.id} className={active() === r.id ? 'on' : 'off'}>{r.label}</span>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Tbl.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'clientJs')!.content

    // className uses the kebab `class` attribute name once routed
    // through `toHtmlAttrName`.
    expect(content).toContain("setAttribute('class'")
    expect(content).toContain('active()')
  })

  test('`attr={expr || undefined}` uses truthy check, not `!= null`', () => {
    // Regression for the calendar break: `data-outside={day.isOutside ||
    // undefined}` is normalised by jsx-to-ir to bare `day.isOutside` +
    // `presenceOrUndefined: true`. Without the dedicated emit shape,
    // the generic `__v != null` branch fires for `false` and writes
    // `data-outside="false"`, which then trips Playwright selectors
    // like `:not([data-outside])`.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Cell = { id: number; isOff: boolean; label: string }
      type Row = { id: string; cells: Cell[] }

      export function Grid() {
        const [hover, setHover] = createSignal<number | null>(null)
        const [rows] = createSignal<Row[]>([])
        return (
          <div>
            {rows().map(r => (
              <div key={r.id}>
                {r.cells.map(c => (
                  <button
                    key={c.id}
                    data-off={c.isOff || undefined}
                    aria-pressed={hover() === c.id || undefined}
                  >{c.label}</button>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Grid.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'clientJs')!.content

    // `data-off` uses the truthy-check shape (no `__v != null` for this
    // attribute) so a concrete `false` removes the attribute.
    expect(content).toMatch(/createEffect\(\(\) => \{[\s\S]*?if \(c\(\)\.isOff\)\s*\S+\.setAttribute\('data-off',\s*''\)/)
    // aria-* keeps the explicit "true" value per WAI-ARIA.
    expect(content).toContain("setAttribute('aria-pressed', 'true')")
  })

  test('inner-loop event handler keeps working alongside reactive attrs', () => {
    // Regression guard — make sure adding the reactive-attr emission
    // didn't break the existing inner-loop event-handler emission path.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Item = { id: number; label: string }

      export function L() {
        const [sel, setSel] = createSignal<number | null>(null)
        const [groups] = createSignal<{ id: string; items: Item[] }[]>([])
        return (
          <div>
            {groups().map(g => (
              <div key={g.id}>
                {g.items.map(it => (
                  <button
                    key={it.id}
                    className={sel() === it.id ? 'sel' : ''}
                    onClick={() => setSel(it.id)}
                  >{it.label}</button>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'L.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'clientJs')!.content
    expect(content).toContain("addEventListener('click'")
    expect(content).toContain("setAttribute('class'")
  })

  test('JS comment with apostrophe inside an inner-loop style object does not swallow loop-param refs', () => {
    // Regression for the silently-dropped `task()` wrap (#135 board demo
    // drag preview). The compiler routes reactive-attr expressions
    // through `wrapLoopParamAsAccessor`, whose string-context-aware
    // replacement walked `'`, `"`, `` ` `` — but ignored JS comments. An
    // apostrophe in an inline `//` comment inside the `style={{…}}`
    // object literal (e.g. `they're "holding"`) was interpreted as the
    // start of a string literal; the scanner then read up to the next
    // `'` (the next CSS-var key) and skipped every loop-param reference
    // in between. Result: `task.id` stayed unwrapped, the effect closed
    // over the loop-callback's parameter at first iteration, and the
    // style attribute never reacted.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Task = { id: number }
      type Col = { id: string; tasks: Task[] }

      export function B() {
        const [dragId, setDragId] = createSignal<number | null>(null)
        const [cols] = createSignal<Col[]>([])
        return (
          <div>
            {cols().map(col => (
              <div key={col.id}>
                {col.tasks.map(task => (
                  <div
                    key={task.id}
                    style={{
                      // user can tell at a glance which card they're "holding"
                      '--drag-opacity': dragId() === task.id ? '0.4' : '1',
                      '--drag-scale': dragId() === task.id ? '1.03' : '1',
                    }}
                  >{task.id}</div>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'B.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'clientJs')!.content

    // The compiler emits the style object literally in TWO places: the
    // outer-loop SSR template (raw `task.id`, no per-item wrap needed)
    // and the inner-loop reactive `createEffect` (must be `task().id`
    // to subscribe to the per-item accessor). The bug we're locking
    // down is purely in the createEffect emission, so scope to that.
    const effectMatch = content.match(
      /createEffect\(\(\) => \{[\s\S]*?styleToCss\(\{[\s\S]*?\}\)[\s\S]*?__ta_s\d+\.setAttribute\('style'/,
    )
    expect(effectMatch).not.toBeNull()
    const effectBody = effectMatch![0]
    // Inside the createEffect, every loop-param ref to `task.id` MUST
    // be wrapped — otherwise the closure pins to the first iteration's
    // `task` argument and the effect never re-runs per-item.
    expect(effectBody).not.toMatch(/\btask\.id\b/)
    expect(effectBody.match(/task\(\)\.id/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  test('block comment with quotes inside an inner-loop style object is also skipped', () => {
    // Mirror of the line-comment regression for `/* … */` form. The same
    // string-walker that confused `//` comments would also have missed
    // block comments. The fix skips both forms; this test pins the
    // block-comment branch in place.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Cell = { id: number }
      type Row = { id: string; cells: Cell[] }

      export function G() {
        const [hover, setHover] = createSignal<number | null>(null)
        const [rows] = createSignal<Row[]>([])
        return (
          <div>
            {rows().map(r => (
              <div key={r.id}>
                {r.cells.map(c => (
                  <div
                    key={c.id}
                    style={{
                      /* note: c.id is the cell's "stable" key */
                      '--w': hover() === c.id ? '8' : '4',
                    }}
                  >{c.id}</div>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'G.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'clientJs')!.content
    const effectMatch = content.match(
      /createEffect\(\(\) => \{[\s\S]*?styleToCss\(\{[\s\S]*?\}\)[\s\S]*?__ta_s\d+\.setAttribute\('style'/,
    )
    expect(effectMatch).not.toBeNull()
    const effectBody = effectMatch![0]
    // After the fix, `c.id` in the active expression IS wrapped to
    // `c().id`. The `c.id` reference inside the block comment is left
    // intact because the walker skips it — that's a side-effect of
    // the comment-aware scan, but the strict assertion is just that
    // the live conditional sees the wrapped accessor.
    expect(effectBody).toContain('c().id')
  })

  test('reactive text child of a triple-nested (depth-2) inner loop gets an update effect (#2264)', () => {
    // `collectInnerLoops` gated `reactiveTexts` collection on whether the
    // loop's array expression referenced the OUTERMOST loop param
    // (`outerLoopParam`, fixed at the top-level `.map()` call and never
    // updated while descending). At nesting depth 2 the innermost loop's
    // array (`band.panels`) only references its immediate parent (`band`),
    // not the top-level param (`page`), so the gate was always false and
    // the text-child effect was silently dropped — while the sibling
    // `className` attribute effect on the SAME element (ungated) worked
    // fine. Only depth-1 nesting happened to pass the gate, masking the bug.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Panel = { id: number; text: string; cls: string }
      type Band = { id: string; panels: Panel[] }
      type Page = { id: string; bands: Band[] }

      export function Doc() {
        const [pages] = createSignal<Page[]>([])
        return (
          <div>
            {pages().map(page => (
              <div key={page.id}>
                {page.bands.map(band => (
                  <div key={band.id}>
                    {band.panels.map(panel => (
                      <div key={panel.id} className={panel.cls}>{panel.text}</div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Doc.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'clientJs')!.content

    // The innermost loop's per-item renderItem must emit BOTH a
    // reactive-text effect for `panel.text` and a reactive-attr effect
    // for `panel.cls` — the bug dropped only the former.
    expect(content).toMatch(/createEffect\(\(\) => \{[\s\S]*?\.textContent = String\(panel\(\)\.text\)/)
    expect(content).toContain("setAttribute('class'")
  })

  test('reactive text child of a triple-nested inner loop read through an opaque helper gets an update effect (#2282)', () => {
    // #2264 fixed the case where `classifyReactivity` proves the text
    // reactive via the loop-param path (bare `panel.text`). It left a
    // sibling gap: `collectLoopChildReactiveTexts` had no Solid-style
    // AST-flag fallback, so a text read through an opaque helper the
    // classifier can't see through (`labelAt(pi)` where `const labelAt =
    // (i) => labels()[i]`) still silently dropped its update effect — while
    // `collectLoopChildReactiveAttrs` already had that fallback (#1673,
    // see `reactive-attrs-in-map.test.ts`), so the sibling `className`
    // effect on the SAME element kept working. Reported as #2282 ("child
    // inlined into a parent island drops the innermost reactive text
    // effect"); the issue's own literal `{panel.text}` repro snippet
    // doesn't reproduce it (that shape is exactly what #2264 already
    // fixed) — this test pins the actual asymmetry root-caused during
    // investigation, using the opaque-helper shape that does reproduce.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Panel = { id: number; cls: string }
      type Band = { id: string; panels: Panel[] }
      type Page = { id: string; bands: Band[] }

      export function Doc2() {
        const [pages] = createSignal<Page[]>([])
        const [labels] = createSignal<string[]>([])
        const labelAt = (i: number) => labels()[i]
        return (
          <div>
            {pages().map(page => (
              <div key={page.id}>
                {page.bands.map(band => (
                  <div key={band.id}>
                    {band.panels.map((panel, pi) => (
                      <div key={panel.id} className={panel.cls}>{labelAt(pi)}</div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Doc2.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'clientJs')!.content

    // The helper call must appear inside a createEffect alongside the
    // textContent write — `labelAt(` also appears in the static template
    // clone, so asserting it independently would pass even with the
    // effect missing (the exact regression here).
    expect(content).toMatch(/createEffect\(\(\) => \{[\s\S]*?\.textContent = String\(labelAt\(pi\)\)/)
    expect(content).toContain("setAttribute('class'")
  })
})
