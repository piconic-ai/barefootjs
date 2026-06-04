/**
 * build-knowledge.ts — extract BarefootJS / Hono knowledge at BUILD time and
 * embed it as `generated/knowledge-bundle.ts`, the corpus the runtime
 * tool-calling agent (agent.ts) queries.
 *
 * WHY a build step: the `bf` CLI is a Node/Bun process (subprocess + filesystem).
 * The host Worker runs in workerd (no subprocess, no fs), so it cannot shell out
 * to `bf` at request time. We therefore run the CLIs HERE (Bun, build time),
 * capture their structured output, and freeze it into a TS module the Worker
 * imports. At runtime the agent's tools are thin in-Worker lookups over this
 * frozen data — no subprocess, no network.
 *
 * What we extract:
 *   1. COMPONENT_DOCS  — `bf docs <name> --json` for the EXPOSED registry
 *      components (must match build-registry.ts's REGISTRY `expose: true` set):
 *      props, variants, usage examples, import path. Backs get_component_docs().
 *   2. COMPONENT_INDEX — `bf search <q> --json` over the registry, narrowed to
 *      the exposed set: name + description + category + importPath. Backs
 *      search_components().
 *   3. BAREFOOT_GUIDE  — `bf guide <topic>` for a few high-value, compact topics
 *      (error codes, reactivity, props reactivity). Backs barefoot_guide().
 *   4. HONO_DOCS       — Hono routing/JSX-renderer essentials extracted at build
 *      time from the official `hono` CLI (@hono/cli: `hono docs <path>`), which
 *      fetches hono.dev. We pull the routing + jsx-renderer pages this app's
 *      server.tsx needs, distill them to the relevant excerpts, and prepend a
 *      short playground-specific framing (the fixed renderer + host-served
 *      assets). Backs hono_docs(). Network is required at build time (like CI).
 *
 * Run standalone: `bun run site/playground/build/build-knowledge.ts`
 * Wired into build/build-counter.ts (runs before the worker bundle).
 */

import { spawnSync } from 'node:child_process'
import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLAYGROUND = join(HERE, '..')
const REPO_ROOT = join(PLAYGROUND, '..', '..')
const GENERATED = join(PLAYGROUND, 'generated')

// The CLI entry, invoked directly (not via the `bf` package script, which
// prints a `$ …` echo line that would corrupt --json parsing).
const CLI = join(REPO_ROOT, 'packages', 'cli', 'src', 'index.ts')

/**
 * The AI-facing registry components. MUST match build-registry.ts's REGISTRY
 * entries with `expose: true` (slot is internal and intentionally excluded).
 */
const EXPOSED_COMPONENTS = ['button', 'card', 'input', 'label', 'badge', 'separator']

/** Public import specifier the AI's app uses for a registry component. */
function importPath(name: string): string {
  return `@/components/ui/${name}`
}

