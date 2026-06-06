/**
 * `effects-and-on-mounts` phase — emit user-written `createEffect` and
 * `onMount` calls (in source order).
 *
 * Effects with a `captureName` keep their `const <name> = createEffect(...)`
 * form so user code calling the captured disposer (or any future return
 * value) still resolves at runtime.
 */

import type { ClientJsContext } from '../types.ts'

export function emitEffectsAndOnMounts(lines: string[], ctx: ClientJsContext): void {
  ctx.effects.forEach((effect, i) => {
    // Profile mode (#1690): IR-aligned id so runtime effect-run events join to
    // this effect node. Keyed by captureName when present, else the source line
    // (stable across compiles), falling back to source order.
    const idArg = ctx.profile
      ? `, ${JSON.stringify(`${ctx.componentName}#effect:${effect.captureName ?? effect.loc?.start.line ?? i}`)}`
      : ''
    if (effect.captureName) {
      lines.push(`  const ${effect.captureName} = createEffect(${effect.body}${idArg})`)
    } else {
      lines.push(`  createEffect(${effect.body}${idArg})`)
    }
  })
  for (const onMount of ctx.onMounts) {
    lines.push(`  onMount(${onMount.body})`)
  }
}
