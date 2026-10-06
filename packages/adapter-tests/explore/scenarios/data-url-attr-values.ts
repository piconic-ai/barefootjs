/**
 * Scenario: dynamic values on `data-` attributes the Go template engine
 * would classify as URL / CSS (`data-src`, `data-url`, `data-style`) (#3326).
 * Every value must render, hydrate and update as plain attribute text —
 * spaces, a non-web scheme, `"` / `&`, and the empty string — exactly like
 * the `data-state` control. `next` cycles through those values, so each
 * transition is compared against a fresh render of the value it lands on.
 */

import type { Scenario } from '../scenario'

const VALUES = ['a b', 'javascript:x', 'q"&\'<', ''] as const

export interface DataUrlAttrValuesState {
  value: string
}

export type DataUrlAttrValuesAction = 'next' | 'reset'

export const dataUrlAttrValues: Scenario<DataUrlAttrValuesState, DataUrlAttrValuesAction> = {
  id: 'data-url-attr-values',
  description: 'URL / CSS-classified data-* attributes keep plain-text values through SSR, hydration and updates',
  componentName: 'DataUrlAttrValues',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type State = { value: string }

const VALUES = ${JSON.stringify(VALUES)}

export function DataUrlAttrValues({ initial }: { initial: State }) {
  const [value, setValue] = createSignal(initial.value)
  return (
    <div>
      <p data-src={value()} data-url={value()} data-style={value()} data-image-url={\`/i/\${value()}\`} data-state={value()}>v</p>
      <button data-action="next" onClick={() => setValue(VALUES[(VALUES.indexOf(value()) + 1) % VALUES.length])}>next</button>
      <button data-action="reset" onClick={() => setValue(VALUES[0])}>reset</button>
    </div>
  )
}
`,
  initialState: { value: VALUES[0] },
  actions: ['next', 'reset'],
  stateSignals: ['value'],
  reduce(state, action) {
    switch (action) {
      case 'next':
        return { value: VALUES[(VALUES.indexOf(state.value as (typeof VALUES)[number]) + 1) % VALUES.length] }
      case 'reset':
        return { value: VALUES[0] }
    }
  },
  bounds: { maxDepth: 4 },
}
