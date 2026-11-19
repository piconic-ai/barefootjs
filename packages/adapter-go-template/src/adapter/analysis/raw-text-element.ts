/**
 * `<style>` / `<script>` text holding a dynamic value (#3810).
 *
 * Go's `html/template` parses the text of these elements as CSS / JS, not
 * HTML, so an action printed there is escaped for that language: a plain
 * string becomes `ZgotmplZ` (CSS) or a quoted JS string literal (JS), and the
 * reactive-slot comment markers become `ZgotmplZ` / `<!--…`. No output
 * action can print the JS value as written without a `template.CSS` /
 * `template.JS` pass-through, which would make a request-derived value a
 * stylesheet / script injection point. The shape is refused instead.
 *
 * Only text is allowed to stand in these elements: literal text carries no
 * action. Any expression child is refused, a `/* @client *\/` one included,
 * since its client-side rendering here is unverified.
 */

import type { IRNode } from '@barefootjs/jsx'

const RAW_TEXT_TAGS: ReadonlySet<string> = new Set(['style', 'script'])

export function isRawTextTag(tag: string): boolean {
  return RAW_TEXT_TAGS.has(tag)
}

/** The first child that would print through an output action, or null. */
export function findDynamicRawTextChild(children: readonly IRNode[]): IRNode | null {
  return findChildOutside(children)
}

/**
 * `<title>` / `<textarea>` in foreign content (#3937). The reference parses
 * their children as ordinary foreign content, where a reactive text child wears
 * `<!--bf:sN-->` markers; `html/template` reads the tag as RCDATA whatever the
 * namespace, and escapes every `<` there (the template text's and an action's
 * output, `template.HTML` included), so no marker can be emitted. What still
 * renders is text and a slotless expression (a plain value, escaped as RCDATA
 * text, which is what the reference prints). Anything else is refused: the
 * first such child, or null.
 */
export function findForeignRcdataBlocker(children: readonly IRNode[]): IRNode | null {
  return findChildOutside(children, node => node.type === 'expression' && node.slotId === null)
}

function findChildOutside(
  children: readonly IRNode[],
  allowed: (node: IRNode) => boolean = () => false,
): IRNode | null {
  for (const child of children) {
    if (child.type === 'text' || allowed(child)) continue
    if (child.type === 'fragment') {
      const nested = findChildOutside(child.children, allowed)
      if (nested) return nested
      continue
    }
    return child
  }
  return null
}
