/**
 * Generate expectedHtml for all fixtures using the Hono adapter as reference.
 *
 * Usage: bun run packages/adapter-tests/scripts/generate-expected-html.ts
 *
 * This compiles each fixture with HonoAdapter, renders to HTML, normalizes it,
 * formats with indentation, and writes the expectedHtml back into the fixture files.
 */

import { HonoAdapter } from '@barefootjs/hono/adapter'
import { conformancePins as honoConformancePins } from '@barefootjs/hono'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import { normalizeHTML } from '../src/jsx-runner'
import { indentHTML } from '../src/indent-html'
import { generateAllSharedComponentSnapshots } from '../src/snapshot-generator'
import { loadAllSharedSpecs } from '../fixtures/_helpers'
import { jsxFixtures } from '../fixtures'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURES_DIR = resolve(import.meta.dir, '../fixtures')

// Sub-directories under `FIXTURES_DIR` that group related fixtures
// (e.g. `methods/` for #1448's JS array/string method catalog). Add
// new groupings here so the auto-update script finds them without
// having to bake the fixture's location into the fixture itself.
const FIXTURE_SUBDIRS = ['', 'methods']

/**
 * Locate a fixture's source file under one of the supported
 * `FIXTURE_SUBDIRS`. Returns null if no candidate exists — the
 * caller treats that as a generator-side bug (fixture imported but
 * file not where we look) rather than silently skipping.
 */
function resolveFixturePath(id: string): string | null {
  for (const sub of FIXTURE_SUBDIRS) {
    const candidate = sub
      ? resolve(FIXTURES_DIR, sub, `${id}.ts`)
      : resolve(FIXTURES_DIR, `${id}.ts`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

// Fixtures whose expectedHtml is hand-curated (typically because the
// reference adapter renders the case incorrectly today, and the
// fixture exists specifically to pin that gap). Auto-update would
// overwrite the intentional value with the bug's output, so we skip
// regeneration here.
const SKIP_AUTO_UPDATE = new Set<string>([])

async function main() {
  let updated = 0
  let failed = 0
  let skipped = 0

  // Shared-component / demo-corpus fixtures keep their expected output in
  // `__snapshots__/<id>.{html,client.js}`, not as an inline `expectedHtml:`
  // string — the regeneration pass at the bottom of this script is their
  // single source of truth. Skip them in the inline loop: re-rendering them
  // here was always a no-op for the .ts file (no inline block to replace),
  // and the loop renders WITHOUT `componentModules`/`componentName`, an
  // inline child path that breaks for demo fixtures whose root and a
  // sibling import the same icon module under different specifiers
  // (`select` / `dropdown-menu`: "CheckIcon has already been declared").
  const snapshotBackedIds = new Set((await loadAllSharedSpecs()).map(s => s.id))

  for (const fixture of jsxFixtures) {
    if (snapshotBackedIds.has(fixture.id)) {
      skipped++
      continue
    }
    if (SKIP_AUTO_UPDATE.has(fixture.id)) {
      console.log(`⚠ Skipped (hand-curated): ${fixture.id}`)
      skipped++
      continue
    }
    // A fixture the REFERENCE adapter refuses at compile time has no
    // renderable HTML to generate — its contract is the diagnostic,
    // asserted by the conformance runner's expectedDiagnostics path.
    if (honoConformancePins[fixture.id]?.length) {
      console.log(`⚠ Skipped (diagnostics-pinned on the reference adapter): ${fixture.id}`)
      skipped++
      continue
    }
    try {
      const adapter = new HonoAdapter()
      const html = await renderHonoComponent({
        source: fixture.source,
        adapter,
        props: fixture.props,
        components: fixture.components,
      })

      const normalizedHtml = normalizeHTML(html)
      const indentedHtml = indentHTML(normalizedHtml)
      const expectedHtmlBlock = `  expectedHtml: \`${indentedHtml}\`,`

      // Read the fixture file and update it. `resolveFixturePath`
      // walks the known fixture sub-directories so groupings like
      // `methods/` work without per-fixture path metadata.
      const filePath = resolveFixturePath(fixture.id)
      if (!filePath) {
        throw new Error(
          `cannot locate fixture file for id="${fixture.id}" under any of: ${FIXTURE_SUBDIRS.map(s => s || '.').join(', ')}`,
        )
      }
      let content = readFileSync(filePath, 'utf-8')

      if (content.includes('expectedHtml:')) {
        // Replace existing expectedHtml (single-line or multi-line)
        content = content.replace(
          /  expectedHtml: `[^`]*`,/s,
          expectedHtmlBlock,
        )
      } else {
        // Insert expectedHtml before the closing `})`
        content = content.replace(
          /\}\)\s*$/,
          `${expectedHtmlBlock}\n})\n`,
        )
      }

      writeFileSync(filePath, content)
      console.log(`✓ ${fixture.id}`)
      updated++
    } catch (err) {
      console.error(`✗ ${fixture.id}: ${(err as Error).message}`)
      failed++
    }
  }

  console.log(`\nDone: ${updated} updated, ${failed} failed, ${skipped} skipped`)

  // Shared-component fixtures (fixture-hydrate corpus) write their
  // expectedHtml + expectedClientJs to `fixtures/__snapshots__/<id>.{html,client.js}`
  // instead of inline strings in the .ts file. Regenerate them here so a single
  // auto-update run keeps both fixture flavours in sync — same trigger, same
  // commit, no separate workflow.
  console.log('\nRegenerating shared-component snapshots…')
  try {
    await generateAllSharedComponentSnapshots()
  } catch (err) {
    console.error(`✗ shared-component snapshots: ${(err as Error).message}`)
    failed++
  }

  if (failed > 0) process.exit(1)
}

main()