/** Run the bf CLI and return stdout, throwing on non-zero exit. */
function runBf(args: string[]): string {
  const res = spawnSync('bun', ['run', CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (res.status !== 0) {
    throw new Error(
      `bf ${args.join(' ')} exited ${res.status}:\n${res.stderr || res.stdout}`,
    )
  }
  return res.stdout
}

// --- 1. Component docs ------------------------------------------------------

interface DocProp {
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
}
interface DocExample {
  title: string
  code: string
}
interface ComponentDocs {
  name: string
  title: string
  description: string
  importPath: string
  /** Exported identifiers (Card → Card, CardHeader, …). */
  exports: string[]
  stateful: boolean
  props: DocProp[]
  /** Variant union name → allowed string values (e.g. ButtonVariant → […]). */
  variants: Record<string, string[]>
  examples: DocExample[]
}

interface RawDocs {
  name: string
  title: string
  description: string
  stateful?: boolean
  props?: DocProp[]
  variants?: Record<string, string[]>
  examples?: Array<{ title: string; code: string }>
}

function extractComponentDocs(): Record<string, ComponentDocs> {
  const out: Record<string, ComponentDocs> = {}
  // Compound components (Card → CardHeader, CardTitle, …) are not always all
  // reported by `bf docs`; capture the documented exports plus the well-known
  // compound members so the AI knows what to compose.
  const COMPOUND_EXPORTS: Record<string, string[]> = {
    card: [
      'Card',
      'CardHeader',
      'CardTitle',
      'CardDescription',
      'CardContent',
      'CardFooter',
    ],
  }
  for (const name of EXPOSED_COMPONENTS) {
    const raw = JSON.parse(runBf(['docs', name, '--json'])) as RawDocs
    const title = raw.title ?? name
    const exports = COMPOUND_EXPORTS[name] ?? [title]
    out[name] = {
      name,
      title,
      description: raw.description ?? '',
      importPath: importPath(name),
      exports,
      stateful: Boolean(raw.stateful),
      props: raw.props ?? [],
      variants: raw.variants ?? {},
      examples: (raw.examples ?? []).map((e) => ({ title: e.title, code: e.code })),
    }
  }
  return out
}

// --- 2. Component search index ----------------------------------------------

interface IndexEntry {
  name: string
  description: string
  category: string
  importPath: string
}

interface RawSearchHit {
  name: string
  type: string
  category?: string
  description?: string
  stateful?: boolean
}

function extractComponentIndex(): IndexEntry[] {
  // A single broad query that surfaces the whole local registry, then narrow to
  // the exposed set (the AI must only ever import these — see agent prompt).
  // `bf search` ranks by relevance to the query; "component" matches broadly.
  const hits = JSON.parse(runBf(['search', 'component', '--json'])) as RawSearchHit[]
  const byName = new Map<string, RawSearchHit>()
  for (const h of hits) byName.set(h.name, h)
  const index: IndexEntry[] = []
  for (const name of EXPOSED_COMPONENTS) {
    const h = byName.get(name)
    // Fall back to the docs description if search didn't rank this component in.
    const description = h?.description ?? ''
    const category = h?.category ?? ''
    index.push({ name, description, category, importPath: importPath(name) })
  }
  return index
}

// --- 3. BarefootJS guides ---------------------------------------------------

/**
 * Compact, high-value guide topics. Each value is the raw `bf guide <topic>`
 * markdown. Keyed by a SHORT topic alias the tool accepts (the agent passes a
 * free-text topic that we fuzzy-match against these keys + aliases in agent.ts).
 */
const GUIDE_TOPICS: Array<{ key: string; doc: string }> = [
  { key: 'error-codes', doc: 'advanced/error-codes' },
  { key: 'reactivity', doc: 'reactivity' },
  { key: 'create-signal', doc: 'reactivity/create-signal' },
  { key: 'create-memo', doc: 'reactivity/create-memo' },
  { key: 'create-effect', doc: 'reactivity/create-effect' },
  { key: 'props-reactivity', doc: 'reactivity/props-reactivity' },
  { key: 'client-directive', doc: 'rendering/client-directive' },
]

function extractGuides(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { key, doc } of GUIDE_TOPICS) {
    out[key] = runBf(['guide', doc]).trim()
  }
  return out
}

// --- 4. Hono docs (extracted from the official @hono/cli) --------------------

/**
 * Run the official Hono CLI (`@hono/cli`, bin `hono`) and return stdout. It
 * fetches from hono.dev, so this requires network at BUILD time (fine for
 * build/CI). The local devDependency provides the `hono` bin under node_modules.
 */
function runHono(args: string[]): string {
  const res = spawnSync('bunx', ['hono', ...args], {
    cwd: PLAYGROUND,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (res.status !== 0) {
    throw new Error(
      `hono ${args.join(' ')} exited ${res.status}:\n${res.stderr || res.stdout}`,
    )
  }
  return res.stdout
}

/**
 * `hono docs <path>` prefixes the markdown with a "Fetching … for <path>…"
 * status line; strip it so only the doc body remains.
 */
function honoDocBody(path: string): string {
  const raw = runHono(['docs', path])
  return raw.replace(/^Fetching Hono documentation[^\n]*\n+/i, '').trim()
}

/**
 * Keep a markdown doc compact: take everything up to (but not including) the
 * first heading whose title matches `stopHeadingRe`, so we drop long tail
 * sections (advanced options, edge cases) the playground app never needs.
 */
function truncateAtHeading(md: string, stopHeadingRe: RegExp): string {
  const lines = md.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,6}\s+(.*)$/)
    if (m && out.length > 0 && stopHeadingRe.test(m[1])) break
    out.push(lines[i])
  }
  return out.join('\n').trim()
}

/**
 * Build HONO_DOCS by combining (a) a short, playground-specific framing that
 * the upstream docs cannot know (the FIXED renderer, host-served assets, the
 * allowed import set) with (b) the authoritative routing + jsx-renderer
 * excerpts pulled from hono.dev via the official CLI. The framing comes FIRST
 * because it carries the hard constraints; the upstream excerpts back it up
 * with canonical API usage.
 */
