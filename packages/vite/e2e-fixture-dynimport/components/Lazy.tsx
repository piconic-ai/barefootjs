'use client'
import { createSignal } from '@barefootjs/client'

// Module scope: a lazy loader whose dynamic `import()` reaches a sibling of
// the `components` dir. Emitted verbatim into the template by
// `generateModuleScopeDeclarations`.
let modPromise: Promise<typeof import('../lib/heavy')> | null = null
const loadHeavy = () => {
  if (!modPromise) modPromise = import('../lib/heavy')
  return modPromise
}

export function Lazy() {
  const [n, setN] = createSignal(0)
  // Component scope: the same specifier inside an event handler.
  const onClick = async () => {
    const mod = await import('../lib/heavy')
    setN(mod.heavy())
  }
  const onDblClick = async () => {
    const mod = await loadHeavy()
    setN(mod.heavy())
  }
  return <button onClick={onClick} onDblClick={onDblClick}>{n()}</button>
}
