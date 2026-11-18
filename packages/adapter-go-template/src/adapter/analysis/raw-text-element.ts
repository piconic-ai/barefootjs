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
  for (const child of children) {
    if (child.type === 'text') continue
    if (child.type === 'fragment') {
      const nested = findDynamicRawTextChild(child.children)
      if (nested) return nested
      continue
    }
    return child
  }
  return null
}
