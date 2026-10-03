/**
 * Static text in a template engine with LINE statements — Mojolicious
 * (`% if (…) {`) and Xslate Kolon (`: if (…) {`) — must never begin a
 * template line with the statement sigil: the engine reads such a line as
 * code, so `{c ? 'on' : 'off'} :y` (whose text lands on its own line right
 * after the conditional's closing `: }`) fails to parse, or vanishes when the
 * line happens to parse (#3311).
 *
 * Every sigil that is the first non-blank character of the text or of a line
 * inside it is emitted through `literal` instead — an output expression for
 * the sigil character itself (`<%= '%' %>`, `<: ':' :>`). The text cannot know
 * whether it starts a template line (that depends on what precedes it), so a
 * line-leading sigil is always rewritten; the expression renders the same
 * character either way.
 */
export function escapeLineStatementSigil(text: string, sigil: string, literal: string): string {
  return text
    .split('\n')
    .map(line => {
      const indent = line.length - line.trimStart().length
      return line.startsWith(sigil, indent) ? line.slice(0, indent) + literal + line.slice(indent + sigil.length) : line
    })
    .join('\n')
}
