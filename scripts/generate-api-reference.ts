#!/usr/bin/env bun
//
// Generate docs/core/advanced/api-reference.md — the per-API stability
// reference the README's stability table links to — from the JSDoc on the
// public exports themselves:
//
//   @since <version>      the first release that shipped the API
//   @stability beta|alpha the surface tier (see README.md's stability table)
//   @example              a short, copyable usage snippet (fenced)
//   @internal             exported for the compiler/runtime's own use; not
//                         listed, but accepted so the completeness check
//                         below can tell "deliberately internal" apart
//                         from "forgot to tag"
//
// Every export of every SURFACE below must carry `@stability` + `@since` or
// `@internal`, plus a description sentence, and on a `detail` surface every
// BETA function / const / class must also carry `@example` — so neither a new
// export nor a new beta promotion can land without a stability decision, a
// sentence saying what it is, and a usage snippet.
// Types and interfaces are exempt from `@example`: their shape is the doc,
// and the interfaces named in a surface's `expand` get a per-field table.
//
// Resolution is a TypeScript Program over the entry files (never a regex
// over source text — CLAUDE.md): re-exports are followed through the
// checker to the declaring symbol, and the tags are read off the JSDoc
// block that carries them.
//
// Two rendering modes:
//
//   detail: true   an index table linking into one `###` section per API,
//                  each with a meta line, its summary, its option table
//                  (for an `expand`ed interface) and its example. `###` is
//                  what the docs site puts in a page's table of contents,
//                  so every such API is linkable and navigable.
//   detail: false  one compact table per entry — for the repetitive,
//                  uniformly-alpha surfaces where a section each would be
//                  noise.
//
// Heading anchors come from `site/core/lib/heading-slug.ts` — the same
// module the docs site's own renderer stamps ids with, imported rather than
// restated so the two cannot drift — and a collision between two headings
// fails the run, so the index links and the README's section links cannot
// silently rot.
//
// Two things a JSDoc comment cannot hold literally, both escaped with a
// zero-width space (U+200B) that this script strips on the way out, so the
// published snippet is the real, copyable syntax: the `*/` that would close
// the comment, and a space-preceded `@` that TypeScript's JSDoc scanner
// would read as the start of a new tag (which silently truncates the
// example there). Both appear in the `@client` directive's own example.
//
// Usage: bun run scripts/generate-api-reference.ts [--check]
//
//   (no flags)  Rewrite docs/core/advanced/api-reference.md in place.
//   --check     Exit 1 if regenerating would change the file (or a surface
//               has an untagged export), without writing — used by
//               .github/workflows/update-api-reference.yml.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import ts from 'typescript'
// The docs site's own heading-`id` rule, imported rather than restated so a
// link this file emits resolves to the heading the site actually renders.
import { headingSlug } from '../site/core/lib/heading-slug.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUTPUT = 'docs/core/advanced/api-reference.md'

type Stability = 'beta' | 'alpha'

interface Entry {
  /** Entry file, relative to the repo root. Every export of it is a row. */
  file: string
  /** Import specifier. A group heading on a compact surface; part of the
   *  meta line on a `detail` surface. */
  label?: string
  /** Restrict the entry to these export names. */
  only?: string[]
}

interface Surface {
  /** Heading; its slug is the anchor the README links to. */
  title: string
  /** Prose rendered under the heading. */
  intro: string
  entries: Entry[]
  /** Render one `###` section per API instead of a compact table. */
  detail?: boolean
  /** Exported interfaces whose property members get a per-field table. */
  expand?: string[]
  /** Heading text for an export whose identifier is not what an author
   *  writes (the directives, whose value is the syntax). */
  headings?: Record<string, string>
  /** Compact layout: one table per entry (default), or one table for the
   *  whole surface with the entry's import specifier as a column — for a
   *  surface where every entry contributes a single API. */
  compact?: 'per-entry' | 'one-table'
}

