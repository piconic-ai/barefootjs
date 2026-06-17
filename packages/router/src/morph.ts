/**
 * Permanent-node preservation during a region swap (spec/router.md **v1**,
 * "persistence within a region": `data-bf-permanent` + idiomorph-style
 * morphing).
 *
 * A plain swap (`replaceChildren`) tears the whole region down and rebuilds it,
 * so anything with live state inside the region — a playing `<video>`, a
 * scrolled list, an open `<details>`, an input's value — is lost across a
 * navigation. An element marked `data-bf-permanent` is instead **preserved**:
 * its *live* DOM node (with its state, media playback, scroll, and already-
 * hydrated reactive scope) is moved into the incoming tree at the matching
 * position, rather than disposed and recreated. (Focus is not preserved when
 * the router's default `manageFocus` moves it to the region heading post-swap.)
 *
 * The match is keyed by the `data-bf-permanent` value (falling back to `id`),
 * so the same logical element is recognised across the two page documents —
 * idiomorph's id-keyed node reuse, scoped to the nodes the author marked.
 */

/** Stable key for a permanent element: its `data-bf-permanent` value, else `id`. */
function permanentKey(el: Element): string | null {
  const attr = el.getAttribute('data-bf-permanent')
  if (attr) return attr
  if (el.id) return el.id
  return null // marked but unkeyed → cannot be matched across documents; treated as ordinary content
}

/**
 * Assemble the incoming region nodes, moving any **live** `[data-bf-permanent]`
 * node from `current` into the matching position of the new tree. Returns the
 * fragment to insert.
 *
 * Call this **before** disposing `current`: moving the live nodes out first is
 * exactly what spares them from the dispose walk, and re-inserting them keeps
 * their hydrated scope marks so the subsequent re-hydration walk skips them
 * (`hydrateElementScope` is a no-op on an already-hydrated node).
 */
export function buildMorphedContent(current: Element, incoming: Node[]): DocumentFragment {
  const fragment = document.createDocumentFragment()
  for (const node of incoming) fragment.appendChild(node)

  // Index the live permanent nodes currently mounted in the region.
  const liveByKey = new Map<string, Element>()
  for (const el of current.querySelectorAll('[data-bf-permanent]')) {
    const key = permanentKey(el)
    if (key && !liveByKey.has(key)) liveByKey.set(key, el)
  }
  if (liveByKey.size === 0) return fragment

  // For each incoming placeholder with a matching key, swap in the live node.
  for (const placeholder of Array.from(fragment.querySelectorAll('[data-bf-permanent]'))) {
    // Nested permanents: this list is a snapshot. Once an *outer* placeholder is
    // replaced by a live node, its descendant placeholders detach from
    // `fragment` — and that live node already carries its own nested permanents
    // from the old tree, so we must NOT then yank those out into a stale
    // placeholder. Skip any placeholder no longer rooted in `fragment`.
    if (!fragment.contains(placeholder)) continue
    const key = permanentKey(placeholder)
    if (!key) continue
    const live = liveByKey.get(key)
    if (!live) continue
    // Moves `live` out of `current` and into the new tree at the placeholder's
    // position; the freshly-parsed placeholder is discarded.
    placeholder.replaceWith(live)
    liveByKey.delete(key) // one live node per key
  }

  return fragment
}
