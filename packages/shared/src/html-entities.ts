/**
 * HTML character-reference decoding and escaping for STATIC template
 * content.
 *
 * JSX decodes character references at parse time: `<span>Fish &amp;
 * Chips</span>` means the TEXT `Fish & Chips`, and `&copy;` means `©`
 * (Babel/esbuild/TypeScript's JSX emit all decode). Phase 1
 * (`jsx-to-ir`) applies `decodeEntities` once so `IRText.value` and
 * static attribute values carry the DECODED text — the semantics —
 * and every adapter re-escapes for its own emission context
 * (`escapeHtml` for HTML template output; the Hono adapter
 * re-encodes for JSX source). An adapter that emitted the raw entity
 * text passed `&copy;` through as bytes while the reference decoded it
 * (the `html-entity-text` divergence), and one that skipped
 * re-escaping emitted a parse-corrupting `<`.
 *
 * The named table is the curated set below, not the full HTML5 list
 * (~2,200 names): an unknown name (`&foo;`) is left as raw text, so
 * BOTH the reference adapter and the template adapters receive the
 * same undecoded string from the IR and stay byte-identical — the
 * degradation is consistent, exactly how a browser treats an unknown
 * reference. Numeric references (`&#169;` / `&#xA9;`) decode fully.
 */

/**
 * Named character references JSX authors actually write in literal
 * text. `amp`/`lt`/`gt`/`quot`/`apos` are the escaping set itself;
 * the rest are the common typographic/symbol names.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  middot: '·',
  bull: '•',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  sect: '§',
  para: '¶',
  dagger: '†',
  Dagger: '‡',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sup1: '¹',
  sup2: '²',
  sup3: '³',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  larr: '←',
  uarr: '↑',
  rarr: '→',
  darr: '↓',
  harr: '↔',
  minus: '−',
  infin: '∞',
  ne: '≠',
  le: '≤',
  ge: '≥',
}

/**
 * Decode HTML character references in JSX literal text / static
 * attribute values: numeric decimal (`&#169;`), numeric hex
 * (`&#xA9;`), and the curated named set above. Anything unrecognized
 * (unknown name, malformed numeric, bare `&`) is left verbatim.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const digits = body.slice(isHex ? 2 : 1)
      if (!isHex && !/^[0-9]+$/.test(digits)) return match
      const code = parseInt(digits, isHex ? 16 : 10)
      // Reject out-of-range / lone-surrogate code points rather than
      // producing replacement garbage — leave the reference raw.
      if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return match
      }
      return String.fromCodePoint(code)
    }
    return NAMED_ENTITIES[body] ?? match
  })
}

/**
 * Escape decoded static text for direct HTML emission: `&` `<` `>`
 * `"` to their named forms. Used for BOTH text nodes and double-quoted
 * attribute values — one set, no context-dependent under-escaping.
 *
 * `'` is deliberately NOT escaped: the reference (Hono JSX) escapes it
 * as `&#39;`, but raw `'` is valid everywhere outside single-quoted
 * attributes (which no adapter emits), and the conformance harness's
 * `normalizeHTML` canonicalises the raw and entity forms to one
 * spelling on both sides — so leaving apostrophes raw keeps every
 * existing template byte-stable instead of rewriting all prose text.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