const SURFACES: Surface[] = [
  {
    title: 'Runtime',
    intro:
      'Everything `@barefootjs/client` exports — the reactive primitives, context, props helpers, ' +
      'portals and the compiler built-ins (**beta**), plus the dev-only profiler hooks (**alpha**).',
    entries: [{ file: 'packages/client/src/index.ts', label: '@barefootjs/client' }],
    detail: true,
    expand: ['AsyncProps', 'RegionProps', 'PortalOptions'],
  },
  {
    title: 'Directives',
    intro:
      'The two source-level directives the compiler recognizes. They are syntax, not imports; the ' +
      'spellings are defined once in `packages/jsx/src/directives.ts`.',
    entries: [{ file: 'packages/jsx/src/directives.ts' }],
    detail: true,
    headings: {
      USE_CLIENT_DIRECTIVE: '`"use client"`',
      CLIENT_EXPRESSION_DIRECTIVE: '`@client` expression directive',
    },
  },
  {
    title: 'Vite plugin',
    intro:
      'Everything `@barefootjs/vite` exports. `barefoot()` and its option types are **beta**; the ' +
      'helpers re-exported for adapter builders are **alpha**. See [Vite Plugin](./vite-plugin.md) ' +
      'for the build and dev output, the on-disk layout and the dev-server markers.',
    entries: [{ file: 'packages/vite/src/index.ts', label: '@barefootjs/vite' }],
    detail: true,
    expand: ['BarefootViteOptions', 'ComponentDirEntry', 'AfterEmitContext'],
  },
  {
    title: 'Adapter builders',
    intro:
      "Each adapter's `/vite` subpath: a `barefoot()` that constructs the adapter and composes the " +
      'core plugin, plus its options. All **alpha** — the shape is uniform across the nine, so they ' +
      'are listed rather than written out. See [Vite Plugin → Adapter builders](./vite-plugin.md#adapter-builders).',
    entries: [
      { file: 'packages/adapter-hono/src/vite.ts', label: '@barefootjs/hono/vite' },
      { file: 'packages/adapter-go-template/src/vite.ts', label: '@barefootjs/go-template/vite' },
      { file: 'packages/adapter-mojolicious/src/vite.ts', label: '@barefootjs/mojolicious/vite' },
      { file: 'packages/adapter-xslate/src/vite.ts', label: '@barefootjs/xslate/vite' },
      { file: 'packages/adapter-erb/src/vite.ts', label: '@barefootjs/erb/vite' },
      { file: 'packages/adapter-jinja/src/vite.ts', label: '@barefootjs/jinja/vite' },
      { file: 'packages/adapter-twig/src/vite.ts', label: '@barefootjs/twig/vite' },
      { file: 'packages/adapter-blade/src/vite.ts', label: '@barefootjs/blade/vite' },
      { file: 'packages/adapter-rust/src/vite.ts', label: '@barefootjs/rust/vite' },
    ],
    expand: [
      'HonoViteOptions', 'GoTemplateViteOptions', 'MojoliciousViteOptions', 'XslateViteOptions',
      'ErbViteOptions', 'JinjaViteOptions', 'TwigViteOptions', 'BladeViteOptions', 'RustViteOptions',
    ],
  },
  {
    title: 'Adapters',
    intro:
      'The adapter classes, one per backend. Pass an instance as `barefoot()`\'s `adapter` option, or ' +
      'use the matching builder above. All **alpha**, as is everything else the adapter packages and ' +
      '`@barefootjs/jsx` export (not itemized here) and the language-side runtimes they ship with.',
    entries: [
      { file: 'packages/adapter-hono/src/adapter/hono-adapter.ts', label: '@barefootjs/hono', only: ['HonoAdapter'] },
      { file: 'packages/adapter-go-template/src/adapter/go-template-adapter.ts', label: '@barefootjs/go-template', only: ['GoTemplateAdapter'] },
      { file: 'packages/adapter-mojolicious/src/adapter/mojo-adapter.ts', label: '@barefootjs/mojolicious', only: ['MojoAdapter'] },
      { file: 'packages/adapter-xslate/src/adapter/xslate-adapter.ts', label: '@barefootjs/xslate', only: ['XslateAdapter'] },
      { file: 'packages/adapter-erb/src/adapter/erb-adapter.ts', label: '@barefootjs/erb', only: ['ErbAdapter'] },
      { file: 'packages/adapter-jinja/src/adapter/jinja-adapter.ts', label: '@barefootjs/jinja', only: ['JinjaAdapter'] },
      { file: 'packages/adapter-twig/src/adapter/twig-adapter.ts', label: '@barefootjs/twig', only: ['TwigAdapter'] },
      { file: 'packages/adapter-blade/src/adapter/blade-adapter.ts', label: '@barefootjs/blade', only: ['BladeAdapter'] },
      { file: 'packages/adapter-rust/src/adapter/minijinja-adapter.ts', label: '@barefootjs/rust', only: ['MinijinjaAdapter'] },
      { file: 'packages/client/src/csr-adapter.ts', label: '@barefootjs/client/csr-adapter', only: ['CSRAdapter'] },
    ],
    compact: 'one-table',
  },
]

