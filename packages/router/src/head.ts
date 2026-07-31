/**
 * `<head>` metadata reconciliation across a soft navigation (#2438).
 *
 * A region is a **body** subtree, so a swap leaves `<head>` alone — and for
 * *resources* (`<link rel="stylesheet">`, `<script>`, `<style>`) that is the
 * contract, not a gap: a resource's lifetime depends on what still needs it
 * (the shell, a `[data-bf-permanent]` node, a portal, an island that outlives
 * the region), which the incoming document is no evidence for. Turbo reaches
 * the same conclusion from the other side — it never removes a stylesheet
 * unless the author writes `data-turbo-track="dynamic"`. Route-scoped sheets
 * belong *inside* the region, where both orderings are right by construction.
 *
 * **Page metadata is the opposite case.** It is page-scoped by definition,
 * costs no load, has no layout effect or ordering hazard, and is idempotent —
 * and a stale `<meta name="description">` is *invisible* wrongness: unlike the
 * tab title you cannot see it in development. That is the class this package
 * refuses to leave opt-in (spec/router.md, "correct by default"), so it is
 * reconciled on every swap, always — there is no flag to disable it.
 *
 * The reconciled set is a **closed allowlist**, which is the deliberate
 * difference from Turbo's `provisionalElements` (everything untracked, so
 * runtime-injected analytics/CSP nodes get caught in the sweep). Here anything
 * whose key isn't listed below is never read, never replaced, and never
 * removed.
 */

/** `<meta name>` / `<meta property>` values reconciled by exact match. */
const META_NAMES = new Set(['description', 'keywords', 'robots', 'author', 'theme-color'])

/** …and by prefix, for the two social-card namespaces. */
const META_PREFIXES = ['og:', 'twitter:']

/**
 * `<link rel>` values reconciled. Matched against the **whole** `rel`, not its
 * tokens, so a multi-token `rel="alternate stylesheet"` — a resource, with a
 * resource's unknowable lifetime — falls outside the allowlist by construction.
 */
const LINK_RELS = new Set(['canonical', 'alternate', 'prev', 'next'])

/**
 * Fold an attribute to its comparable form. Every attribute in a key is
 * case-insensitive, and incidental whitespace (`hreflang=" en-US "`) must not
 * split one logical slot into two — a split key would append a duplicate on
 * every navigation instead of replacing the node.
 */
function norm(value: string | null): string {
  return (value ?? '').trim().toLowerCase()
}

/** Opt-out for a node the page itself owns: `<meta name="robots" data-bf-head="false">`. */
function optedOut(el: Element): boolean {
  return el.getAttribute('data-bf-head') === 'false'
}

/**
 * The identity a node is matched by across the two documents, or `null` when it
 * is outside the allowlist (i.e. not ours to touch).
 *
 * `name` and `property` collapse into one key space on purpose: a page that
 * writes `<meta property="og:title">` where the previous one wrote
 * `<meta name="og:title">` still means the same slot.
 */
function headKey(el: Element): string | null {
  if (optedOut(el)) return null
  const tag = el.tagName.toLowerCase()
  if (tag === 'meta') {
    const id = norm(el.getAttribute('name') ?? el.getAttribute('property'))
    if (!id) return null
    if (!META_NAMES.has(id) && !META_PREFIXES.some((p) => id.startsWith(p))) return null
    return `meta:${id}`
  }
  if (tag === 'link') {
    const rel = norm(el.getAttribute('rel'))
    if (!LINK_RELS.has(rel)) return null
    // `alternate` is repeatable — a locale, a feed, a print sheet are distinct
    // slots, so the discriminating attributes are part of the key. All three
    // are case-insensitive (BCP 47 tags, MIME types, media queries), so they
    // are normalized: `hreflang="en-US"` and `en-us` are one slot, not two
    // that would accumulate a duplicate on every navigation.
    const hreflang = norm(el.getAttribute('hreflang'))
    const type = norm(el.getAttribute('type'))
    const media = norm(el.getAttribute('media'))
    return `link:${rel}|${hreflang}|${type}|${media}`
  }
  return null
}

/** Index a head's allowlisted nodes by key, keeping duplicates in document order. */
function indexHead(head: Element): Map<string, Element[]> {
  const byKey = new Map<string, Element[]>()
  for (const el of head.querySelectorAll('meta, link')) {
    const key = headKey(el)
    if (!key) continue
    const bucket = byKey.get(key)
    if (bucket) bucket.push(el)
    else byKey.set(key, [el])
  }
  return byKey
}

/**
 * Bring the live `<head>`'s allowlisted metadata in line with `incomingDoc`.
 *
 * - key in both → replace in place (skipped when the nodes are already equal,
 *   so metadata shared across routes causes no DOM churn)
 * - key only incoming → appended
 * - key only current → removed, so it can't leak forward into every later route
 *   the way an unmanaged `<link rel="stylesheet">` does
 *
 * Duplicates under one key are collapsed to the incoming node — a page with two
 * `<meta name="description">` is malformed, and leaving the extra behind would
 * defeat the reconciliation.
 *
 * `<title>` is **not** handled here: the router writes it alongside this call
 * because the route announcement (`announceNavigation`) needs the same string.
 *
 * Ordering-free — no load, no layout effect — so the caller may run it at any
 * point around the swap.
 */
export function reconcileHead(incomingDoc: Document): void {
  const head = document.head
  const incomingHead = incomingDoc.head
  if (!head || !incomingHead) return

  const current = indexHead(head)
  const incoming = indexHead(incomingHead)
  if (current.size === 0 && incoming.size === 0) return

  for (const [key, nodes] of incoming) {
    const live = current.get(key)
    const replacement = document.importNode(nodes[0], true)
    if (!live) {
      head.append(replacement)
      continue
    }
    const [first, ...duplicates] = live
    if (!first.isEqualNode(replacement)) first.replaceWith(replacement)
    for (const dup of duplicates) dup.remove()
  }

  for (const [key, nodes] of current) {
    if (incoming.has(key)) continue
    for (const node of nodes) node.remove()
  }
}
