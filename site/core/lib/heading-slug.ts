/**
 * The docs site's heading-`id` rule, in one place.
 *
 * Two callers need the same answer and must not drift (CLAUDE.md's "one
 * decision, two implementations" rule):
 *
 * - `markdown.ts`'s `heading` renderer, which stamps the `id` a docs page's
 *   heading actually gets — and which the page's table of contents and every
 *   `#…` link resolve against.
 * - `scripts/generate-api-reference.ts`, which emits the API reference's own
 *   index links and checks the README's links into it. It knows each heading
 *   only as the markdown it is about to write, so it has to predict the id
 *   the site will assign.
 *
 * Accepts either form of heading text: the rendered inline HTML the renderer
 * holds (`<code>createSignal()</code>`) or the markdown a generator holds
 * (`` `createSignal()` ``). Tags and backticks are both dropped, so the two
 * spellings of one heading agree.
 *
 * Not a general-purpose slugger: no transliteration, no de-duplication
 * counter. A page that would collide is a bug at that page's source — the
 * API reference generator fails its own run on a collision rather than
 * silently shipping two headings that claim one anchor.
 */
export function headingSlug(headingText: string): string {
  return headingText
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/`/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}
