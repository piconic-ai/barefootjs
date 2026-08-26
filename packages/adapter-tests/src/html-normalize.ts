/**
 * Cross-adapter / cross-render HTML normalization.
 *
 * Pulled out of `jsx-runner.ts` (#2481) so it has no transitive `bun:test`
 * import: `jsx-runner.ts` pulls in `bun:test` at module scope for its
 * `describe`/`test`/`expect` runner glue, which is fine for every existing
 * consumer (all `bun test`-run) but breaks `oracle.playwright.ts` —
 * Playwright's worker processes run under Node's `worker_threads`, whose
 * module loader doesn't understand the `bun:` URL scheme even when the
 * top-level `bunx playwright` invocation itself runs under Bun. Moving the
 * pure string-normalization functions here (no runner glue, no adapter
 * imports) makes them safely importable from a Playwright spec.
 *
 * `jsx-runner.ts` re-exports both functions from here unchanged, so every
 * existing `bun test` consumer's import path (`'../jsx-runner'` /
 * `@barefootjs/adapter-tests`) keeps working with zero behavior change.
 */

/** HTML void elements that must not have a closing tag */
const VOID_ELEMENTS = 'area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr'

/**
 * Remove every `<div … bf-async="…" …>…fallback…</div>` placeholder from
 * `html`, walking the opener's descendants with a depth counter so a
 * fallback that itself contains `<div>` (e.g. `<Skeleton><div
 * class="..."/></Skeleton>`) does not terminate the match at the first
 * inner `</div>`. Plain regex with `[\s\S]*?` cannot do this — it stops
 * at the first close, leaving a dangling `</div>` behind.
 *
 * Robustness invariants the helper pins:
 *
 * - **Attribute order is not assumed.** The opener regex matches
 *   `bf-async` anywhere in the attribute list, so an adapter is free to
 *   emit `<div data-foo="x" bf-async="a0">` without silently no-opping
 *   the strip.
 * - **Tag-name word boundary.** A `(?=[\s/>])` lookahead after `<div`
 *   keeps `<divider>` / `<div-foo>` from being miscounted as `<div>`
 *   openers — `\b` alone would still match `<div-…` because `-` is a
 *   non-word char.
 * - **Self-closing `<div ... />` is zero net depth.** XHTML-style
 *   self-closes have no matching `</div>`; incrementing on them would
 *   make the strip consume past the intended placeholder close.
 *
 * The streaming-SSR adapters (Mojo, Go template) emit the placeholder
 * alongside the resolved children so the runtime can swap on resolve;
 * Hono's `<Suspense>` collapses synchronously for non-Promise children
 * and emits only the resolved content. Stripping the placeholder keeps
 * cross-adapter conformance apples-to-apples — the resolved children
 * remain on both sides.
 */
function stripAsyncPlaceholders(html: string): string {
  const OPENER_RE = /<div(?=[\s/>])[^>]*\bbf-async="[^"]*"[^>]*>/g
  const ANY_DIV_TAG_RE = /<div(?=[\s/>])[^>]*?(\/?)>|<\/div>/g

  let result = ''
  let i = 0
  while (i < html.length) {
    OPENER_RE.lastIndex = i
    const opener = OPENER_RE.exec(html)
    if (!opener) {
      result += html.slice(i)
      break
    }
    result += html.slice(i, opener.index)

    let depth = 1
    ANY_DIV_TAG_RE.lastIndex = opener.index + opener[0].length
    while (depth > 0) {
      const m = ANY_DIV_TAG_RE.exec(html)
      if (!m) {
        // Unbalanced — leave the rest of `html` alone rather than risk a
        // worse strip.
        result += html.slice(opener.index)
        return result
      }
      if (m[0] === '</div>') {
        depth -= 1
      } else if (m[1] !== '/') {
        // Open tag (and not self-closing): nested.
        depth += 1
      }
    }
    i = ANY_DIV_TAG_RE.lastIndex
  }
  return result
}

/**
 * Normalize rendered HTML for cross-adapter comparison.
 * Handles known formatting differences between adapters:
 * - Whitespace collapsing (template engine formatting)
 * - bf-p attribute removal (adapter-specific props serialization strategy)
 * - Void element self-closing normalization (<br/> vs <br>)
 * - Trailing whitespace before closing > in tags
 */
