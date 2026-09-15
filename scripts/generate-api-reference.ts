#!/usr/bin/env bun
//
// Generate docs/core/advanced/api-reference.md — the per-API stability
// reference the README's stability table links to — from the JSDoc tags
// on the public exports themselves:
//
//   @since <version>      the first release that shipped the API
//   @stability beta|alpha the surface tier (see README.md's stability table)
//   @internal             exported for the compiler/runtime's own use; not
//                         listed, but accepted so the completeness check
//                         below can tell "deliberately internal" apart
//                         from "forgot to tag"
//
// Every export of every SURFACE below must carry `@stability` + `@since`
// or `@internal`; anything else fails the run, so a new export cannot land
// without a stability decision. Members of the interfaces listed in a
// surface's `expand` are rendered as their own rows and inherit the
// interface's tags unless they carry their own.
//
// Resolution is a TypeScript Program over the entry files (never a regex
// over source text — CLAUDE.md): re-exports are followed through the
// checker to the declaring symbol, and the tags come from
// `Symbol.getJsDocTags()`.
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

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUTPUT = 'docs/core/advanced/api-reference.md'

type Stability = 'beta' | 'alpha'

interface Surface {
  /** Anchor + heading. */
  id: string
  title: string
  /** One-paragraph description rendered under the heading. */
  intro: string
  /** Entry files, relative to the repo root. Every export of each is a row. */
  entries: { file: string; label?: string; only?: string[] }[]
  /** Exported interfaces whose property members get their own rows. */
  expand?: string[]
  /** Render a `const` string literal's value (e.g. `"use client"`) as the
   * API name instead of the identifier. */
  displayLiteral?: boolean
}

const SURFACES: Surface[] = [
  {
    id: 'runtime',
    title: 'Runtime',
    intro:
      'Everything `@barefootjs/client` exports. The reactive primitives, context, props helpers, ' +
      'portals, and the compiler built-ins are **beta**; the profiler hooks are **alpha**.',
    entries: [{ file: 'packages/client/src/index.ts' }],
  },
  {
    id: 'directives',
    title: 'Directives',
    intro:
      'The two source-level directives the compiler recognizes, defined once in ' +
      '`packages/jsx/src/directives.ts`.',
    entries: [{ file: 'packages/jsx/src/directives.ts' }],
    displayLiteral: true,
  },
  {
    id: 'vite-plugin',
    title: 'Vite plugin',
    intro:
      'Everything `@barefootjs/vite` exports. `barefoot()` and its option types are **beta**; the ' +
      'helpers re-exported for adapter builders are **alpha**. See [Vite Plugin](./vite-plugin.md).',
    entries: [{ file: 'packages/vite/src/index.ts' }],
    expand: ['BarefootViteOptions', 'ComponentDirEntry', 'AfterEmitContext'],
  },
  {
    id: 'adapter-builders',
    title: 'Adapter builders',
    intro:
      "Each adapter's `/vite` subpath: a `barefoot()` that constructs the adapter and composes the " +
      'core plugin, plus its options. All **alpha**.',
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
    id: 'adapters',
    title: 'Adapters',
    intro:
      'The adapter classes, one per backend. All **alpha**, as is everything else the adapter ' +
      'packages and `@barefootjs/jsx` export (not itemized here) and the language-side runtimes ' +
      'they ship with.',
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
  },
]

// ---------------------------------------------------------------------------

interface Row {
  name: string
  kind: string
  since: string
  stability: Stability
  summary: string
}

interface Tags {
  since?: string
  stability?: string
  internal: boolean
}

function readTags(tags: readonly ts.JSDocTagInfo[]): Tags {
  const out: Tags = { internal: false }
  for (const t of tags) {
    const text = (t.text ?? []).map(p => p.text).join('').trim()
    if (t.name === 'since') out.since = text
    else if (t.name === 'stability') out.stability = text
    else if (t.name === 'internal') out.internal = true
  }
  return out
}

const SUMMARY_MAX = 180

