/**
 * #2756 (input sub-mechanism) — the inverse of
 * `issue-2756-loop-row-honors-client-only.test.ts`.
 *
 * `<textarea>`/`<select>`'s controlled `value` is `clientOnly` at the IR
 * level (`lowerFormControlValueSsr`): SSR never bakes an attribute for it,
 * so a client-built row must not either — that gap was closed by #2764.
 *
 * `<input>`'s `value`/`checked` are NOT `clientOnly` — SSR bakes a literal
 * `value="…"` / `checked` attribute, same as any other adapter. The client
 * effect that keeps it live only ever assigns the DOM PROPERTY (#2716,
 * `emitAttrUpdate`'s value/boolean-attr branches), never `setAttribute`.
 * `buildLoopSkeletonTemplate`'s hoisted shared-`<template>` fast path used
 * to treat this identically to an ordinary reactive attribute — omit it
 * from the skeleton and trust the effect's eager first run to restore it.
 * That trust is misplaced here: the effect never touches the attribute, so
 * a row cloned from the skeleton never gets it, while a hydration-reused
 * (SSR-origin) row keeps it forever — the two legs permanently disagree the
 * moment a row-count change makes both coexist in one list.
 *
 * The fix refuses the skeleton fast path entirely for a row carrying a
 * non-`clientOnly` property-only bind, falling back to the per-row
 * interpolated template (`irToHtmlTemplate`), which already bakes the
 * attribute correctly — so this test asserts the attribute IS present,
 * the opposite assertion from the textarea/select test.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJs(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  return result.files.find(f => f.type === 'clientJs')!.content
}

/** The `__tpl.innerHTML = \`…\`` / `insert(... html: \`…\`)` builder strings. */
function builderTemplates(content: string): string[] {
  return [...content.matchAll(/innerHTML = `([^`]*)`/g)].map(m => m[1])
    .concat([...content.matchAll(/html: `([^`]*)`/g)].map(m => m[1]))
}

describe('#2756 — a controlled <input> row bails out of the skeleton fast path', () => {
  test('a keyed-loop row builder bakes the controlled input `value` attribute, matching SSR', () => {
    const content = clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function LoopInput() {
        const [val, setVal] = createSignal(0)
        const [items] = createSignal([1, 2, 3])
        return (
          <ul>
            {items().filter(i => i > 0).map(i => (
              <li key={i}>
                <input value={val()} onInput={() => setVal(1)} />
              </li>
            ))}
          </ul>
        )
      }
    `)
    const rowTemplates = builderTemplates(content).filter(t => t.includes('<input'))
    expect(rowTemplates.length).toBeGreaterThan(0)
    for (const tpl of rowTemplates) {
      expect(tpl).toContain(`value="' + escapeAttr(val())`)
    }
    // The effect that keeps the live property in sync is still emitted —
    // the attribute is baked in ADDITION to it, not instead of it.
    expect(content).toContain(`'value' in`)
    // The hoisted shared-template fast path (perf, #2143) must not have
    // been used for this loop — its declaration is the tell.
    expect(content).not.toContain('__tpl_')
  })

  test('a keyed-loop row builder bakes the controlled checkbox `checked` attribute, matching SSR', () => {
    const content = clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function LoopCheckbox() {
        const [on, setOn] = createSignal(true)
        const [items] = createSignal([1, 2, 3])
        return (
          <ul>
            {items().filter(i => i > 0).map(i => (
              <li key={i}>
                <input type="checkbox" checked={on()} onChange={() => setOn(false)} />
              </li>
            ))}
          </ul>
        )
      }
    `)
    const rowTemplates = builderTemplates(content).filter(t => t.includes('<input'))
    expect(rowTemplates.length).toBeGreaterThan(0)
    for (const tpl of rowTemplates) {
      expect(tpl).toContain(`on() ? 'checked' : ''`)
    }
    expect(content).not.toContain('__tpl_')
  })

  test('an ordinary reactive attribute on the same row is unaffected (still eligible for the skeleton fast path elsewhere)', () => {
    // Control: a loop row with NO property-only bind still uses the
    // hoisted skeleton fast path — the fix is scoped to rows that actually
    // carry one, not a blanket disable.
    const content = clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function LoopPlain() {
        const [items] = createSignal([1, 2, 3])
        return (
          <ul>
            {items().filter(i => i > 0).map(i => (
              <li key={i} data-n={i}>{i}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(content).toContain('__tpl_')
  })
})
