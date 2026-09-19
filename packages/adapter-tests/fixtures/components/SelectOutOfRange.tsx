'use client'

// Browser-oracle fixture: a controlled `<select>` whose bound value matches
// none of its options, for the real-browser legs (`oracle.playwright.ts`)
// the plain corpus fixture `select-value-no-match-ssr` never reaches.
//
// #2852 (fixing #2758) made SSR emit a hidden, disabled placeholder
// `<option value="">` that is `selected` when nothing else is, so the
// server no longer shows the first option. What remains is the live DOM
// STATE: the server-rendered select has the placeholder selected
// (`selectedIndex` 0), while hydration's controlled-value effect assigns
// the out-of-range value to `select.value`, which the browser resolves to
// no selection at all (`selectedIndex` -1). Visually both are blank; the
// snap / three-point oracles compare `selectedIndex` and see the split.
// Registered as the `select-out-of-range-selected-index` limitation.

import { createSignal } from '@barefootjs/client'

export function SelectOutOfRange() {
  const [val, setVal] = createSignal(7)
  return (
    <div>
      <select value={String(val())} onChange={e => setVal(Number(e.target.value))}>
        <option value="0">Zero</option>
        <option value="1">One</option>
      </select>
      <p class="current">{val()}</p>
    </div>
  )
}
