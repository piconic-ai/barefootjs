/**
 * #3144: shared detection for "opaque local accessor invoked in a template
 * position" — `const label = makeLabel(); {label()}`, where `makeLabel()`
 * is a call the compiler cannot evaluate at compile time (a helper
 * returning a function, or an accessor returned by a library, e.g.
 * `const posts = createQuery(…); {posts()}`).
 *
 * Every non-JS-runtime adapter's `call()` fallback treats ANY zero-arg
 * identifier call as a signal-getter reference (`count() → $count` /
 * `.Count` / `{{ count }}` / …) unconditionally — correct for a real
 * signal/memo getter, but silently wrong here: `label` is never a signal,
 * never a prop, and never reaches the template as a bound variable at all,
 * so the emitted bare-name reference resolves to nothing. The reference
 * adapter (Hono, real JS) evaluates `label()` correctly and does NOT
 * consult this — it has no such gap to guard against.
 *
 * This function answers ONLY the structural question "is `name` bound to a
 * COMPONENT-BODY local whose own initializer is itself an unresolved call
 * expression" — every DSL adapter's `call()` method calls it, with its own
 * `localConstants`, before falling into the zero-arg-identifier branch, and
 * refuses loudly (reusing each adapter's own BF101 recording, matching the
 * #2994 / #3012 precedent for a bare-name call to a module-scope helper)
 * instead of guessing.
 */

import type { ConstantInfo } from './types.ts'

export function isOpaqueLocalAccessorName(
  name: string,
  localConstants: readonly ConstantInfo[] | undefined,
): boolean {
  const constant = (localConstants ?? []).find((c) => c.name === name)
  if (!constant) return false
  // Module-scope bindings go through the #2994/#3012 module-helper-call
  // refusal path already (a DIFFERENT shape: the bare name IS the helper,
  // not a local re-binding of one) — out of scope here.
  if (constant.isModule) return false
  // `ConstantInfo.parsed` is the analyzer's best-effort structural parse of
  // the initializer (`jsx-to-ir.ts`/analyzer). `kind === 'call'` means the
  // local's value came from invoking something — exactly the opaque-
  // accessor shape, regardless of whether that call itself would separately
  // refuse if written bare in a template position.
  return constant.parsed?.kind === 'call'
}
