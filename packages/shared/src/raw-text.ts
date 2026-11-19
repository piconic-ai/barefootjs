/**
 * Encoding for the text of an HTML `<style>` / `<script>` element.
 *
 * The content of these elements is raw text: the HTML parser decodes no
 * character reference there, so `&quot;` reaches the CSS / JS parser as six
 * literal characters. The value is therefore written as it is, and only the
 * character sequences that would let it leave the element are rewritten, in
 * a form the language inside the element reads back as the same text:
 *
 *   - `<style>`: the element ends at `</style` (ASCII case-insensitive). The
 *     `/` is written as the CSS escape `\/`, which a CSS string, `url()` and
 *     identifier read as `/`.
 *   - `<script>`: the element ends at `</script`, and `<script` after a
 *     `<!--` enters the double-escaped state, in which the real end tag no
 *     longer closes it (both ASCII case-insensitive). The `<` is written as
 *     `\u003c`, which a JavaScript string, template or regular-expression
 *     literal and a JSON string read as `<`. With every `<script` and
 *     `</script` rewritten, a `<!--` in the value cannot keep the element
 *     open, so it is left as written.
 *
 * Neither sequence can stand in such an element at all, so a value that holds
 * one outside a string (`a</script/.test(b)`, a `text/plain` data block) is
 * changed rather than left to end the element early; inside a string the
 * rewritten value is equal to the written one.
 *
 * Every backend runtime carries the same two rules (`raw_text`), and the
 * conformance corpus renders the same values through all of them.
 */

/** The elements whose text this module encodes. */
export type RawTextTag = 'style' | 'script'

/** True for `style` / `script`, the HTML raw text elements a component can render. */
export function isRawTextTag(tag: string): tag is RawTextTag {
  return tag === 'style' || tag === 'script'
}

const STYLE_END = /<\/([sS][tT][yY][lL][eE])/g
const SCRIPT_TAG = /<(\/?[sS][cC][rR][iI][pP][tT])/g

/**
 * `text` as the content of a `<style>` or `<script>` element: unchanged
 * except for the sequences that would end the element (see the file header).
 */
export function escapeRawText(tag: RawTextTag, text: string): string {
  return tag === 'style' ? text.replace(STYLE_END, '<\\/$1') : text.replace(SCRIPT_TAG, '\\u003c$1')
}