/** First sentence of the first paragraph of a doc comment, cut outside
 * backticks and not at an `e.g.` / `i.e.` / `cf.`, capped at `SUMMARY_MAX`. */
function firstSentence(text: string): string {
  const para = text.trim().split(/\n\s*\n/)[0] ?? ''
  const oneLine = para.replace(/\s*\n\s*/g, ' ')
  let inCode = false
  let out = oneLine
  for (let i = 0; i < oneLine.length; i++) {
    const ch = oneLine[i]
    if (ch === '`') inCode = !inCode
    else if (!inCode && (ch === '.' || ch === '!' || ch === '?') && (i + 1 === oneLine.length || oneLine[i + 1] === ' ')) {
      const before = oneLine.slice(0, i)
      if (/\b(e\.g|i\.e|cf|vs|etc)$/.test(before)) continue
      out = oneLine.slice(0, i + 1)
      break
    }
  }
  return out.length > SUMMARY_MAX ? `${out.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : out
}

/**
 * The JSDoc block that carries the stability tags for `decl`, and its
 * comment text. A declaration can have several leading `/**` blocks (a
 * file header directly above the first export, say) and TypeScript's
 * `getDocumentationComment` concatenates them all; the summary should come
 * from the block the tags live in.
 */
function taggedDoc(decl: ts.Node): { tags: Tags; summary: string } {
  const docs = ts.getJSDocCommentsAndTags(decl).filter(ts.isJSDoc)
  for (const doc of docs) {
    const tagInfos: ts.JSDocTagInfo[] = (doc.tags ?? []).map(t => ({
      name: t.tagName.text,
      text: [{ kind: 'text', text: ts.getTextOfJSDocComment(t.comment) ?? '' }],
    }))
    const tags = readTags(tagInfos)
    if (tags.since || tags.stability || tags.internal) {
      return { tags, summary: firstSentence(ts.getTextOfJSDocComment(doc.comment) ?? '') }
    }
  }
  return { tags: { internal: false }, summary: '' }
}

function kindOf(decl: ts.Declaration): string {
  if (ts.isFunctionDeclaration(decl)) return 'function'
  if (ts.isClassDeclaration(decl)) return 'class'
  if (ts.isInterfaceDeclaration(decl)) return 'interface'
  if (ts.isTypeAliasDeclaration(decl)) return 'type'
  if (ts.isVariableDeclaration(decl)) return 'const'
  if (ts.isPropertySignature(decl)) return 'option'
  return ts.SyntaxKind[decl.kind]
}

function literalName(decl: ts.Declaration): string | undefined {
  if (ts.isVariableDeclaration(decl) && decl.initializer && ts.isStringLiteral(decl.initializer)) {
    const v = decl.initializer.text
    return v.startsWith('@') ? `/* ${v} */` : `"${v}"`
  }
  return undefined
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
    // tags live in the `.ts` sources and a stale build must not be able
    // to hide a missing one.
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

function collectSurface(program: ts.Program, surface: Surface, problems: Problem[]): { label?: string; rows: Row[] }[] {
  const checker = program.getTypeChecker()
  const groups: { label?: string; rows: Row[] }[] = []

  for (const entry of surface.entries) {
    const sf = program.getSourceFile(join(ROOT, entry.file))
    if (!sf) throw new Error(`${entry.file}: not in program`)
    const moduleSymbol = checker.getSymbolAtLocation(sf)
    if (!moduleSymbol) throw new Error(`${entry.file}: no module symbol`)

    const rows: Row[] = []
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
      const { tags, summary } = taggedDoc(decl)
      if (tags.internal) continue
      if (tags.stability !== 'beta' && tags.stability !== 'alpha') {
        problems.push({ file: declFile, name: exp.name, reason: `missing or invalid @stability (got ${JSON.stringify(tags.stability ?? null)}; expected beta|alpha, or @internal)` })
        continue
      }
      if (!tags.since || !/^\d+\.\d+\.\d+$/.test(tags.since)) {
        problems.push({ file: declFile, name: exp.name, reason: `missing or invalid @since (got ${JSON.stringify(tags.since ?? null)})` })
        continue
      }
      const display = (surface.displayLiteral && literalName(decl)) || exp.name
      rows.push({
        name: display,
        kind: kindOf(decl),
        since: tags.since,
        stability: tags.stability,
        summary,
      })

      if (surface.expand?.includes(exp.name) && ts.isInterfaceDeclaration(decl)) {
        for (const member of decl.members) {
          if (!ts.isPropertySignature(member) || !member.name) continue
          const memberName = member.name.getText()
          const memberDoc = taggedDoc(member)
          const memberTags = memberDoc.tags
          if (memberTags.internal) continue
          const memberDocs = ts.getJSDocCommentsAndTags(member).filter(ts.isJSDoc)
          const memberSummary = memberDoc.summary || firstSentence(ts.getTextOfJSDocComment(memberDocs[memberDocs.length - 1]?.comment) ?? '')
          const stability = (memberTags.stability ?? tags.stability) as Stability
          if (stability !== 'beta' && stability !== 'alpha') {
            problems.push({ file: declFile, name: `${exp.name}.${memberName}`, reason: `invalid @stability ${JSON.stringify(stability)}` })
            continue
          }
          rows.push({
            name: `${exp.name}.${memberName}`,
            kind: 'option',
            since: memberTags.since ?? tags.since,
            stability,
            summary: memberSummary,
          })
        }
      }
    }
    groups.push({ label: entry.label, rows })
  }
  return groups
}

function renderTable(rows: Row[]): string {
  const lines = ['| API | Kind | Since | Status | Summary |', '|---|---|---|---|---|']
  for (const r of rows) {
    const status = r.stability === 'beta' ? '**Beta**' : 'Alpha'
    lines.push(`| \`${escapeCell(r.name)}\` | ${r.kind} | ${r.since} | ${status} | ${escapeCell(r.summary)} |`)
  }
  return lines.join('\n')
}

function render(program: ts.Program, problems: Problem[]): string {
  const out: string[] = []
  out.push('---')
  out.push('title: API Reference')
  out.push('description: Every public API with the release it first shipped in and its stability tier — beta or alpha — generated from the JSDoc tags on the exports themselves.')
  out.push('---')
  out.push('')
  out.push('# API Reference')
  out.push('')
  out.push('<!-- AUTO-GENERATED by scripts/generate-api-reference.ts from the `@since` / `@stability` JSDoc tags on each export — do not edit by hand. Run `bun run scripts/generate-api-reference.ts` to regenerate. -->')
  out.push('')
  out.push('Every public API, the release it first shipped in, and its stability tier. The tiers are the ones the README\'s stability table defines: on a **beta** surface a breaking change ships in a minor release with a migration note in the changelog; an **alpha** surface may change without notice, so pin exact versions if you depend on it. Pre-1.0, a minor release is the breaking-change slot for both.')
  out.push('')
  out.push('Since and status come from `@since` / `@stability` JSDoc tags on the exports, so the code is the source of truth; a new export cannot ship without a stability decision.')
  out.push('')
  for (const surface of SURFACES) {
    out.push(`## ${surface.title}`)
    out.push('')
    out.push(surface.intro)
    out.push('')
    const groups = collectSurface(program, surface, problems)
    for (const group of groups) {
      if (group.label) {
        out.push(`### \`${group.label}\``)
        out.push('')
      }
      out.push(renderTable(group.rows))
      out.push('')
    }
  }
  return out.join('\n')
}

function main(): void {
  const checkOnly = process.argv.includes('--check')
  const files = SURFACES.flatMap(s => s.entries.map(e => e.file))
  const program = createProgram(files)
  const problems: Problem[] = []
  const generated = render(program, problems)

  if (problems.length > 0) {
    console.error('api-reference: every export of a documented surface needs `@since` + `@stability beta|alpha`, or `@internal`:')
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
