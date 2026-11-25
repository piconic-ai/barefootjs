/**
 * The literal text of a `<style>` / `<script>` element whose `{` would open
 * a Go action (#3967).
 *
 * Template text guards such a brace with `{{"{"}}` (`escapeGoStaticText`),
 * but html/template escapes that action's output for the element's context:
 * `\7b ` / `ZgotmplZ` in a `<style>`, a quoted JS string (or an escape error)
 * in a `<script>`. The text is printed instead as ONE `bf_raw_text_literal`
 * action at the start of the element body, typed for the context
 * html/template reads there (`template.CSS`, `template.JS` or
 * `template.HTML`), which html/template passes through unchanged. The text
 * is already the `escapeRawText` encoding the reference prints, and a
 * compile-time constant, so no contextual sanitizing of data is skipped.
 */

import type { IRElement, IRNode } from '@barefootjs/jsx'
import { escapeHtml, escapeRawText, type RawTextTag } from '@barefootjs/shared'

import { escapeGoStaticText, escapeGoString } from './go-emit.ts'

/** How html/template reads the body of a raw-text element, by the type its value is printed as. */
export type GoRawTextContext = 'css' | 'js' | 'html'

/**
 * The MIME types html/template reads as JavaScript in a `<script type>`
 * (`isJSType`, `html/template/js.go`, Go 1.25). Any other literal type makes
 * it read the body as HTML text.
 */
const GO_JS_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/json',
  'application/ld+json',
  'application/x-ecmascript',
  'application/x-javascript',
  'module',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
])

/** html/template's `isJSType`: parameters dropped, then lower-cased and trimmed. */
export function isGoJsMimeType(attrText: string): boolean {
  const semicolon = attrText.indexOf(';')
  const mime = (semicolon === -1 ? attrText : attrText.slice(0, semicolon)).toLowerCase().trim()
  return GO_JS_MIME_TYPES.has(mime)
}

/**
 * The context html/template reads at the start of the element body, or
 * `null` when this adapter does not settle it at compile time. A `<style>`
 * is CSS. A `<script>` is JavaScript unless html/template reads a `type`
 * attribute in the template text that is not a JavaScript type (`isJSType`
 * on the text after the last action in the value). An attribute spread is
 * one action, so html/template reads no `type` in it.
 */
export function goRawTextContext(tag: RawTextTag, attrs: IRElement['attrs']): GoRawTextContext | null {
  if (tag === 'style') return 'css'
  let context: GoRawTextContext | null = 'js'
  for (const attr of attrs) {
    if (attr.value.kind === 'spread' || attr.name.toLowerCase() !== 'type') continue
    context = scriptTypeContext(attr)
  }
  return context
}

/** How html/template reads a `<script>` body after this `type` attribute (see `goRawTextContext`). */
function scriptTypeContext(attr: IRElement['attrs'][number]): GoRawTextContext | null {
  // A value a spread may replace prints under a condition, and a
  // `/* @client */` one is left out of the template.
  if (attr.spreadOverridable || attr.clientOnly) return null
  const value = attr.value
  if (value.kind === 'literal') return typeTextContext(value.value)
  // A `${…}` / ternary / lookup part prints as an action: html/template reads
  // the static text after the last one.
  if (value.kind === 'template') return typeTextContext(trailingStaticText(value.parts))
  if (value.kind !== 'expression' || !value.parsed) return null
  // Any other expression prints as one action, with no text after it.
  return typeTextContext(value.parsed.kind === 'template-literal' ? trailingStaticText(value.parsed.parts) : '')
}

/** The static text after the last part that is not a `string` part. */
function trailingStaticText(parts: readonly ({ type: 'string'; value: string } | { type: string })[]): string {
  let text = ''
  for (const part of parts) text = 'value' in part && part.type === 'string' ? text + part.value : ''
  return text
}

/**
 * The context after a `type` whose value ends with `text` in the template.
 * The text as written there is HTML-escaped; a `{` in it the Go lexer would
 * read prints through an action instead, so the text html/template reads is
 * not the value's.
 */
function typeTextContext(text: string): GoRawTextContext | null {
  const written = escapeHtml(text)
  if (needsRawTextLiteralAction(written)) return null
  return isGoJsMimeType(written) ? 'js' : 'html'
}

/**
 * The whole literal text of a `<style>` / `<script>` as the reference prints
 * it, or `null` when it is not text alone (the children render one by one):
 * in HTML content the `escapeRawText` encoding of its `rawTextContent` (an
 * expression part was refused, and prints nothing); in foreign content
 * (`foreignRawTextTag`), where the children are ordinary text, their
 * HTML-escaped values, joined.
 */
export function literalRawText(element: IRElement, tag: RawTextTag): { tag: RawTextTag; text: string } | null {
  if (element.rawTextContent) {
    const text = element.rawTextContent.map(part => (part.type === 'text' ? part.value : '')).join('')
    return { tag, text: escapeRawText(tag, text) }
  }
  if (!element.foreignRawTextTag) return null
  const values: string[] = []
  return collectTextValues(element.children, values) ? { tag, text: values.map(escapeHtml).join('') } : null
}

/** The values of `children`, fragments flattened, or `false` when one is not text. */
function collectTextValues(children: readonly IRNode[], values: string[]): boolean {
  for (const child of children) {
    if (child.type === 'text') values.push(child.value)
    else if (child.type !== 'fragment' || !collectTextValues(child.children, values)) return false
  }
  return true
}

/** Whether the encoded text has a `{` that template text would have to guard from the Go lexer. */
export function needsRawTextLiteralAction(encoded: string): boolean {
  return escapeGoStaticText(encoded) !== encoded
}

/** The encoded text as one typed action (see the module docstring). */
export function emitRawTextLiteral(context: GoRawTextContext, encoded: string): string {
  return `{{bf_raw_text_literal "${context}" "${escapeGoString(encoded)}"}}`
}
