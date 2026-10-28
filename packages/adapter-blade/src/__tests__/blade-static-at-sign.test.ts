/**
 * Raw-byte regression for the `@` spelling in static text (#3758 review).
 *
 * Each `@` in static text is emitted as a raw `<?php echo '@'; ?>` block.
 * PHP drops the one newline right after `?>`, so a newline that follows an
 * `@` must survive through the extra `\n` the adapter adds. The shared
 * conformance fixtures cannot see this: `normalizeHTML` collapses
 * whitespace, including inside `<pre>`. The doubled-brace cases (`{{@`,
 * `@{{`) live here instead of the shared fixture because a lone `{{` is a
 * delimiter on other engines, a separate gap.
 */
import { test, expect } from 'bun:test'
import { BladeAdapter } from '../adapter'
import { renderBladeComponent, BladeNotAvailableError } from '../test-render'

const SOURCE = `
export function AtSignNewline() {
  return (
    <div title="{@" data-b="{{@" data-c="@{{">
      <pre>a@&#10;b@&#13;&#10;c@&#10;&#10;d{'{'}@</pre>
      <p>&#123;&#123;@|@&#123;&#123;|@@|@&#125;</p>
    </div>
  )
}
`

test('a newline right after a static @ is kept, and @ beside a brace or @ stays literal (blade)', async () => {
  let html: string
  try {
    html = await renderBladeComponent({ source: SOURCE, adapter: new BladeAdapter() })
  } catch (err) {
    if (err instanceof BladeNotAvailableError) {
      console.log(`Skipping: ${err.message}`)
      return
    }
    throw err
  }
  expect(html).toContain('a@\nb@\r\nc@\n\nd')
  expect(html).toContain('title="{@"')
  expect(html).toContain('data-b="{{@"')
  expect(html).toContain('data-c="@{{"')
  expect(html).toContain('<p>{{@|@{{|@@|@}</p>')
})
