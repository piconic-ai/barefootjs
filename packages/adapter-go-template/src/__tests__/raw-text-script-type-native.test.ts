/**
 * #3967: which `<script type>` spellings html/template reads as JavaScript
 * decides how a literal `{{` in the script text is printed. Each case renders
 * through the real Go html/template (`renderGoTemplateComponent`), so the
 * compile-time reading (`raw-text-literal.ts`) is checked against the Go
 * release the suite runs on, not against a copy of its rules. A spelling the
 * compiler cannot read the way every supported Go release does is refused.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { renderGoTemplateComponent } from '@barefootjs/go-template/test-render'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

const TEXT = 'let n = "&#123;&#123;"; // &#123;'
const RENDERED = 'let n = "{{"; // {'

const source = (attrs: string) => `
export function T() {
  return <div><script ${attrs}>${TEXT}</script></div>
}
`

/** The text between the open and the close tag of the rendered script. */
function scriptBody(html: string): string {
  const open = html.indexOf('<script')
  const start = html.indexOf('>', open) + 1
  return html.slice(start, html.indexOf('</script>', start))
}

describe('GoTemplateAdapter - a literal brace under each <script type> spelling, rendered by Go (#3967)', () => {
  const renders: Record<string, string> = {
    'a JavaScript type': 'type="module"',
    'a text type': 'type="text/plain"',
    'an upper-case attribute name': 'TYPE="text/plain"',
    'a mixed-case attribute name and an upper-case value': 'Type="MODULE"',
    'ASCII spaces and a parameter around a JavaScript type': 'type=" module;charset=utf-8 "',
    'a parameter after a text type': 'type="text/plain;x=module"',
    'a JSON type': 'type="application/ld+json"',
    'only a `language` attribute, which html/template does not read': 'language="text/plain"',
    'a `language` attribute beside a text type': 'language="javascript" type="text/plain"',
    // html/template leaves script context at the first `type` it does not
    // read as JavaScript and reads no later one: the body is JavaScript only
    // when every `type` is.
    'a text type then a JavaScript type': 'type="text/plain" TYPE="module"',
    'a JavaScript type then a text type': 'type="module" TYPE="text/plain"',
    'two JavaScript types': 'type="module" TYPE="text/javascript"',
  }
  for (const [name, attrs] of Object.entries(renders)) {
    test(`${name} (${attrs}) prints the text as written`, async () => {
      const html = await renderGoTemplateComponent({ source: source(attrs), adapter: new GoTemplateAdapter() })
      expect(scriptBody(html)).toBe(RENDERED)
    })
  }

  const refused: Record<string, string> = {
    // Go's `strings.TrimSpace` keeps a BOM, JS `trim` drops it: Go reads
    // `module` + BOM as a text type.
    'a BOM after a JavaScript type': 'type="module&#xFEFF;"',
    // Go's `strings.TrimSpace` drops U+0085, JS `trim` keeps it: Go reads
    // `module` + NEL as JavaScript.
    'a NEL after a JavaScript type': 'type="module&#x85;"',
    // Go's `strings.ToLower` maps a dotted capital I to `i`, JS to `i` and a
    // combining dot: Go reads it as `application/javascript`.
    'a non-ASCII letter that lower-cases differently': 'type="application/javascr\u0130pt"',
    // Go 1.25 reads an empty type as text, Go 1.26 as JavaScript.
    'an empty type': 'type=""',
    'a type of ASCII spaces': 'type="  "',
    // Both trim a no-break space, but no text outside ASCII is read.
    'a no-break space after a JavaScript type': 'type="module&#xA0;"',
  }
  for (const [name, attrs] of Object.entries(refused)) {
    test(`${name} (${attrs}) is refused`, () => {
      const { errors } = compileJSX(source(attrs).trimStart(), 'test.tsx', { adapter: new GoTemplateAdapter(), outputIR: false })
      expect(errors.map(e => e.code)).toEqual(['BF101'])
    })
  }
})
