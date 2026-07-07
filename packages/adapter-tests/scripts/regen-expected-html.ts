/**
 * Regenerate `expectedHtml` for SPECIFIC fixture ids from the Hono
 * reference — the targeted sibling of `generate-expected-html.ts`
 * (which regenerates the whole corpus AND the shared-component
 * snapshots). Use this when a compiler change alters the reference
 * output of a handful of fixtures:
 *
 *   bun run packages/adapter-tests/scripts/regen-expected-html.ts <id> [<id>…]
 */
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import { normalizeHTML } from '../src/jsx-runner'
import { indentHTML } from '../src/indent-html'
import { jsxFixtures } from '../fixtures'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ids = new Set(process.argv.slice(2))
const FIXTURES_DIR = resolve(import.meta.dir, '../fixtures')
for (const fixture of jsxFixtures) {
  if (!ids.has(fixture.id)) continue
  const html = await renderHonoComponent({
    source: fixture.source,
    adapter: new HonoAdapter(),
    props: fixture.props,
    components: fixture.components,
  })
  const block = `  expectedHtml: \`${indentHTML(normalizeHTML(html))}\`,`
  for (const sub of ['', 'methods']) {
    const p = sub ? resolve(FIXTURES_DIR, sub, `${fixture.id}.ts`) : resolve(FIXTURES_DIR, `${fixture.id}.ts`)
    if (!existsSync(p)) continue
    let content = readFileSync(p, 'utf-8')
    content = content.replace(/  expectedHtml: `[^`]*`,/s, block)
    writeFileSync(p, content)
    console.log('✓', fixture.id)
  }
}
