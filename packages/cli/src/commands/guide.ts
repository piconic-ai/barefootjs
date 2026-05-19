// bf guide — show framework documentation (concepts, API, guides).
//
// Two doc roots are searched, in order:
//   1. <ctx.root>/docs/core         — monorepo working copy
//   2. <cli-package-dir>/docs/core  — docs bundled into the published
//                                     CLI (see packages/cli/scripts/build.mjs)
// The fallback lets `bf guide` work in scaffolded apps where the
// monorepo `docs/` tree obviously isn't present.

import path from 'path'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'node:url'
import type { CliContext } from '../context'
import { scanCoreDocs, resolveDoc, parseFrontmatter } from '../lib/docs-loader'

const thisFile = fileURLToPath(import.meta.url)

/**
 * Return the first existing `docs/core` directory in the search order
 * documented at the top of this file. Returns `null` only when both
 * candidates are missing — the caller renders the user-facing error.
 */
function findDocsDir(ctx: CliContext): string | null {
  const monorepoDocs = path.join(ctx.root, 'docs/core')
  if (existsSync(monorepoDocs)) return monorepoDocs

  // In the bundled CLI, `dist/index.js` sits next to `dist/docs/core`.
  // In source mode (running TS directly via `bun packages/cli/src/index.ts`)
  // `import.meta.url` points at `packages/cli/src/commands/guide.ts`,
  // so the same `..` walk lands at `packages/cli/src` and `docs/core`
  // won't be there — that's fine, the monorepo fallback above already
  // handled it.
  const bundledDocs = path.resolve(path.dirname(thisFile), 'docs/core')
  if (existsSync(bundledDocs)) return bundledDocs

  return null
}

function printDocList(docs: ReturnType<typeof scanCoreDocs>, jsonFlag: boolean) {
  if (jsonFlag) {
    console.log(JSON.stringify(docs.map(d => ({
      slug: d.slug,
      title: d.title,
      description: d.description,
      category: d.category,
    })), null, 2))
    return
  }

  if (docs.length === 0) {
    console.log('No documents found.')
    return
  }

  const nameWidth = Math.max(30, ...docs.map(d => d.slug.length + 2))
  const catWidth = 16
  const header = `${'NAME'.padEnd(nameWidth)}${'CATEGORY'.padEnd(catWidth)}DESCRIPTION`
  console.log(header)
  console.log('-'.repeat(header.length))
  for (const d of docs) {
    console.log(`${d.slug.padEnd(nameWidth)}${d.category.padEnd(catWidth)}${d.description.slice(0, 60)}`)
  }
  console.log(`\n${docs.length} document(s) available. Use 'bf guide <name>' to read.`)
}

function printDoc(slug: string, filePath: string, jsonFlag: boolean) {
  const content = readFileSync(filePath, 'utf-8')
  const { title, description, body } = parseFrontmatter(content)

  if (jsonFlag) {
    console.log(JSON.stringify({ slug, title, description, content: body }, null, 2))
    return
  }

  console.log(body)
}

export function run(args: string[], ctx: CliContext): void {
  const docsDir = findDocsDir(ctx)
  if (!docsDir) {
    const monorepoDocs = path.join(ctx.root, 'docs/core')
    const bundledDocs = path.resolve(path.dirname(thisFile), 'docs/core')
    console.error('Error: Core documentation not found.')
    console.error('Looked in:')
    console.error(`  - ${monorepoDocs} (monorepo)`)
    console.error(`  - ${bundledDocs} (bundled CLI)`)
    console.error('Reinstall @barefootjs/cli — the published tarball should include docs.')
    process.exit(1)
  }

  const query = args.join(' ')
  if (!query) {
    // List all available documents
    const docs = scanCoreDocs(docsDir)
    if (docs.length === 0) {
      console.error(`Error: No documents found at ${docsDir}.`)
      process.exit(1)
    }
    printDocList(docs, ctx.jsonFlag)
    return
  }

  const { doc, candidates } = resolveDoc(docsDir, query)

  if (!doc && candidates.length > 0) {
    console.error(`Error: Ambiguous document name "${query}". Did you mean one of:`)
    for (const c of candidates) {
      console.error(`  bf guide ${c.slug}`)
    }
    process.exit(1)
  }

  if (!doc) {
    console.error(`Error: Document "${query}" not found. Run 'bf guide' to list available documents.`)
    process.exit(1)
  }

  printDoc(doc.slug, doc.filePath, ctx.jsonFlag)
}