// ---------------------------------------------------------------------------

/** A field of an `expand`ed interface. */
interface Field {
  name: string
  since: string
  stability: Stability
  summary: string
}

interface Api {
  /** Exported identifier. */
  name: string
  /** Heading / table text, e.g. `` `createSignal()` ``. */
  display: string
  kind: string
  since: string
  stability: Stability
  /** First sentence, for the index table. */
  summary: string
  /** First paragraph, for the section body. */
  description: string
  example?: string
  fields: Field[]
  label?: string
}

interface Tags {
  since?: string
  stability?: string
  example?: string
  internal: boolean
}

const SUMMARY_MAX = 160

/** Drop the JSDoc-only zero-width escape so a published snippet is copyable. */
function unescapeDoc(text: string): string {
  return text.replace(/​/g, '')
}

/** First sentence of `text`, cut outside backticks and not at an `e.g.`, capped. */
function firstSentence(text: string): string {
  const oneLine = text.trim().replace(/\s*\n\s*/g, ' ')
  let inCode = false
  let out = oneLine
  for (let i = 0; i < oneLine.length; i++) {
    const ch = oneLine[i]
    if (ch === '`') inCode = !inCode
    else if (!inCode && (ch === '.' || ch === '!' || ch === '?') && (i + 1 === oneLine.length || oneLine[i + 1] === ' ')) {
      if (/\b(e\.g|i\.e|cf|vs|etc)$/.test(oneLine.slice(0, i))) continue
      out = oneLine.slice(0, i + 1)
      break
    }
  }
  return out.length > SUMMARY_MAX ? `${out.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : out
}

/** First paragraph of `text`, newlines collapsed. */
function firstParagraph(text: string): string {
  const para = text.trim().split(/\n\s*\n/)[0] ?? ''
  return para.replace(/\s*\n\s*/g, ' ').trim()
}

function readTags(doc: ts.JSDoc): Tags {
  const out: Tags = { internal: false }
  for (const tag of doc.tags ?? []) {
    const text = (ts.getTextOfJSDocComment(tag.comment) ?? '').trim()
    if (tag.tagName.text === 'since') out.since = text
    else if (tag.tagName.text === 'stability') out.stability = text
    else if (tag.tagName.text === 'example') out.example = text
    else if (tag.tagName.text === 'internal') out.internal = true
  }
  return out
}

/**
 * The JSDoc block carrying the stability tags for `decl`, plus its comment
 * text. A declaration can have several leading blocks (a file header
 * directly above the first export, say), and only the tagged one is this
 * API's documentation.
 */
function taggedDoc(decl: ts.Node): { tags: Tags; text: string } {
  for (const doc of ts.getJSDocCommentsAndTags(decl).filter(ts.isJSDoc)) {
    const tags = readTags(doc)
    if (tags.since || tags.stability || tags.internal) {
      return { tags, text: ts.getTextOfJSDocComment(doc.comment) ?? '' }
    }
  }
  return { tags: { internal: false }, text: '' }
}

function kindOf(decl: ts.Declaration): string {
  if (ts.isFunctionDeclaration(decl)) return 'function'
  if (ts.isClassDeclaration(decl)) return 'class'
  if (ts.isInterfaceDeclaration(decl)) return 'interface'
  if (ts.isTypeAliasDeclaration(decl)) return 'type'
  if (ts.isVariableDeclaration(decl)) return 'const'
  return ts.SyntaxKind[decl.kind]
}

/** `` `createSignal()` `` for a function, `` `Signal` `` otherwise. */
function displayFor(name: string, kind: string, surface: Surface): string {
  const override = surface.headings?.[name]
  if (override) return override
  return kind === 'function' ? `\`${name}()\`` : `\`${name}\``
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|')
}

