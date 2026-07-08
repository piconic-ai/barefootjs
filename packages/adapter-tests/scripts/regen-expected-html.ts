/**
 * Regenerate `expectedHtml` for SPECIFIC fixture ids from the Hono
 * reference — the targeted sibling of `generate-expected-html.ts`
 * (which regenerates the whole corpus AND the shared-component
 * snapshots). Use this when a compiler change alters the reference
 * output of a handful of fixtures:
 *
 *   bun run packages/adapter-tests/scripts/regen-expected-html.ts <id> [<id>…]
 *
 * Fails loudly (non-zero exit) when invoked without ids, when an id
 * doesn't exist in the corpus, when its fixture file can't be located,
 * or when the file carries no inline `expectedHtml:` block to replace
 * (snapshot-backed shared fixtures keep their expected output in
 * `__snapshots__/`, not inline — regenerate those with
 * `scripts/snapshot.ts` instead).
 */
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import { normalizeHTML } from '../src/jsx-runner'
import { indentHTML } from '../src/indent-html'
import { jsxFixtures } from '../fixtures'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURES_DIR = resolve(import.meta.dir, '../fixtures')
// Keep in sync with generate-expected-html.ts's FIXTURE_SUBDIRS.
const FIXTURE_SUBDIRS = ['', 'methods']

function resolveFixturePath(id: string): string | null {
  for (const sub of FIXTURE_SUBDIRS) {
    const candidate = sub
      ? resolve(FIXTURES_DIR, sub, `${id}.ts`)
      : resolve(FIXTURES_DIR, `${id}.ts`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

const ids = process.argv.slice(2)
if (ids.length === 0) {
  console.error('usage: regen-expected-html.ts <fixture-id> [<fixture-id>…]')
  process.exit(1)
}

let failed = false
for (const id of ids) {
  const fixture = jsxFixtures.find(f => f.id === id)
  if (!fixture) {
    console.error(`✗ ${id}: not in the jsxFixtures corpus (typo, or not registered in fixtures/index.ts?)`)
    failed = true
    continue
  }
  const filePath = resolveFixturePath(id)
  if (!filePath) {
    console.error(`✗ ${id}: fixture file not found under ${FIXTURE_SUBDIRS.map(s => s || '.').join(', ')}`)
    failed = true
    continue
  }

  const html = await renderHonoComponent({
    source: fixture.source,
    adapter: new HonoAdapter(),
    props: fixture.props,
    components: fixture.components,
  })
  const block = `  expectedHtml: \`${indentHTML(normalizeHTML(html))}\`,`

  const content = readFileSync(filePath, 'utf-8')
  if (!/  expectedHtml: `[^`]*`,/s.test(content)) {
    console.error(
      `✗ ${id}: no inline expectedHtml block in ${filePath} — snapshot-backed fixtures regenerate via scripts/snapshot.ts`,
    )
    failed = true
    continue
  }
  writeFileSync(filePath, content.replace(/  expectedHtml: `[^`]*`,/s, block))
  console.log('✓', id)
}

if (failed) process.exit(1)
