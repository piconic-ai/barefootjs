/**
 * Encoding for the text of an HTML `<style>` / `<script>` element.
 *
 * The content of these elements is raw text: the HTML parser decodes no
 * character reference there, so `&quot;` reaches the CSS / JS parser as six
 * literal characters. The text is therefore written as it is, and only a
 * `<` that could begin markup and an `&` that could begin a character
 * reference are rewritten, in a form the language inside the element reads
 * back as the same character:
 *
 *   - `<style>`: `\3c ` and `\26 ` (each with its terminating space), the
 *     CSS escapes of `<` and `&` in a string, `url()` and identifier.
 *   - `<script>`: `\u003c` and `\u0026`, the escapes of `<` and `&` in a
 *     JavaScript string, template or regular-expression literal and in a
 *     JSON string.
 *
 * "Could begin markup" is a `<` followed by an ASCII letter, `/`, `!` or `?`
 * — every way the HTML tokenizer leaves text for a tag, an end tag, a
 * comment, a declaration or a bogus comment. "Could begin a character
 * reference" is an `&` followed by an ASCII letter or `#`. The rule is
 * deliberately wider than "the element's own end tag", because the same
 * bytes must mean the same text under BOTH ways the element can be parsed:
 *
 *   - As HTML raw text, only `</style` / `</script` ends the element, and in
 *     a `<script>` a `<!--` followed by `<script` reaches the double-escaped
 *     state, in which the real end tag no longer closes it. All of them
 *     start with `</`, `<!` or `<s`, so none survives, in any letter case.
 *     No reference is decoded, so the `&` rewrite changes nothing here.
 *   - As foreign content. A component cannot know where its markup lands:
 *     a `<style>` / `<script>` that is HTML to its own template is foreign
 *     once a caller places it inside an `<svg>`. There the tokenizer reads
 *     the text as ordinary data: `<img onerror=…>` in it is a tag (one that
 *     breaks out of the SVG into HTML), and `&quot;` is decoded to `"`,
 *     which ends the JSON or JS string a value was serialized into. With no
 *     `<` left before a letter, `/`, `!` or `?` and no `&` left before a
 *     letter or `#`, the tokenizer finds neither a tag nor a reference, and
 *     the element's text is byte for byte what the raw-text parse gives.
 *
 * The encoder must see the WHOLE element text: `<` and `/style>`, or `&` and
 * `quot;`, in two pieces spell what neither piece holds, so callers join
 * first (`IRElement.rawTextContent`). A `<` or `&` that ends the text is
 * followed by the element's own `</…>`, where it is text and the end tag is
 * read normally.
 *
 * What the rule costs: a `<` or `&` written directly before a letter OUTSIDE
 * a string is no longer the operator (`i<n`, `a&&b`, `(400px<width)`); write
 * it with a space (`i < n`, `a && b`), which is left alone. Code that must
 * be emitted byte for byte, and a non-CSS / non-JS data block that holds
 * markup (`<script type="text/template">`), go through
 * `dangerouslySetInnerHTML`.
 *
 * Every backend runtime carries the same rule (`raw_text`), and the
 * conformance corpus renders the same values through all of them.
 */

/** The elements whose text this module encodes. */
export type RawTextTag = 'style' | 'script'

/** True for `style` / `script`, the HTML raw text elements a component can render. */
export function isRawTextTag(tag: string): tag is RawTextTag {
  return tag === 'style' || tag === 'script'
}

/**
 * A `<` the HTML tokenizer could take as the start of markup, or an `&` it
 * could take as the start of a character reference.
 */
const MARKUP_OPEN = /<(?=[A-Za-z/!?])|&(?=[A-Za-z#])/g

const STYLE_ESCAPE: Readonly<Record<string, string>> = { '<': '\\3c ', '&': '\\26 ' }
const SCRIPT_ESCAPE: Readonly<Record<string, string>> = { '<': '\\u003c', '&': '\\u0026' }

/**
 * `text` as the whole content of a `<style>` or `<script>` element: unchanged
 * except for each `<` that could begin markup and each `&` that could begin
 * a character reference (see the file header).
 */
export function escapeRawText(tag: RawTextTag, text: string): string {
  const escapes = tag === 'style' ? STYLE_ESCAPE : SCRIPT_ESCAPE
  return text.replace(MARKUP_OPEN, ch => escapes[ch])
}
