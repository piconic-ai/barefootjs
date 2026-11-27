/**
 * The one place that decides how a compile-time string becomes a JS string
 * literal in emitted code (client JS, the Hono adapter's TSX, a JS
 * expression the compiler spells for a later stage to splice).
 *
 * `JSON.stringify` alone spells a valid JS string literal but leaves `<`,
 * U+2028 and U+2029 raw. A `</script>` or `<!--` in a literal closes or
 * re-modes an inline `<script>` the code might end up in, and before ES2019
 * U+2028 / U+2029 ended a string literal. Those three characters are
 * written as `\uXXXX`, which evaluates to the same string, so a value
 * without them prints exactly as `JSON.stringify` printed it.
 *
 * `<` is the only character the HTML tokenizer needs to leave script data:
 * an end tag (`</script`), a comment opener (`<!--`) and the double-escaped
 * `<script` all begin with it. So `>` and `/` are NOT escaped: with every
 * `<` written as `\u003c`, they open nothing, and escaping them would only
 * rewrite paths, URLs and utility classes. That rewrite is not harmless.
 * UnoCSS scans the compiled output for class names, and a class literal
 * spelled `"[&\u003e*]:w-full"` is extracted as a garbage class whose
 * selector is invalid CSS, which drops every rule it is grouped with
 * (`.w-full` among them).
 *
 * The guarantee is about string literals only: the client JS also carries
 * markup in template literals (the row / branch HTML templates), which this
 * module does not touch.
 */

const SCRIPT_UNSAFE = /[<\u2028\u2029]/g

function unicodeEscape(ch: string): string {
  return `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
}

/**
 * Rewrite the script-unsafe characters of a string literal BODY (the text
 * between the quotes, already escaped for its quote style) as `\uXXXX`.
 * Exposed so a spelling with another quote style (the single-quoted ternary
 * branch in `template-parts.ts`) applies the same set, not its own copy.
 */
export function escapeScriptUnsafe(body: string): string {
  return body.replace(SCRIPT_UNSAFE, unicodeEscape)
}

/**
 * A double-quoted JS string literal for `value`, safe to splice into emitted
 * code wherever it lands (see the file header).
 */
export function codeSafeStringLiteral(value: string): string {
  // The `.replace` sits directly on the `JSON.stringify` result so a static
  // analyser (CodeQL's js/bad-code-sanitization) sees the sanitising step.
  return JSON.stringify(value).replace(SCRIPT_UNSAFE, unicodeEscape)
}

/**
 * A JS array literal of {@link codeSafeStringLiteral} elements, printed
 * exactly as `JSON.stringify` prints an array of ordinary strings.
 */
export function codeSafeStringArray(values: readonly string[]): string {
  return `[${values.map(codeSafeStringLiteral).join(',')}]`
}