export function normalizeHTML(html: string): string {
  // Strip the streaming-SSR async-boundary placeholder ahead of the
  // regex chain so a fallback containing nested `<div>` doesn't mislead
  // any later matcher. See `stripAsyncPlaceholders` for the depth-
  // counted match. (#1298)
  const stripped = stripAsyncPlaceholders(html)
    // Remove loop boundary comment markers (template detail, not semantic).
    // Matches both legacy unscoped (`<!--bf-loop-->`) and scoped per-call-site
    // (`<!--bf-loop:l7-->`) forms (#1087). The marker id is `l\d+` — kept
    // explicit so unrelated comments matching a looser pattern aren't stripped.
    // Also strips per-item start markers `<!--bf-loop-i-->` emitted for
    // multi-root Fragment loop bodies (#1212).
    .replace(/<!--bf-\/?loop(?::l\d+)?-->|<!--bf-loop-i-->/g, '')
    // Remove bf-p attribute (Hono uses JSON serialization, Go uses struct
    // fields). Both quote styles: Hono/Go double-quote it, but ERB/Jinja/
    // Perl/Rust deliberately SINGLE-quote it (props_attr's own comment —
    // the JSON must be attribute-escaped so a raw `'` inside a string
    // prop value doesn't terminate a double-quoted attribute early). Must
    // run before the raw-apostrophe canonicalisation below, or a single-
    // quoted bf-p's delimiter quotes survive as literal `'` and get
    // rewritten to `&#39;` by that later, unrelated rule instead of being
    // removed with the rest of the attribute.
    .replace(/\s*bf-p=(?:"[^"]*"|'[^']*')/g, '')
    // Remove bf-h / bf-m slot-relationship markers. Hono emits them
    // for upsertChild's bf-h + bf-m lookup against the @barefootjs
    // client runtime. Other SSR adapters (Mojo, Go template) don't pair with
    // that runtime and don't emit them, so excluding from cross-adapter
    // conformance keeps the comparison apples-to-apples.
    .replace(/\s*bf-h="[^"]*"/g, '')
    .replace(/\s*bf-m="[^"]*"/g, '')
    // bf-r is the Hono-specific root-of-client-component marker for e2e
    // locator distinction (#1249). Other adapters don't emit it, so strip
    // for cross-adapter conformance comparisons.
    .replace(/\s*bf-r=""/g, '')
    // Strip fragment scope-comment pairs (`<!--bf-scope:...-->` /
    // `<!--bf-/scope:...-->`, #2289). Every adapter emits them for
    // fragment-rooted components, but the scope id embedded in each is
    // per-render volatile (random suffix), so they can never byte-match
    // across adapters — strip both markers to keep cross-adapter
    // conformance comparisons apples-to-apples.
    .replace(/<!--bf-\/?scope:[^>]*-->/g, '')
    // Normalize child scope ID prefix: bf-s="~parentId_sN" → bf-s="parentId_sN"
    .replace(/bf-s="~([^"]*)"/g, 'bf-s="$1"')
    // Normalize non-deterministic child scope IDs. Keep the trailing
    // `_sN` slot suffix intact so the SSR-hydration contract test can
    // still pair renderChild('Name', ..., 'sN') with `_sN` in HTML.
    //   bf-s="ComponentName_abc123"          → bf-s="ComponentName_*"
    //   bf-s="ComponentName_abc123_s10"      → bf-s="ComponentName_*_s10"
    //   bf-s="ParentName_xyz_s10"            → bf-s="ParentName_*_s10"
    .replace(/bf-s="([A-Z][a-zA-Z]*)_[a-z0-9]+((?:_s\d+)*)"/g, 'bf-s="$1_*$2"')
    // HTML5 boolean attribute canonicalisation (#1466 follow-up).
    // For `disabled={!ok()}` (true), Hono emits `disabled=""` while
    // Mojo / Go emit bare `disabled`. Both are spec-equivalent
    // (presence = true, absence = false) — collapse the empty-value
    // form to bare so the byte comparison reads as adapter-neutral.
    //
    // Scoped to the HTML5 spec whitelist to avoid stripping
    // legitimate empty values on non-boolean attrs (`class=""`,
    // `aria-label=""`).
    //
    // `data-*` and `aria-*` value canonicalisation is intentionally
    // NOT done here: the Mojo adapter routes ARIA boolean attrs and
    // structurally-boolean expressions through `bf->bool_str` at
    // compile time, so the wire bytes already match Hono / Go.
    // Touching `data-*` on the harness side would break legitimate
    // numeric / string dataset values (`data-count={0}` → "0", not
    // "false").
    .replace(
      /\s(disabled|hidden|checked|readonly|required|selected|autofocus|multiple|defer|async|controls|loop|muted|open|reversed|ismap|formnovalidate|nomodule|playsinline|inert|novalidate|allowfullscreen)=""/g,
      ' $1',
    )
    // HTML character-reference canonicalisation. A special char in an attribute
    // value (e.g. the `"` in `[class*="size-"]`) is escaped as a NAMED entity by
    // Hono but a NUMERIC reference by Go's `html/template`. Both decode to the
    // same char, so collapse the interchangeable numeric (decimal + hex) forms
    // to one canonical form on both sides — adapter-neutral, same motivation as
    // the boolean-attribute / void-element canonicalisation above.
    .replace(/&#0*34;|&#[xX]0*22;/g, '&quot;')
    .replace(/&#0*38;|&#[xX]0*26;/g, '&amp;')
    .replace(/&#0*60;|&#[xX]0*3[cC];/g, '&lt;')
    .replace(/&#0*62;|&#[xX]0*3[eE];/g, '&gt;')
    .replace(/&#0*39;|&#[xX]0*27;/g, '&#39;')
    // `+` never needs escaping in HTML, but Go's html/template still emits
    // it as `&#43;` in text nodes while every other adapter emits the
    // literal — the exact divergence #2158 calls out ("decode HTML
    // entities first"). Decode to the literal on both sides; first
    // surfaced by the counter-buttons fixture's `+1` button label.
    .replace(/&#0*43;|&#[xX]0*2[bB];/g, '+')
    // Raw apostrophes too (#1896 / #1897): Hono escapes `'` in text nodes
    // as `&#39;`, Go's html/template (and Xslate) leave it raw — both
    // decode to the same DOM text, so canonicalise to the entity form on
    // both sides like the numeric references above.
    .replace(/'/g, '&#39;')
    // Normalize void element self-closing: <br/> or <br /> → <br>
    .replace(new RegExp(`<(${VOID_ELEMENTS})(\\s[^>]*?)?\\s*/>`, 'g'), '<$1$2>')
    // Remove trailing whitespace before >
    .replace(/\s+>/g, '>')
    // Collapse inter-tag whitespace (Go Template adds newlines between blocks)
    .replace(/>\s+</g, '><')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
  // Normalize attribute order within tags (#1407). Attribute order is
  // HTML-semantically irrelevant — `<div id="a" class="b">` and
  // `<div class="b" id="a">` produce identical DOM — but adapters
  // diverge: Hono / hono/jsx iterate JS object keys in insertion
  // order, Go's `bf_spread_attrs` sorts keys for deterministic
  // output (map[string]any has no insertion order). Sorting
  // attributes alphabetically inside each tag here lets the SSR
  // conformance comparison stay byte-equal across adapters.
  //
  // The scan is a small purpose-built tokenizer rather than a regex
  // so two edge cases the regex previously fumbled — self-closing
  // non-void tags (`<svg foo="x"/>`, the trailing `/` was consumed
  // as a stray attribute) and `>` characters inside quoted
  // attribute values — are handled correctly (#1411 review).
  //
  // **Fixture-author note**: this normalisation is applied to BOTH
  // expected and actual HTML uniformly, so any fixture that needs to
  // assert source-order-sensitive attribute emission (duplicate-key
  // last-wins behaviour, `<meta charset>` ordering in `<head>`,
  // etc.) cannot use plain `expectedHtml` comparison — those cases
  // should be pinned via a dedicated assertion in the test file
  // instead. Today the BarefootJS adapter suite has no such fixture;
  // if one is added, surface this limitation prominently in its
  // comment so the next maintainer doesn't wonder why a deliberate
  // re-ordering "doesn't fail" the conformance check (#1411 review).
  return normalizeTagAttributeOrder(stripped)
}

function normalizeTagAttributeOrder(html: string): string {
  let result = ''
  let i = 0
  while (i < html.length) {
    if (html[i] !== '<' || i + 1 >= html.length) {
      result += html[i]
      i++
      continue
    }
    const next = html[i + 1]
    // Closing tags (`</foo>`), comments (`<!--`), and processing
    // instructions / doctype (`<!`, `<?`) pass through unchanged —
    // none of them carry attributes that need sorting.
    if (next === '/' || next === '!' || next === '?' || !/[a-zA-Z]/.test(next)) {
      result += html[i]
      i++
      continue
    }
    // Open tag — scan the tag name, the attrs, an optional
    // self-close `/`, and the closing `>`.
    const tagStart = i
    i++ // skip <
    const nameStart = i
    while (i < html.length && /[a-zA-Z0-9-]/.test(html[i])) i++
    const tagName = html.slice(nameStart, i)
    // Read body up to `>`, respecting quoted spans so a `>` inside
    // an attribute value doesn't terminate the tag.
    let attrText = ''
    let selfClose = false
    let closed = false
    while (i < html.length) {
      const c = html[i]
      if (c === '"' || c === "'") {
        // Consume the quoted span verbatim — `>` inside a quoted
        // value is legal HTML.
        attrText += c
        i++
        while (i < html.length && html[i] !== c) {
          attrText += html[i]
          i++
        }
        if (i < html.length) {
          attrText += html[i]
          i++
        }
        continue
      }
      if (c === '/' && i + 1 < html.length && html[i + 1] === '>') {
        selfClose = true
        i += 2
        closed = true
        break
      }
      if (c === '>') {
        i++
        closed = true
        break
      }
      attrText += c
      i++
    }
    if (!closed) {
      // Unterminated tag — emit the raw substring and stop.
      result += html.slice(tagStart)
      break
    }
    const trimmedAttrs = attrText.trim()
    const sorted = trimmedAttrs ? sortHtmlAttributes(trimmedAttrs) : []
    const attrsPart = sorted.length > 0 ? ' ' + sorted.join(' ') : ''
    const closer = selfClose ? '/>' : '>'
    result += `<${tagName}${attrsPart}${closer}`
  }
  return result
}

/**
 * Tokenise a tag's attribute substring and return the attributes
 * sorted alphabetically by name. Handles double-quoted, single-
 * quoted, and bare attribute values, plus boolean (valueless) attrs.
 */
function sortHtmlAttributes(attrText: string): string[] {
  const attrs: string[] = []
  let i = 0
  while (i < attrText.length) {
    while (i < attrText.length && /\s/.test(attrText[i])) i++
    if (i >= attrText.length) break
    const nameStart = i
    while (i < attrText.length && !/[\s=]/.test(attrText[i])) i++
    const name = attrText.slice(nameStart, i)
    if (i < attrText.length && attrText[i] === '=') {
      i++
      const quote = attrText[i]
      if (quote === '"' || quote === "'") {
        i++
        const valStart = i
        while (i < attrText.length && attrText[i] !== quote) i++
        const value = attrText.slice(valStart, i)
        i++ // skip closing quote
        attrs.push(`${name}=${quote}${value}${quote}`)
      } else {
        const valStart = i
        while (i < attrText.length && !/\s/.test(attrText[i])) i++
        attrs.push(`${name}=${attrText.slice(valStart, i)}`)
      }
    } else {
      attrs.push(name)
    }
  }
  return attrs.sort()
}

/**
 * Collapse the conditional-branch hydration marker divergence between
 * adapters into a single canonical shape, on top of `normalizeHTML`.
 *
 *   - Hono:  `<br bf-c="s0">`                                       (attribute on the single root)
 *   - Go:    `<!--bf-cond-start:s0--><br><!--bf-cond-end:s0-->`     (comment pair)
 *
 * The runtime accepts either form; both pin the same slotId. For
 * cross-adapter conformance the canonical comparison shape is "no
 * marker at all" — semantic structure remains intact.
 *
 * Kept separate from `normalizeHTML` so the canonical fixture HTML
 * (generated by `scripts/generate-expected-html.ts` from the Hono
 * reference) still carries the `bf-c="sN"` attributes that the
 * SSR-hydration contract test reads to verify the SSR-side markers
 * line up with client-side `$()` / `$t()` references. (#1266)
 */
export function stripConditionalMarkersForCrossAdapter(html: string): string {
  return html
    .replace(/<!--bf-cond-(start|end):[^>]*-->/g, '')
    .replace(/\s*bf-c="[^"]*"/g, '')
}
