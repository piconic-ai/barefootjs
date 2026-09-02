import { createFixture } from '../src/types'

/**
 * The keyed-loop-row form of a controlled `<input value={signal()}>`
 * rendered once per row — the inverse direction of
 * `loop-row-controlled-textarea.ts` (#2756).
 *
 * `<input>`'s `value` is NOT `clientOnly` — every adapter's SSR bakes a
 * literal `value="…"` attribute here, same as outside a loop. The client
 * effect that keeps it live only ever assigns the DOM PROPERTY (#2716),
 * never `setAttribute`, so `buildLoopSkeletonTemplate`'s hoisted
 * shared-`<template>` fast path used to omit the attribute from a
 * freshly-cloned row exactly like it would an ordinary reactive attribute —
 * but nothing ever restored it, unlike an attribute-reflected bind whose
 * effect calls `setAttribute` on its eager first run. A row rebuilt by the
 * reconciler after a row-count change ended up permanently missing the
 * attribute a hydration-reused row keeps forever. The builder-side pin is
 * `packages/jsx/src/__tests__/issue-2756-input-skeleton-bails.test.ts` (the
 * skeleton fast path isn't reachable through the fixture-render harness);
 * this fixture pins the shape's SSR + CSR-template output the builder has
 * to agree with.
 */
export const fixture = createFixture({
  id: 'loop-row-controlled-input',
  description: 'Controlled input inside a keyed loop row SSRs its value as a literal attribute (#2756)',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function DraftRows() {
  const [draft, setDraft] = createSignal('hello')
  const [rows] = createSignal([1, 2])
  return (
    <ul>
      {rows().map(r => (
        <li key={r}>
          <input value={draft()} onInput={(e) => setDraft(e.target.value)} />
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="1"><input bf="s0" value="hello"></li>
      <li data-key="2"><input bf="s0" value="hello"></li>
    </ul>
  `,
})
