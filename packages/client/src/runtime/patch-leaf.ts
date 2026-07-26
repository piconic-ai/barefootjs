/**
 * In-place patch for flatMap leaf elements (the descriptor-based
 * `mapArray` path — see `stringifyPlainLoop`'s flatMap branch in
 * `@barefootjs/jsx`).
 *
 * flatMap leaves carry no per-slot reactive wiring (the compiler refuses
 * leaves that would need it), so a leaf whose rendered HTML changed under a
 * stable key is updated wholesale: attributes are synced and children are
 * replaced from the freshly rendered string. The element's identity is
 * preserved — `mapArray` holds the node in its keyed scope map, so the
 * patch must never swap the node itself.
 *
 * `data-key` is excluded from attribute sync: reconciliation identity is
 * owned by `mapArray` (stamped via `setAttribute`), never by leaf content.
 */
export function patchLeaf(el: Element, html: string): void {
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const next = tpl.content.firstElementChild
  if (!next) return
  if (next.tagName !== el.tagName) {
    // A root-tag change under a stable key cannot swap the node without
    // desyncing mapArray's keyed scope. Attributes/children still patch
    // onto the existing tag; the honest fix is a distinct key per branch.
    console.warn(
      '[barefootjs] flatMap leaf root tag changed under a stable key ' +
        `(<${el.tagName.toLowerCase()}> -> <${next.tagName.toLowerCase()}>); ` +
        'give each branch its own key so the node is replaced instead of patched.',
    )
  }
  for (const name of el.getAttributeNames()) {
    if (name === 'data-key') continue
    if (!next.hasAttribute(name)) el.removeAttribute(name)
  }
  for (const name of next.getAttributeNames()) {
    if (name === 'data-key') continue
    const value = next.getAttribute(name)
    if (value !== null && el.getAttribute(name) !== value) el.setAttribute(name, value)
  }
  el.replaceChildren(...Array.from(next.childNodes))
}
