/**
 * `effects-and-on-mounts` phase — emit user-written `createEffect` and
 * `onMount` calls (in source order).
 *
 * Effects with a `captureName` keep their `const <name> = createEffect(...)`
 * form so user code calling the captured disposer (or any future return
 * value) still resolves at runtime.
 */

import type { ClientJsContext } from '../types'

export function emitEffectsAndOnMounts(lines: string[], ctx: ClientJsContext): void {
  for (const effect of ctx.effects) {
    if (effect.captureName) {
      lines.push(`  const ${effect.captureName} = createEffect(${effect.body})`)
    } else {
      lines.push(`  createEffect(${effect.body})`)
    }
  }
  for (const onMount of ctx.onMounts) {
    lines.push(`  onMount(${onMount.body})`)
  }
}
