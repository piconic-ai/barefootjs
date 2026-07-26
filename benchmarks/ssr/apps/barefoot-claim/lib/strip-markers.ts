/**
 * Marker-elision transform for the claim-once Stage 0 spike
 * (spec/slot-unification.md section 3(b)). Strips the two marker
 * categories that a claim-plan-based hydrator (spec section 4) would no
 * longer need at all, given a fixed row template shape and hardcoded
 * child paths (see ../client/hydrate.js):
 *
 *  1. Text-slot comment pairs `<!--bf:sN-->…<!--/-->` — the compiler
 *     currently wraps every text interpolation this way so the runtime
 *     can re-find the text node at hydration/update time by scanning.
 *     A claim-once hydrator resolves the text node once via a
 *     compile-time child path and never scans again, so the pair is
 *     redundant once the row shape is trusted (byte parity — the whole
 *     premise of BarefootJS hydration already trusts SSR shape).
 *  2. Per-element ` bf="sN"` scope attributes — used by the current
 *     runtime's marker-based DOM query helpers (`G0`/`U0` in the compiled
 *     client, see benchmarks/ssr/apps/barefoot/dist/app.client.js) to
 *     re-find an element by scope id. A claim-once hydrator never queries
 *     by these ids; it walks `tr.children[…]` directly.
 *
 * Deliberately NOT stripped (kept byte-for-byte from the real barefoot
 * SSR output): `<!--bf-loop:l0-->`/`<!--bf-/loop:l0-->` boundaries (loop
 * range boundaries — spec section 3(b)(iii), structurally required even
 * under the target design), the root `bf-s="…"` component-scope attr, and
 * `data-key` (keyed reconciliation anchor). `bf-r`/`bf-p` (the real
 * hydration prop-JSON channel) are also left untouched — this spike's
 * hand-written client doesn't read them, but stripping them isn't part of
 * the (b) marker-elision hypothesis being measured here, so they're out of
 * scope for this transform.
 *
 * Regex-on-HTML-text is fine here per CLAUDE.md's "don't regex-parse
 * JS/TS" rule — that rule targets parsing *source code* (imports, JS/TS
 * syntax) where string matching false-matches inside literals/comments.
 * This is a plain-text strip of a small, closed, self-authored comment/
 * attribute grammar in already-compiled HTML output, not code parsing.
 */
export function stripMarkers(html: string): string {
  return html
    .replace(/<!--bf:s\d+-->(.*?)<!--\/-->/g, '$1')
    .replace(/ bf="s\d+"/g, '')
}
