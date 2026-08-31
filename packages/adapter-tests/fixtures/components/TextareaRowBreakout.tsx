'use client'

// #2765 regression fixture: a keyed row's CHILDLESS controlled
// `<textarea value={...} />`, value containing `</textarea>`.
//
// The `add` button matters: row 1 arrives via SSR/hydration (already
// correct on every leg); only row 2 goes through the reconciler's
// `createRow` — the one path the bug is in. A fixture asserting row 1
// alone would pass with or without the defect.

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
