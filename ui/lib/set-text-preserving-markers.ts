/**
 * BarefootJS UI - marker-preserving imperative text writes
 *
 * A compiled `{expr}` JSX text child is wrapped in a `<!--bf:sN-->…<!--/-->`
 * comment marker pair (both at SSR and by the client hydration template),
 * and the compiler emits its OWN `createEffect` that keeps the text node
 * between those markers in sync with `expr`. When a component's own `ref`/
 * mount effect ALSO needs to write that same text imperatively — because
 * the real value depends on something the compiler can't see inside the
 * render function itself (e.g. a DOM query against portaled content driven
 * by a `useContext` read, the `ComboboxValue`/`SelectValue` pattern) — a
 * plain `el.textContent = …` clobbers ALL of `el`'s children, markers
 * included, leaving a bare text node where SSR (and the compiler's own
 * writer) left a marker-wrapped one. That's a permanent SSR-vs-hydrated
 * structural mismatch, not a value change (#3160).
 *
 * This helper writes only the text NODE between any existing sibling
 * comment markers, leaving the markers themselves untouched — the same
 * discipline the compiler's own slot writer already follows
 * (`@barefootjs/client/runtime/claim-slots.ts`).
 */

/**
 * Set `el`'s text content without disturbing any comment-node children
 * (slot markers). Assumes `el`'s only non-comment child, if any, is the
 * single text node this position owns — true for any element whose JSX
 * content is exactly one `{expr}` text child, which is the only shape a
 * component would pair with this helper.
 *
 * @param el - The element whose text content to set.
 * @param text - The new text. Passing `''` clears an existing text node's
 *   data but does not remove it, and does not create one where none
 *   existed (matching `escapeTextOrMarkup`'s empty-render behavior).
 */
export function setTextPreservingMarkers(el: Element, text: string): void {
  let textNode: Text | null = null
  let endMarker: ChildNode | null = null
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      textNode = child as Text
    } else if (child.nodeType === Node.COMMENT_NODE) {
      if (child.nodeValue === '/') endMarker = child
    } else {
      // Not a marker-wrapped single text position after all (an unexpected
      // element/other child is present) — fall back to a plain replace
      // rather than guessing where to splice.
      el.textContent = text
      return
    }
  }
  if (textNode) {
    textNode.data = text
  } else if (text !== '') {
    // No text node yet (SSR rendered nothing between the markers, e.g. an
    // initially empty value) — insert one, before the closing marker when
    // one is present so a marker pair stays paired, or at the end otherwise.
    el.insertBefore(document.createTextNode(text), endMarker)
  }
}
