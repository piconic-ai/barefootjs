import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `unlowered-global-call`: the call is deferred to
 * the browser, so the server renders neither the attribute nor the text and
 * the client runtime fills them at hydration.
 */
export const fixture = createFixture({
  id: 'unlowered-global-call-client',
  description: 'A /* @client */ zero-arg global call defers to the browser instead of refusing SSR (#3505)',
  source: `
'use client'

export function GlobalCall() {
  const stamp = Date.UTC()
  return <p title={/* @client */ Date.UTC()}>{/* @client */ stamp}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
