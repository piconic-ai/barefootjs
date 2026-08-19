/**
 * bf-p semantic conformance — decode-and-compare the hydration-props
 * payload cross-adapter, instead of erasing it.
 *
 * Background (spec/subset-conformance.md's largest remaining oracle
 * hole): `normalizeHTML` in `jsx-runner.ts` strips every `bf-p="…"`
 * occurrence wholesale before comparing SSR HTML across adapters (see
 * the comment on that regex — "Hono uses JSON serialization, Go uses
 * struct fields"). That keeps byte-level HTML comparison apples-to-
 * apples across adapters whose *attribute-encoding strategy* differs,
 * but it also means a real divergence in the *hydration payload
 * itself* — a missing key, a stale value, a child scope id leaking
 * into `children` (#1952) — is invisible to every existing
 * conformance fixture.
 *
 * This module adds a second, narrower oracle that runs ONLY over the
 * `bf-p` attribute's DECODED JSON value: extract every occurrence in
 * document order, HTML-entity-decode + `JSON.parse` it, and deep-equal
 * the reference and adapter-under-test payloads. Because comparison
 * happens after `JSON.parse`, encoding-strategy differences that
 * `normalizeHTML` has to paper over on the whole-document text (key
 * order, single- vs double-quoted attribute, numeric vs named entity
 * escaping) are structurally irrelevant here — they can never produce
 * a false divergence.
 *
 * Kept deliberately separate from `normalizeHTML` / the main
 * `runJSXConformanceTests` suite: this is today an inventory tool
 * (see `scripts/hydration-props-inventory.ts`), not a wired-in
 * per-fixture assertion. Wiring it into `run-adapter-conformance.ts`
 * is the follow-up once the inventory this module produces has been
 * triaged into `known-limitation` issues + pins.
 *
 * Constraint this oracle depends on: each `test-render.ts` harness's
 * `_props(...)` seeding must mirror production's own call verbatim —
 * the caller's raw fixture props, unmodified (no defaults, no
 * null-fill, no signal/memo seeding). A harness that seeds `_props`
 * from anything else (a defaulted stash, a signal's evaluated initial
 * value) can diverge from the reference for reasons that have nothing
 * to do with the adapter's actual `bf-p` emission, producing a false
 * divergence here.
 */

// ---------------------------------------------------------------------------
// Entity decoding
// ---------------------------------------------------------------------------

/**
 * Matches `&quot;` `&amp;` `&lt;` `&gt;` by name, plus ANY decimal
 * (`&#39;`, `&#34;`, …) or hex (`&#x27;`, `&#X22;`, …) numeric character
 * reference. `&#39;` `&#34;` fall out of the numeric branch for free —
 * no dedicated case needed.
 *
 * Decoding happens in a SINGLE `.replace` pass (one regex, one scan of
 * the original string). This matters for correctness, not just style:
 * chaining separate `.replace(/&amp;/…).replace(/&lt;/…)` calls would
 * re-scan each call's OUTPUT, so a literal `&amp;lt;` in the source
 * (i.e. the two independent entities `&amp;` followed by literal text
 * `lt;`) would double-decode into `<` instead of the correct `&lt;`.
 * A single alternation avoids ever re-scanning replacement text.
 */
