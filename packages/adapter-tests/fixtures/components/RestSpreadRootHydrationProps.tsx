'use client'

// Test fixture (#3845): the keys of a closed-type `...rest` spread onto the
// root element reach the client only through that spread. The client reads
// each one live as `_p.<key>` and drops the attribute when it reads nullish,
// so the hydration payload (`bf-p`) must carry `tone` and `size`.

import { createSignal } from '@barefootjs/client'

export function RestSpreadRootHydrationProps({ label, ...rest }: { label: string; tone?: string; size?: number }) {
  const [on, setOn] = createSignal(false)
  return <button {...rest} onClick={() => setOn(!on())}>{label}{on() ? '!' : ''}</button>
}