function extractHonoDocs(): string {
  // (b) Canonical upstream excerpts (network, build time).
  const routing = truncateAtHeading(
    honoDocBody('/docs/api/routing'),
    /grouping|chained|base path|routing priority/i,
  )
  const jsxRenderer = truncateAtHeading(
    honoDocBody('/docs/middleware/builtin/jsx-renderer'),
    /options|nested|extending the contextrenderer/i,
  )

  // (a) Playground framing — the load-bearing constraints for THIS app shape.
  const framing = `# Hono routing for the playground (server.tsx)

server.tsx is a Hono app that does ONE thing: declare a route per page and
render its page component through the FIXED renderer. It serves NO static
assets — the playground host serves barefoot.js, every <Name>.client.js, and
uno.css. So server.tsx is pure page routing.

## App shape (copy this structure)

import { Hono } from 'hono'
import { renderer } from './renderer'
import { Home } from './src/Home'
import { Counter } from './src/Counter'

const app = new Hono()
app.use(renderer)                                   // install the fixed renderer
app.get('/', (c) => c.render(<Home />))             // index route
app.get('/counter', (c) => c.render(<Counter initial={0} />))
export default app

## Rules for THIS app

- Import each page from './src/<Name>' (matching the file src/<Name>.tsx).
- Mount the renderer once with app.use(renderer) before the routes. Do NOT call
  jsxRenderer yourself — './renderer' already wraps the HTML document.
- Each route handler is (c) => c.render(<Page ...props />). Pass props as JSX
  attributes; c.render wraps the page in the HTML document + import map +
  uno.css + hydration scripts.
- Read path params with c.req.param('name') when a route has :name segments.
- An index '/' route (a Home page linking to the others with <a href="...">) is
  good practice. When you ADD a route, also add a link to it from Home.
- NEVER add app.get('/static/...') or any asset route. NEVER import or edit
  renderer.tsx / barefoot.config.ts — they are fixed.
- The ONLY non-relative imports allowed anywhere: 'hono', '@barefootjs/client',
  './renderer', './src/<Name>', and '@/components/ui/<name>' (registry).
- Always \`export default app\`.`

  return [
    framing,
    '---\n\n## Reference: Hono routing (from hono.dev)\n\n' + routing,
    '---\n\n## Reference: JSX Renderer middleware (from hono.dev)\n\n' + jsxRenderer,
  ].join('\n\n')
}

// --- Emit -------------------------------------------------------------------

async function main() {
  console.log('Extracting component docs…')
  const componentDocs = extractComponentDocs()
  console.log(`  ${Object.keys(componentDocs).length} components`)

  console.log('Extracting component index…')
  const componentIndex = extractComponentIndex()
  console.log(`  ${componentIndex.length} index entries`)

  console.log('Extracting BarefootJS guides…')
  const guides = extractGuides()
  console.log(`  ${Object.keys(guides).length} guide topics`)

  console.log('Extracting Hono docs (via @hono/cli → hono.dev)…')
  const honoDocs = extractHonoDocs()
  console.log(`  ${honoDocs.length} chars`)

  await mkdir(GENERATED, { recursive: true })
  const module = `// Generated by build/build-knowledge.ts — do not edit by hand.
// The frozen BarefootJS / Hono knowledge corpus the playground's tool-calling
// agent (agent.ts) queries at request time. Extracted at BUILD time by running
// the \`bf\` CLI (docs / search / guide), which cannot run inside workerd. The
// runtime tools are thin in-Worker lookups over these constants — no
// subprocess, no network. See build/build-knowledge.ts.

export interface KnowledgeDocProp {
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
}
export interface KnowledgeDocExample {
  title: string
  code: string
}
export interface KnowledgeComponentDocs {
  name: string
  title: string
  description: string
  importPath: string
  exports: string[]
  stateful: boolean
  props: KnowledgeDocProp[]
  variants: Record<string, string[]>
  examples: KnowledgeDocExample[]
}
export interface KnowledgeIndexEntry {
  name: string
  description: string
  category: string
  importPath: string
}

// name → full docs (props / variants / examples / import path). Backs the
// get_component_docs tool.
export const COMPONENT_DOCS: Record<string, KnowledgeComponentDocs> = ${JSON.stringify(componentDocs, null, 2)}

// Flat list for the search_components tool (name / description / category /
// importPath). Only the EXPOSED registry components appear here.
export const COMPONENT_INDEX: KnowledgeIndexEntry[] = ${JSON.stringify(componentIndex, null, 2)}

// topic key → raw guide markdown. Backs the barefoot_guide tool.
export const BAREFOOT_GUIDE: Record<string, string> = ${JSON.stringify(guides, null, 2)}

// Routing cheatsheet for the fixed playground app shape. Backs the hono_docs
// tool. Playground framing + routing/jsx-renderer excerpts from hono.dev
// (extracted at build time via @hono/cli).
export const HONO_DOCS: string = ${JSON.stringify(honoDocs)}
`
  await writeFile(join(GENERATED, 'knowledge-bundle.ts'), module)
  console.log(`Wrote generated/knowledge-bundle.ts`)
}

await main()