const ENTITY_RE = /&(#[xX][0-9a-fA-F]+;|#[0-9]+;|quot;|amp;|lt;|gt;)/g

export function decodeHtmlEntities(input: string): string {
  return input.replace(ENTITY_RE, (match) => {
    if (match[1] === '#') {
      const isHex = match[2] === 'x' || match[2] === 'X'
      const numPart = isHex ? match.slice(3, -1) : match.slice(2, -1)
      const codePoint = Number.parseInt(numPart, isHex ? 16 : 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    switch (match) {
      case '&quot;':
        return '"'
      case '&amp;':
        return '&'
      case '&lt;':
        return '<'
      case '&gt;':
        return '>'
      default:
        return match
    }
  })
}

// ---------------------------------------------------------------------------
// bf-s normalization (mirrors jsx-runner.ts's normalizeHTML, ported to
// operate on a single already-extracted attribute VALUE rather than a
// `bf-s="…"` substring in the whole document — see that file for the
// two source regexes this is a value-only port of. Not imported
// because normalizeHTML operates on the whole-document string and
// isn't factored into a reusable single-value helper; duplicating two
// small regexes here is cheaper than refactoring the shared file for
// this one caller, and the CLAUDE.md rule against reparsing markup
// with regex does not apply to this project's OWN emitted HTML.
// ---------------------------------------------------------------------------

export function normalizeBfSValue(value: string): string {
  // `bf-s="~parentId_sN"` → `bf-s="parentId_sN"` (child scope prefix).
  let v = value.startsWith('~') ? value.slice(1) : value
  // Non-deterministic per-render suffix collapse, keeping any trailing
  // `_sN` slot markers intact:
  //   ComponentName_abc123          → ComponentName_*
  //   ComponentName_abc123_s10      → ComponentName_*_s10
  v = v.replace(/^([A-Z][a-zA-Z]*)_[a-z0-9]+((?:_s\d+)*)$/, '$1_*$2')
  return v
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export interface BfPOccurrence {
  /** 0-based position among all bf-p occurrences in this document, in document order. */
  index: number
  /** Lowercased tag name of the element carrying this bf-p attribute. */
  tagName: string
  /** This element's `bf-s` value, normalized like normalizeHTML does (null if the element has no bf-s). */
  bfS: string | null
  /** The bf-p attribute value exactly as it appeared in the HTML (still entity-encoded). */
  raw: string
  /** `raw` after HTML-entity decoding. */
  decoded: string
  /** `JSON.parse(decoded)` result, if it parsed. */
  value?: unknown
  /** Set instead of `value` when `JSON.parse(decoded)` threw. */
  parseError?: string
}

/**
 * Isolate one HTML opening tag's raw source text starting at `start`
 * (which must point at the tag's `<`). Quote-aware: a `>` inside a
 * quoted attribute value does not end the tag. Mirrors the same
 * quote-tracking `normalizeHTML`'s `normalizeTagAttributeOrder` uses,
 * scoped down to "find where this one tag ends" since that's all this
 * caller needs.
 *
 * Returns the end index (exclusive, i.e. one past the closing `>`),
 * or -1 if the tag never closes (malformed input — caller stops).
 */
function findTagEnd(html: string, start: number): number {
  let i = start + 1 // skip '<'
  while (i < html.length) {
    const c = html[i]
    if (c === '"' || c === "'") {
      const quote = c
      i++
      while (i < html.length && html[i] !== quote) i++
      if (i < html.length) i++ // skip closing quote
      continue
    }
    if (c === '>') return i + 1
    i++
  }
  return -1
}

const ATTR_RE = (name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`)

/**
 * Extract every `bf-p="…"` (or `bf-p='…'`) occurrence from rendered
 * HTML, in document order, each annotated with its owning element's
 * tag name and (normalized) `bf-s`.
 *
 * Extraction works by finding each `<tag …>` opening tag (quote-aware,
 * see `findTagEnd`) and then regex-matching `bf-p=` / `bf-s=` WITHIN
 * that already-isolated tag substring — never across tag boundaries.
 * This is attribute-regex extraction over emitted HTML (data), not
 * regex parsing of JS/TS source, so it isn't the pattern the
 * project's "never parse imports with regex" rule targets; see this
 * module's docstring. It assumes attribute values don't contain a raw
 * (non-entity-encoded) matching quote — true for every adapter, since
 * all of them HTML-attribute-escape their JSON payload.
 */
export function extractBfPOccurrences(html: string): BfPOccurrence[] {
  const occurrences: BfPOccurrence[] = []
  let i = 0
  let index = 0
  const openTagRe = /<([a-zA-Z][a-zA-Z0-9-]*)/g
  while (i < html.length) {
    openTagRe.lastIndex = i
    const m = openTagRe.exec(html)
    if (!m) break
    const tagStart = m.index
    const tagEnd = findTagEnd(html, tagStart)
    if (tagEnd === -1) break
    const tagText = html.slice(tagStart, tagEnd)
    const bfPMatch = ATTR_RE('bf-p').exec(tagText)
    i = tagEnd
    if (!bfPMatch) continue
    const raw = bfPMatch[1] !== undefined ? bfPMatch[1] : bfPMatch[2]
    const bfSMatch = ATTR_RE('bf-s').exec(tagText)
    const bfSRaw = bfSMatch ? (bfSMatch[1] !== undefined ? bfSMatch[1] : bfSMatch[2]) : null
    const decoded = decodeHtmlEntities(raw)
    const occ: BfPOccurrence = {
      index: index++,
      tagName: m[1].toLowerCase(),
      bfS: bfSRaw !== null ? normalizeBfSValue(bfSRaw) : null,
      raw,
      decoded,
    }
    try {
      occ.value = JSON.parse(decoded)
    } catch (err) {
      occ.parseError = err instanceof Error ? err.message : String(err)
    }
    occurrences.push(occ)
  }
  return occurrences
}

// ---------------------------------------------------------------------------
// Deep equality (post-JSON.parse — plain JSON-shaped values only)
// ---------------------------------------------------------------------------

export function jsonDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false // primitives already failed ===
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, idx) => jsonDeepEqual(v, b[idx]))
  }
  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  const aKeys = Object.keys(aObj).sort()
  const bKeys = Object.keys(bObj).sort()
  if (aKeys.length !== bKeys.length) return false
  for (let idx = 0; idx < aKeys.length; idx++) {
    if (aKeys[idx] !== bKeys[idx]) return false
  }
  return aKeys.every((k) => jsonDeepEqual(aObj[k], bObj[k]))
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export type BfPDivergenceKind =
  /** Reference has an occurrence the adapter has no counterpart for. */
  | 'missing-in-adapter'
  /** Adapter has an occurrence the reference has no counterpart for. */
  | 'extra-in-adapter'
  /** Both sides paired and parsed, but the decoded JSON values differ. */
  | 'value-mismatch'
  /** The reference side's bf-p failed to decode/JSON.parse. */
  | 'parse-error-reference'
  /** The adapter side's bf-p failed to decode/JSON.parse. */
  | 'parse-error-adapter'

export interface BfPDivergence {
  kind: BfPDivergenceKind
  referenceOccurrence?: BfPOccurrence
  adapterOccurrence?: BfPOccurrence
  detail: string
}

export interface HydrationPropsComparisonResult {
  referenceCount: number
  adapterCount: number
  /** Number of occurrence pairs whose decoded values matched exactly. */
  matched: number
  divergences: BfPDivergence[]
  /**
   * True when the reference emitted at least one bf-p occurrence and
   * the adapter emitted none at all — called out separately from
   * ordinary missing-in-adapter counts since it usually indicates a
   * structural gap (the adapter's props-attribute wiring is unused on
   * this render path) rather than a per-value bug.
   */
  adapterEmitsNothing: boolean
}

/**
 * Pair reference and adapter bf-p occurrences and classify every
 * divergence. Pairing rule (fixed, not configurable): occurrences whose
 * normalized `bf-s` matches are paired first (in document order within
 * each bf-s group); any occurrences left over on either side are then
 * paired positionally, in remaining document order. Leftovers after
 * that (a genuine count mismatch) become `missing-in-adapter` /
 * `extra-in-adapter`.
 */
export function compareHydrationProps(
  referenceHtml: string,
  adapterHtml: string,
): HydrationPropsComparisonResult {
  const referenceOccurrences = extractBfPOccurrences(referenceHtml)
  const adapterOccurrences = extractBfPOccurrences(adapterHtml)
  return compareOccurrences(referenceOccurrences, adapterOccurrences)
}

/** Same as `compareHydrationProps`, but takes pre-extracted occurrence lists (for callers that already extracted both sides, e.g. to report tag/bf-s context alongside the comparison). */
export function compareOccurrences(
  referenceOccurrences: BfPOccurrence[],
  adapterOccurrences: BfPOccurrence[],
): HydrationPropsComparisonResult {
  const refRemaining = [...referenceOccurrences]
  const adpRemaining = [...adapterOccurrences]
  const pairs: Array<[BfPOccurrence, BfPOccurrence]> = []

  // Pass 1: pair by normalized bf-s, in document order within each key.
  const refByBfS = new Map<string, BfPOccurrence[]>()
  for (const occ of refRemaining) {
    if (occ.bfS === null) continue
    const list = refByBfS.get(occ.bfS) ?? []
    list.push(occ)
    refByBfS.set(occ.bfS, list)
  }
  const consumedRef = new Set<BfPOccurrence>()
  const consumedAdp = new Set<BfPOccurrence>()
  for (const adp of adpRemaining) {
    if (adp.bfS === null) continue
    const candidates = refByBfS.get(adp.bfS)
    if (!candidates || candidates.length === 0) continue
    const ref = candidates.shift()!
    pairs.push([ref, adp])
    consumedRef.add(ref)
    consumedAdp.add(adp)
  }

  // Pass 2: pair whatever's left, positionally in original document order.
  const refLeftover = refRemaining.filter((o) => !consumedRef.has(o))
  const adpLeftover = adpRemaining.filter((o) => !consumedAdp.has(o))
  const positionalCount = Math.min(refLeftover.length, adpLeftover.length)
  for (let i = 0; i < positionalCount; i++) {
    pairs.push([refLeftover[i], adpLeftover[i]])
  }
  const refUnpaired = refLeftover.slice(positionalCount)
  const adpUnpaired = adpLeftover.slice(positionalCount)

  const divergences: BfPDivergence[] = []
  let matched = 0

  for (const [ref, adp] of pairs) {
    if (ref.parseError) {
      divergences.push({
        kind: 'parse-error-reference',
        referenceOccurrence: ref,
        adapterOccurrence: adp,
        detail: `reference bf-p failed to parse: ${ref.parseError} (raw: ${ref.raw})`,
      })
      continue
    }
    if (adp.parseError) {
      divergences.push({
        kind: 'parse-error-adapter',
        referenceOccurrence: ref,
        adapterOccurrence: adp,
        detail: `adapter bf-p failed to parse: ${adp.parseError} (raw: ${adp.raw})`,
      })
      continue
    }
    if (jsonDeepEqual(ref.value, adp.value)) {
      matched++
    } else {
      divergences.push({
        kind: 'value-mismatch',
        referenceOccurrence: ref,
        adapterOccurrence: adp,
        detail: `reference=${JSON.stringify(ref.value)} adapter=${JSON.stringify(adp.value)}`,
      })
    }
  }

  for (const ref of refUnpaired) {
    divergences.push({
      kind: 'missing-in-adapter',
      referenceOccurrence: ref,
      detail: `reference <${ref.tagName} bf-s="${ref.bfS ?? ''}"> emits bf-p="${ref.raw}" but adapter has no counterpart`,
    })
  }
  for (const adp of adpUnpaired) {
    divergences.push({
      kind: 'extra-in-adapter',
      adapterOccurrence: adp,
      detail: `adapter <${adp.tagName} bf-s="${adp.bfS ?? ''}"> emits bf-p="${adp.raw}" with no reference counterpart`,
    })
  }

  return {
    referenceCount: referenceOccurrences.length,
    adapterCount: adapterOccurrences.length,
    matched,
    divergences,
    adapterEmitsNothing: referenceOccurrences.length > 0 && adapterOccurrences.length === 0,
  }
}