function createProgram(files: string[]): ts.Program {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    strict: false,
    jsx: ts.JsxEmit.Preserve,
    baseUrl: ROOT,
    // Resolve workspace packages to source, never to a built `dist/`: the
    // tags live in the `.ts` sources and a stale build must not be able to
    // hide a missing one.
    paths: {
      '@barefootjs/client/reactive': ['packages/client/src/reactive.ts'],
      '@barefootjs/client/csr-adapter': ['packages/client/src/csr-adapter.ts'],
      '@barefootjs/client/runtime': ['packages/client/src/runtime/index.ts'],
      '@barefootjs/client': ['packages/client/src/index.ts'],
      '@barefootjs/shared': ['packages/shared/src/index.ts'],
      '@barefootjs/streaming': ['packages/streaming/src/index.ts'],
      '@barefootjs/jsx': ['packages/jsx/src/index.ts'],
      '@barefootjs/vite': ['packages/vite/src/index.ts'],
    },
  }
  return ts.createProgram(files.map(f => join(ROOT, f)), options)
}

interface Problem {
  file: string
  name: string
  reason: string
}

/** Kinds whose contract is a call, so an example is worth requiring. */
const EXAMPLE_REQUIRED_KINDS = new Set(['function', 'const', 'class'])

function collectFields(
  decl: ts.InterfaceDeclaration,
  inherited: { since: string; stability: Stability },
  declFile: string,
  apiName: string,
  problems: Problem[],
): Field[] {
  const fields: Field[] = []
  for (const member of decl.members) {
    if (!ts.isPropertySignature(member) || !member.name) continue
    const name = member.name.getText()
    const { tags, text } = taggedDoc(member)
    if (tags.internal) continue
    const stability = (tags.stability ?? inherited.stability) as Stability
    if (stability !== 'beta' && stability !== 'alpha') {
      problems.push({ file: declFile, name: `${apiName}.${name}`, reason: `invalid @stability ${JSON.stringify(stability)}` })
      continue
    }
    // An untagged field's doc comment is its only block, so read it directly.
    const docs = ts.getJSDocCommentsAndTags(member).filter(ts.isJSDoc)
    const body = text || (ts.getTextOfJSDocComment(docs[docs.length - 1]?.comment) ?? '')
    fields.push({ name, since: tags.since ?? inherited.since, stability, summary: firstSentence(body) })
  }
  return fields
}

function collectSurface(program: ts.Program, surface: Surface, problems: Problem[]): Api[] {
  const checker = program.getTypeChecker()
  const apis: Api[] = []

  for (const entry of surface.entries) {
    const sf = program.getSourceFile(join(ROOT, entry.file))
    if (!sf) throw new Error(`${entry.file}: not in program`)
    const moduleSymbol = checker.getSymbolAtLocation(sf)
    if (!moduleSymbol) throw new Error(`${entry.file}: no module symbol`)

    const exports = checker.getExportsOfModule(moduleSymbol)
      .filter(s => s.name !== 'default')
      .sort((a, b) => a.name.localeCompare(b.name))

    for (const exp of exports) {
      if (entry.only && !entry.only.includes(exp.name)) continue
      const target = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp
      const decl = target.valueDeclaration ?? target.declarations?.[0]
      if (!decl) {
        problems.push({ file: entry.file, name: exp.name, reason: 'no declaration' })
        continue
      }
      const declFile = relative(ROOT, decl.getSourceFile().fileName)
      const { tags, text } = taggedDoc(decl)
      if (tags.internal) continue
      if (tags.stability !== 'beta' && tags.stability !== 'alpha') {
        problems.push({ file: declFile, name: exp.name, reason: `missing or invalid @stability (got ${JSON.stringify(tags.stability ?? null)}; expected beta|alpha, or @internal)` })
        continue
      }
      if (!tags.since || !/^\d+\.\d+\.\d+$/.test(tags.since)) {
        problems.push({ file: declFile, name: exp.name, reason: `missing or invalid @since (got ${JSON.stringify(tags.since ?? null)})` })
        continue
      }
      const kind = kindOf(decl)
      if (surface.detail && tags.stability === 'beta' && EXAMPLE_REQUIRED_KINDS.has(kind) && !tags.example) {
        problems.push({ file: declFile, name: exp.name, reason: `beta ${kind} on a detail surface needs an @example` })
        continue
      }
      // A tags-only block renders as a nameless row / an empty section, which
      // is worse than no entry at all — the reader cannot tell the API apart
      // from its neighbours.
      const description = firstParagraph(text)
      if (!description) {
        problems.push({ file: declFile, name: exp.name, reason: 'the tagged JSDoc block has no description sentence' })
        continue
      }

      apis.push({
        name: exp.name,
        display: displayFor(exp.name, kind, surface),
        kind,
        since: tags.since,
        stability: tags.stability,
        summary: firstSentence(text),
        description,
        example: tags.example,
        fields: surface.expand?.includes(exp.name) && ts.isInterfaceDeclaration(decl)
          ? collectFields(decl, { since: tags.since, stability: tags.stability }, declFile, exp.name, problems)
          : [],
        label: entry.label,
      })
    }
  }
  return apis
}

