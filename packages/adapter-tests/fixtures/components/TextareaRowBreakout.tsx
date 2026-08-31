'use client'

// Test fixture (#2765): a keyed `.map()` row containing a CHILDLESS
// controlled `<textarea value={...} />`, whose value carries a literal
// `</textarea>` sequence.
//
// `lowerFormControlValueSsr` (`packages/jsx/src/jsx-to-ir.ts`) lowers that
// value into element CONTENT and attaches two forms of the expression:
// `expr` for the SSR adapters, whose engines escape text children natively,
// and `templateExpr` wrapped in `escapeText` for client-side string
// building. The issue reports that the loop-row builder interpolates `expr`
// raw, so a value containing `</textarea>` would close the element early on
// a row the RECONCILER builds — while SSR, hydration and the CSR mount
// template all stay correct.
//
// The `add` button is what makes that observable: the first row arrives via
// SSR and is adopted at hydration, and only the second is constructed by
// `createRow`. A fixture asserting first render alone passes with or
// without the defect, which is exactly what the issue warns about.
//
// Only the childless spellings reach this lowering at all — with children
// present it returns before injecting anything (measured on #2765).

import { createSignal } from '@barefootjs/client'

const PAYLOAD = 'a</textarea><b class="broke">X</b>'

export function TextareaRowBreakout() {
  const [value, setValue] = createSignal(PAYLOAD)
  const [ids, setIds] = createSignal([1])

  return (
    <div>
      <button className="add" onClick={() => setIds([1, 2])}>add</button>
      <ul>
        {ids().map((id) => (
          <li key={id}>
            <textarea className="ta" value={value()} onInput={() => setValue(PAYLOAD)} />
          </li>
        ))}
      </ul>
    </div>
  )
}
