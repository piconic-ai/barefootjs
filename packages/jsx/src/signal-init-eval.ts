/**
 * TEST-HARNESS ONLY. Evaluate a signal initializer / prop-default source
 * expression against a mock `props` object by EXECUTING it (sandboxed
 * `new Function`), the same way the Hono/CSR conformance reference produces
 * its value — by actually running the component. Never call this from a
 * build path (`bf build`, `compileJSX`, any adapter's `generate`); it exists
 * only so each adapter's `test-render.ts` conformance harness can seed a
 * signal/prop-default for a non-JS-runtime SSR render (PHP/Ruby/Python/
 * Perl/Go) that matches what Hono would compute. (#2209)
 *
 * Why real execution instead of a hand-rolled evaluator: the initializer
 * source is an arbitrary JS-subset expression over `props` (e.g. `(props.x
 * ?? []).map(t => ({ ...t, editing: false }))`, #2209's actual repro) —
 * every previous approach here was a regex/pattern-match over a small
 * catalogue of recognized shapes (`props.x`, `props.x ?? default`, a bare
 * literal), and #2209 is literally "the catalogue missed a shape" (the
 * THIRD such miss on this codebase, per the superseded
 * `evaluate-signal-init.test.ts`'s own #1672 pins). A hand-written
 * evaluator over `ParsedExpr` would face the same drift, and can't
 * represent object spread (`{ ...t, editing: false }`) without extending
 * `ParsedExpr` — a production-compiler change that ripples into every
 * adapter's exhaustive switch, disproportionate for a test-only need.
 * `new Function` delegates parsing to the JS engine itself — CLAUDE.md's
 * regex-parsing ban exists precisely to avoid the false-match/missed-shape
 * failure mode this replaces.
 *
 * Trust boundary: the evaluated text is first-party fixture source, already
 * compiled by this same process — the conformance harness already executes
 * fixture-derived code far more invasively (spawning `ruby`/`php`/`perl`/
 * `go run` on generated programs). This module is never reachable from
 * anything a real end user's untrusted input could influence.
 *
 * Blocked as `undefined` inside the sandbox (deterministic failure, same as
 * "shape not recognized" in the old evaluators — the corpus has no signal
 * initializer that references any of these): `globalThis`, `window`,
 * `document`, `Date`, `Math`, `crypto`, `performance`, `fetch`,
 * `setTimeout`, `setInterval`, `require`, `process`.
 *
 * `props` bare-identifier destructured params (`createSignal(count)` where
 * `count` is a destructured prop, not a `props.x` member) are NOT bound —
 * the sandbox only exposes `props` — so such an initializer throws
 * `ReferenceError` and falls back to "unset", matching every prior
 * evaluator's behavior for that shape. Extending the environment with
 * `ir.metadata.propsParams` bindings is a natural follow-up if a fixture
 * ever needs it.
 */

const BLOCKED_GLOBALS = [
  'globalThis',
  'window',
  'document',
  'Date',
  'Math',
  'crypto',
  'performance',
  'fetch',
  'setTimeout',
  'setInterval',
  'require',
  'process',
] as const

export type SignalInitEvalResult = { ok: true; value: unknown } | { ok: false }

/**
 * A value the harness's downstream language serializers (JSON/Python/PHP/
 * Perl/Ruby literal builders) can actually marshal: `null`, a boolean, a
 * number (including non-finite — several serializers already special-case
 * NaN/Infinity), a string, a plain array (no `undefined` holes), or a plain
 * object (`Object.prototype` or null prototype only — rejects class
 * instances, functions, Maps/Sets, etc). Rejects cycles.
 */
function isTransportable(value: unknown, seen: Set<unknown> = new Set()): boolean {
  if (value === null) return true
  const t = typeof value
  if (t === 'boolean' || t === 'number' || t === 'string') return true
  if (t !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) {
    return value.every(el => el !== undefined && isTransportable(el, seen))
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return false
  return Object.values(value as Record<string, unknown>).every(v => isTransportable(v, seen))
}

/**
 * Evaluate `expr` (a JS-subset source expression) against `props`. Returns
 * `{ ok: false }` when the expression fails to parse, throws at evaluation
 * time (e.g. a `ReferenceError` for an unbound identifier), or evaluates to
 * something the downstream serializers can't marshal (see
 * {@link isTransportable}).
 */
export function tryEvaluateSignalInit(
  expr: string,
  props?: Record<string, unknown>,
): SignalInitEvalResult {
  const src = expr.trim()
  if (src === '') return { ok: false }
  let fn: (props: Record<string, unknown>, ...blocked: undefined[]) => unknown
  try {
    // Sandboxed by construction: only `props` and the blocked-globals
    // shadows are bound — see the file docstring for the trust-boundary
    // rationale (test-harness-only, never a build path).
    fn = new Function(
      'props',
      ...BLOCKED_GLOBALS,
      `'use strict'; return (\n${src}\n);`,
    ) as typeof fn
  } catch {
    return { ok: false }
  }
  try {
    const value = fn(props ?? {})
    // `undefined` at the TOP level is a genuine, distinguishable result
    // (e.g. an explicit `undefined` initializer, or `props.x` with no `x`
    // and no `??` fallback) — not a marshal failure. `evaluateSignalInit`'s
    // wrapper still collapses it to the "skip" outcome; callers that need
    // the distinction use this function directly.
    if (value === undefined) return { ok: true, value: undefined }
    return isTransportable(value) ? { ok: true, value } : { ok: false }
  } catch {
    return { ok: false }
  }
}

/**
 * Drop-in replacement for the harnesses' former per-adapter regex
 * evaluator: `null` means "could not evaluate, or evaluated to
 * `undefined` — leave the signal/default unseeded", matching every prior
 * evaluator's convention (an explicit JS `null` initializer also maps to
 * `null` — the same "skip" outcome, since none of these harnesses
 * distinguish "explicitly null" from "unset" downstream).
 */
export function evaluateSignalInit(expr: string, props?: Record<string, unknown>): unknown {
  const result = tryEvaluateSignalInit(expr, props)
  return result.ok && result.value !== undefined ? result.value : null
}