// ---------------------------------------------------------------------------

function status(stability: Stability): string {
  return stability === 'beta' ? '**Beta**' : 'Alpha'
}

/** The `@example` text as a fenced block; already-fenced text passes through. */
function renderExample(example: string): string[] {
  const text = unescapeDoc(example).trim()
  if (text.startsWith('```')) return [text]
  return ['```tsx', text, '```']
}

function renderIndex(apis: Api[]): string[] {
  const out = ['| API | Kind | Since | Status |', '|---|---|---|---|']
  for (const api of apis) {
    const anchor = `#${headingSlug(api.display)}`
    out.push(`| [${escapeCell(api.display)}](${anchor}) | ${api.kind} | ${api.since} | ${status(api.stability)} |`)
  }
  return out
}

function renderDetailSections(apis: Api[]): string[] {
  const out: string[] = []
  for (const api of apis) {
    out.push('', `### ${api.display}`, '')
    const meta = [`\`${api.kind}\``, `${status(api.stability)} since ${api.since}`]
    if (api.label) meta.push(`\`${api.label}\``)
    out.push(meta.join(' · '), '')
    if (api.description) out.push(unescapeDoc(api.description), '')
    if (api.fields.length > 0) {
      out.push('| Field | Since | Status | Description |', '|---|---|---|---|')
      for (const f of api.fields) {
        out.push(`| \`${escapeCell(f.name)}\` | ${f.since} | ${status(f.stability)} | ${escapeCell(unescapeDoc(f.summary))} |`)
      }
      out.push('')
    }
    if (api.example) out.push(...renderExample(api.example), '')
  }
  return out
}

function renderOneTable(apis: Api[]): string[] {
  const out = ['| Package | API | Kind | Since | Status |', '|---|---|---|---|---|']
  for (const api of apis) {
    out.push(`| \`${escapeCell(api.label ?? '')}\` | ${escapeCell(api.display)} | ${api.kind} | ${api.since} | ${status(api.stability)} |`)
  }
  return [...out, '']
}

function renderCompact(apis: Api[]): string[] {
  const out: string[] = []
  const byLabel = new Map<string | undefined, Api[]>()
  for (const api of apis) {
    const list = byLabel.get(api.label) ?? []
    list.push(api)
    byLabel.set(api.label, list)
  }
  for (const [label, group] of byLabel) {
    if (label) out.push('', `**\`${label}\`**`, '')
    out.push('| API | Kind | Since | Status | Summary |', '|---|---|---|---|---|')
    for (const api of group) {
      out.push(`| ${escapeCell(api.display)} | ${api.kind} | ${api.since} | ${status(api.stability)} | ${escapeCell(unescapeDoc(api.summary))} |`)
      for (const f of api.fields) {
        out.push(`| \`${escapeCell(api.name)}.${escapeCell(f.name)}\` | option | ${f.since} | ${status(f.stability)} | ${escapeCell(unescapeDoc(f.summary))} |`)
      }
    }
    out.push('')
  }
  return out
}

/**
 * Files that link INTO this reference at an anchor. Their links are checked
 * against the headings actually emitted, so renaming an API cannot leave the
 * README pointing at a heading that no longer exists.
 */
