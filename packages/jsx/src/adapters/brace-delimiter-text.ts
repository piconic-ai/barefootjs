/**
 * Static text in a template engine whose tags open with a brace — Jinja,
 * MiniJinja, Twig and Pebble (`{{`, `{%`, `{#`), Go `html/template` (`{{`)
 * — must never put a tag opener into the template: JSX text such as
 * `&#123;&#123; 1 &#125;&#125;` decodes to `{{ 1 }}`, which Hono prints as
 * written but such an engine compiles as a tag, and so prints `1` or fails
 * to parse.
 *
 * Every `{` that is followed by one of `followers` (the characters that turn
 * a `{` into a tag opener on this engine) is emitted through `literal`
 * instead — an output expression for the brace itself (`{{ '{' }}`,
 * `{{"{"}}`). So is a `{` that ends the text: the text cannot know what the
 * adapter writes after it, and a following output tag (`{{ x }}`) would turn
 * that brace into part of a longer opener. The expression renders the same
 * character either way.
 */
export function escapeBraceDelimiters(text: string, followers: string, literal: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    out += ch === '{' && (next === undefined || followers.includes(next)) ? literal : ch
  }
  return out
}
