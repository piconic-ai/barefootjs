import { expect, test } from 'bun:test'
import { pebbleHashKey, pebbleStringLiteral } from '../adapter/lib/pebble-naming.ts'
import { isJavaToolchainAvailable, renderPebbleTemplate } from '../test-render.ts'

for (const value of ['', 'plain', 'a\\b', "a'b", "a\\'b", '\\', '\\\\', "\\''", '` \\ ${notCode}', '#{oops}', '日本語']) {
  test.skipIf(!isJavaToolchainAvailable())(`Pebble string value and map key round-trip ${JSON.stringify(value)}`, async () => {
    const rendered = await renderPebbleTemplate({
      template: `{{ ${pebbleStringLiteral(value)} | raw }}|{{ bf.get({${pebbleHashKey(value)}: 'found'}, wanted) | raw }}`,
      vars: { wanted: value },
    })
    expect(rendered).toBe(`${value}|found`)
  })
}