const INBOUND_LINK_SOURCES = ['README.md', 'docs/core/advanced/vite-plugin.md']

function checkInboundLinks(slugs: Set<string>, problems: Problem[]): void {
  const target = OUTPUT.replace(/^docs\/core\//, '')
  for (const source of INBOUND_LINK_SOURCES) {
    let text: string
    try { text = readFileSync(join(ROOT, source), 'utf8') } catch { continue }
    // Any markdown link whose path ends in this page's filename, with a fragment.
    for (const m of text.matchAll(/\]\(([^)\s]*api-reference\.md)#([^)\s]+)\)/g)) {
      const anchor = m[2]!
      if (!slugs.has(anchor)) {
        problems.push({ file: source, name: `link to ${m[1]}#${anchor}`, reason: `no heading in ${target} has the anchor "#${anchor}"` })
      }
    }
  }
}

function render(program: ts.Program, problems: Problem[]): { markdown: string; slugs: Set<string> } {
  const out: string[] = [
    '---',
    'title: API Reference',
    'description: Every public API with the release it first shipped in, its stability tier and a usage example — generated from the JSDoc on the exports themselves.',
    '---',
    '',
    '# API Reference',
    '',
    '<!-- AUTO-GENERATED by scripts/generate-api-reference.ts from the `@since` / `@stability` / `@example` JSDoc tags on each export — do not edit by hand. Run `bun run scripts/generate-api-reference.ts` to regenerate. -->',
    '',
    "Every public API, the release it first shipped in, its stability tier and a short example. The tiers are the ones the README's stability table defines: on a **beta** surface a breaking change ships in a minor release with a migration note in the changelog; an **alpha** surface may change without notice, so pin exact versions if you depend on it. Pre-1.0, a minor release is the breaking-change slot for both.",
    '',
    'Everything here comes from `@since` / `@stability` / `@example` JSDoc tags on the exports, so the code is the source of truth: a new export cannot ship without a stability decision, and a new beta function cannot ship without an example.',
    '',
  ]

  const slugs = new Map<string, string>()
  const claim = (text: string, what: string): void => {
    const slug = headingSlug(text)
    const prior = slugs.get(slug)
    if (prior) problems.push({ file: OUTPUT, name: what, reason: `heading anchor "#${slug}" collides with ${prior}` })
    else slugs.set(slug, what)
  }

  for (const surface of SURFACES) {
    claim(surface.title, `section "${surface.title}"`)
    out.push(`## ${surface.title}`, '', surface.intro, '')
    const apis = collectSurface(program, surface, problems)
    if (surface.detail) {
      for (const api of apis) claim(api.display, `${surface.title} → ${api.name}`)
      out.push(...renderIndex(apis))
      out.push(...renderDetailSections(apis))
    } else if (surface.compact === 'one-table') {
      out.push(...renderOneTable(apis))
    } else {
      out.push(...renderCompact(apis))
    }
  }
  return {
    markdown: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`,
    slugs: new Set(slugs.keys()),
  }
}

function main(): void {
  const checkOnly = process.argv.includes('--check')
  const files = SURFACES.flatMap(s => s.entries.map(e => e.file))
  const program = createProgram(files)
  const problems: Problem[] = []
  const { markdown: generated, slugs } = render(program, problems)
  checkInboundLinks(slugs, problems)

  if (problems.length > 0) {
    console.error('api-reference: every export of a documented surface needs `@since` + `@stability beta|alpha` (or `@internal`), and a beta function/const/class on a detail surface needs `@example`:')
    for (const p of problems) console.error(`  ${p.file}: ${p.name} — ${p.reason}`)
    process.exit(1)
  }

  const outPath = join(ROOT, OUTPUT)
  let current: string | null = null
  try { current = readFileSync(outPath, 'utf8') } catch { current = null }

  if (current === generated) {
    console.log(`${OUTPUT}: up to date`)
    return
  }
  if (checkOnly) {
    console.error(`${OUTPUT}: out of date — run \`bun run scripts/generate-api-reference.ts\` and commit the result`)
    process.exit(1)
  }
  writeFileSync(outPath, generated)
  console.log(`${OUTPUT}: regenerated`)
}

main()
