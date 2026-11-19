/**
 * Client binding for a raw-text host (#3910): a `<style>`, `<script>`,
 * `<textarea>` or `<title>` whose expression children Phase 1 lowered to
 * slotless text (`IRElement.rawTextHost`, `raw-text-host.ts`).
 *
 * Such text has no comment marker, so the update rewrites the element's whole
 * content from its children, as a pseudo reactive attribute
 * (`RAW_TEXT_CONTENT_ATTR`) that rides the ordinary `reactiveAttrs` wiring
 * (element ref, props rewrite, effect, reference graph).
 */

import { escapeHtml, isRawTextTag } from '@barefootjs/shared'
import type { IRElement, IRNode } from '../types.ts'
import { decideWrapFromAstFlags } from './reactivity.ts'
import type { ClientJsContext } from './types.ts'
import { rawTextContent } from './safe-html.ts'
import { codeSafeStringLiteral, RAW_TEXT_CONTENT_ATTR } from './utils.ts'

/** Text and expression children in source order, fragments flattened. */
function flattenHostChildren(children: readonly IRNode[], out: (IRNode & { type: 'text' | 'expression' })[]): void {
  for (const child of children) {
    if (child.type === 'text' || child.type === 'expression') out.push(child)
    else if (child.type === 'fragment') flattenHostChildren(child.children, out)
  }
}

/**
 * The JS expression that builds the host's content, the way SSR renders it.
 * Null when no child needs a client update (its SSR text is already in the
 * DOM).
 *
 * A `<textarea>` / `<title>` joins its parts HTML-escaped one by one (an
 * entity cannot be spelled across parts into markup: every `<` is escaped).
 * A `<style>` / `<script>` is not HTML-escaped, so its WHOLE text goes
 * through one `escapeRawTextContent` call on every update: the rewrite of
 * the element-ending sequences is only sound over the joined text
 * (`rawTextContent`, #3934).
 */
function hostContentExpression(element: IRElement): string | null {
  const parts: (IRNode & { type: 'text' | 'expression' })[] = []
  flattenHostChildren(element.children, parts)
  const needsUpdate = parts.some(p => p.type === 'expression' && decideWrapFromAstFlags(p).wrap)
  if (!needsUpdate) return null
  if (element.rawTextContent && isRawTextTag(element.tag)) {
    const values = element.rawTextContent.map(p => (p.type === 'text' ? codeSafeStringLiteral(p.value) : p.expr))
    return rawTextContent(element.tag, values)
  }
  const pieces = parts.map(p =>
    p.type === 'text' ? codeSafeStringLiteral(escapeHtml(p.value)) : `escapeText(${p.expr})`,
  )
  const joined = `[${pieces.join(', ')}].join('')`
  // The HTML parser drops ONE leading line feed of a `<textarea>`'s content
  // (start-tag handling), so SSR and the CSR template — both parsed with the
  // start tag — never carry it. `innerHTML` on the existing element is a
  // fragment parse with no start tag and would keep it: strip it here so the
  // hydrated and updated value match the server-rendered one.
  return element.tag === 'textarea' ? `${joined}.replace(/^\\n/, '')` : joined
}

/** Registers the host's content update on `ctx` (top level only). */
export function collectRawTextHost(element: IRElement, ctx: ClientJsContext): void {
  if (!element.rawTextHost || !element.slotId) return
  const expression = hostContentExpression(element)
  if (expression === null) return
  ctx.reactiveAttrs.push({ slotId: element.slotId, attrName: RAW_TEXT_CONTENT_ATTR, expression })
}
