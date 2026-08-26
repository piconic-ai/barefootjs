/**
 * DOM state capture vocabulary for the oracle harness (#2481).
 *
 * `normalizeHTML` (`src/jsx-runner.ts`) already answers "is the *markup*
 * the same across renders" for the existing fixture-hydrate suite. The
 * oracle suite additionally needs "is the *live DOM state* the same" —
 * `<select>`'s `selectedIndex`, `<input type=checkbox>`'s `checked` /
 * `indeterminate`, `<details>`'s `open`, `<textarea>`/`<input>`'s
 * `value` — none of which round-trip through `innerHTML` once a user (or
 * the runtime) has touched them, so a structural HTML diff alone cannot
 * catch a hydration path that reflects the wrong live value.
 *
 * `captureDomState` walks `document.body` and returns both halves: the
 * raw (un-normalized) `innerHTML` for structural comparison by the
 * caller, and a flat table of whichever of the five IDL properties above
 * are actually defined on each element, keyed by an id-independent
 * **element path** (root-to-node tag names + same-tag sibling index) so
 * a CSR leg's runtime-random scope id doesn't make two otherwise-
 * identical trees compare as different elements.
 */

import type { Page } from '@playwright/test'

export interface DomStateEntry {
  /** Root-to-node path, e.g. `BODY/DIV[0]/SELECT[0]`. Not id-based — see module docstring. */
  path: string
  /** One of `value` / `checked` / `indeterminate` / `selectedIndex` / `open`. */
  prop: string
  value: unknown
}

export interface DomStateSnapshot {
  /** Raw `document.body.innerHTML` — normalize before comparing across adapters/legs. */
  html: string
  /** Every defined state property, in document order. */
  state: DomStateEntry[]
}

/**
 * The IDL properties this oracle tracks. Deliberately property reads
 * (`el.checked`), not attribute reads (`el.getAttribute('checked')`):
 * the whole point is to catch a runtime that patches the attribute but
 * leaves the live property (or vice versa) stale after user interaction.
 */
const STATE_PROPS = ['value', 'checked', 'indeterminate', 'selectedIndex', 'open'] as const

/**
 * Capture `document.body`'s structural HTML plus its live DOM state
 * table. Runs entirely inside `page.evaluate` — the walker and its
 * helpers must stay self-contained (no closure over outer-scope
 * bindings) since Playwright serializes the function body to the page.
 */
export async function captureDomState(page: Page): Promise<DomStateSnapshot> {
  return page.evaluate(stateProps => {
    const state: Array<{ path: string; prop: string; value: unknown }> = []

    // `<script>` elements are excluded from both the walk and the HTML
    // below: they are HOST-PAGE bootstrapping (`fixture-host.ts`'s
    // hydration/boot `<script>`), not fixture-rendered content, and their
    // presence/position differs by construction across the three host
    // modes — `'hydrate'` mode's script is a body child (matching real
    // `bf build` output) while `'csr-mount'`'s lives in `<head>` (so a
    // leftover body script wouldn't itself look like a structural diff —
    // see `fixture-host.ts`). Comparing them would be comparing the
    // harness, not the fixture.
    function walk(el: Element, path: string): void {
      for (const prop of stateProps) {
        // biome-ignore lint/suspicious/noExplicitAny: reading an arbitrary IDL property by name
        const value = (el as any)[prop]
        if (value !== undefined) {
          state.push({ path, prop, value })
        }
      }
      const tagCounts = new Map<string, number>()
      for (const child of Array.from(el.children)) {
        if (child.tagName === 'SCRIPT') continue
        const tag = child.tagName
        const index = tagCounts.get(tag) ?? 0
        tagCounts.set(tag, index + 1)
        walk(child, `${path}/${tag}[${index}]`)
      }
    }

    walk(document.body, 'BODY')
    const bodyClone = document.body.cloneNode(true) as HTMLElement
    for (const script of Array.from(bodyClone.querySelectorAll('script'))) {
      script.remove()
    }
    return { html: bodyClone.innerHTML, state }
  }, STATE_PROPS)
}

/**
 * Human-readable state-table diff between two captures (structural HTML
 * is NOT compared here — callers normalize and compare `.html` with
 * `normalizeHTML`/`stripConditionalMarkersForCrossAdapter` themselves,
 * since the right normalization is comparison-specific). Returns one
 * line per path+prop whose value differs (including "only present on
 * one side"), sorted for deterministic output; an empty array means the
 * two state tables agree.
 */
export function diffDomState(a: DomStateSnapshot, b: DomStateSnapshot): string[] {
  const key = (e: DomStateEntry): string => `${e.path}#${e.prop}`
  const toMap = (s: DomStateSnapshot): Map<string, unknown> => new Map(s.state.map(e => [key(e), e.value]))
  const am = toMap(a)
  const bm = toMap(b)
  const allKeys = new Set([...am.keys(), ...bm.keys()])
  const diffs: string[] = []
  for (const k of [...allKeys].sort()) {
    const av = am.get(k)
    const bv = bm.get(k)
    const aHas = am.has(k)
    const bHas = bm.has(k)
    if (aHas !== bHas || JSON.stringify(av) !== JSON.stringify(bv)) {
      diffs.push(`${k}: ${aHas ? JSON.stringify(av) : '<absent>'} !== ${bHas ? JSON.stringify(bv) : '<absent>'}`)
    }
  }
  return diffs
}
