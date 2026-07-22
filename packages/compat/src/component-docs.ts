// Human-readable descriptions for the docs Compatibility Matrix page's
// two entity tables — the component matrix ("Matrix") and the
// fixture-corpus render-honesty table ("Render Conformance") — so a
// reader meeting a bare row label like `accordion` or
// `filter-nested-callback-predicate` sees what it actually is instead
// of guessing from the id.
//
// Sources are the artifacts that already own these descriptions:
//   - Components: the committed `ui/registry.json` (the public
//     component catalogue's curated one-liners), falling back to the
//     component's own JSDoc tagline for anything not in the registry
//     (`chart`, `icon`). Each label links to the component source.
//   - Fixtures: the fixture's `description` field (`jsxFixtures`),
//     linked to its source file (`fixtureFileMap`).
//
// Both maps are attached to the lock files at generation time and
// drift-checked in CI (`ci-compat.yml` regenerates and `git diff
// --exit-code`s them), so a renamed component or reworded description
// can't silently rot the page — the next regen picks it up and CI fails
// if it was forgotten.

import { readFileSync } from 'node:fs'
import path from 'path'
import ts from 'typescript'
import { jsxFixtures } from '../../adapter-tests/fixtures'
import type { ComponentDoc, FixtureDoc } from './report'
import { REPO_ROOT, blobUrl, fixtureFileMap } from './repo-links'

const COMPONENTS_DIR = 'ui/components/ui'
const REGISTRY_FILE = 'ui/registry.json'
/** A description longer than this is trimmed at a word boundary with an ellipsis (prose, not code — safe to truncate). */
const DESCRIPTION_MAX_CHARS = 100

interface RegistryItem {
  name: string
  title?: string
  description?: string
}

function titleCase(name: string): string {
  return name
    .split('-')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function trimToBudget(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= DESCRIPTION_MAX_CHARS) return clean
  const cut = clean.slice(0, DESCRIPTION_MAX_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** name → curated registry entry, from the committed public catalogue. */
function loadRegistry(): Map<string, RegistryItem> {
  const raw = JSON.parse(readFileSync(path.join(REPO_ROOT, REGISTRY_FILE), 'utf8')) as { items?: RegistryItem[] }
  return new Map((raw.items ?? []).map(item => [item.name, item]))
}

/**
 * The tagline paragraph of a component's leading JSDoc block: the first
 * non-empty content line after the title line. The block is located via
 * the TS AST (not a regex over source — CLAUDE.md): it's the leading
 * comment of the first real statement, which sits after the
 * `"use client"` directive prologue every component file opens with (so
 * a position-0 comment scan would miss it). Used only for components
 * absent from the registry.
 */
function taglineFromSource(name: string): string | undefined {
  const abs = path.join(REPO_ROOT, COMPONENTS_DIR, name, 'index.tsx')
  let source: string
  try {
    source = readFileSync(abs, 'utf8')
  } catch {
    return undefined
  }
  const sourceFile = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  // Skip the `"use client"` directive prologue (a bare string-literal
  // expression statement); the docstring is the next statement's leading
  // comment.
  const firstReal = sourceFile.statements.find(
    s => !(ts.isExpressionStatement(s) && ts.isStringLiteralLike(s.expression)),
  )
  if (!firstReal) return undefined
  const ranges = ts.getLeadingCommentRanges(source, firstReal.getFullStart()) ?? []
  const block = ranges.find(r => r.kind === ts.SyntaxKind.MultiLineCommentTrivia)
  if (!block) return undefined
  // Strip the `/* … */` fence, then each line's leading ` * ` decoration
  // with plain string ops (no regex), and read the structure the
  // component docstrings follow: [title, '', tagline, …].
  const stripDecoration = (line: string): string => {
    const t = line.trim()
    return (t.startsWith('*') ? t.slice(1) : t).trim()
  }
  const content = source
    .slice(block.pos + 2, block.end - 2)
    .split('\n')
    .map(stripDecoration)
    .filter(l => l.length > 0)
  // content[0] is the title line ("Accordion Components"); the tagline
  // is the next content line.
  return content.length >= 2 ? content[1] : undefined
}

export function computeComponentDocs(names: string[]): Record<string, ComponentDoc> {
  const registry = loadRegistry()
  const docs: Record<string, ComponentDoc> = {}
  for (const name of names) {
    const item = registry.get(name)
    const description = item?.description ?? taglineFromSource(name) ?? ''
    docs[name] = {
      title: item?.title ?? titleCase(name),
      description: trimToBudget(description),
      url: blobUrl(`${COMPONENTS_DIR}/${name}/index.tsx`),
    }
  }
  return docs
}

export function computeFixtureDocs(fixtureIds: string[]): Record<string, FixtureDoc> {
  const descriptions = new Map(jsxFixtures.map(f => [f.id, f.description]))
  const files = fixtureFileMap()
  const docs: Record<string, FixtureDoc> = {}
  for (const id of fixtureIds) {
    const file = files.get(id)
    docs[id] = {
      description: trimToBudget(descriptions.get(id) ?? ''),
      url: file ? blobUrl(file) : blobUrl(''),
    }
  }
  return docs
}
