// Lightweight MDX-lite parser and plain-markdown projector for
// docs/core. Used by both the documentation site (which renders the
// JSX nodes against a component registry) and the `bf guide` CLI
// command (which projects the JSX nodes down to plain markdown so
// terminal output stays readable).
//
// Recognised input shape: standard markdown plus self-closing JSX
// tags on their own line, e.g.
//
//   <PackageManagerTabs command="barefootjs@latest" mode="create" />
//
// This is intentionally smaller than @mdx-js/mdx — it covers the only
// shape Quick Start needs today, runs without dependencies, and does
// not require runtime `eval` (Cloudflare Workers blocks that). If a
// future docs page needs nested JSX or expression interpolation we'll
// swap this for a real MDX compiler.

export type MdxNode =
  | { type: 'md'; text: string }
  | { type: 'jsx'; name: string; props: Record<string, string> }

export interface ParsedMdx {
  frontmatter: Record<string, string>
  nodes: MdxNode[]
  body: string
}

/** Match a self-closing JSX tag on its own line, capturing name and attrs. */
const TAG_LINE_RE = /^[\t ]*<([A-Z][A-Za-z0-9]*)\b([^>]*?)\/>[\t ]*$/

const FENCE_RE = /^[\t ]*(```|~~~)/

const ATTR_RE = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*"([^"]*)"/g

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const trimmed = content.trimStart()
  if (!trimmed.startsWith('---')) return { frontmatter: {}, body: content }

  const end = trimmed.indexOf('\n---', 3)
  if (end === -1) return { frontmatter: {}, body: content }

  const yaml = trimmed.slice(3, end).trim()
  const body = trimmed.slice(end + 4).replace(/^\r?\n/, '')

  const frontmatter: Record<string, string> = {}
  for (const line of yaml.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, '')
    if (key) frontmatter[key] = value
  }

  return { frontmatter, body }
}

function parseProps(attrs: string): Record<string, string> {
  const props: Record<string, string> = {}
  if (!attrs.trim()) return props
  let m: RegExpExecArray | null
  ATTR_RE.lastIndex = 0
  while ((m = ATTR_RE.exec(attrs)) !== null) {
    props[m[1]] = m[2]
  }
  return props
}

/**
 * Split an MDX-lite source into ordered nodes: markdown chunks
 * interleaved with self-closing JSX tags. Tags inside fenced code
 * blocks (``` or ~~~) are left as plain text — they're examples,
 * not embeds.
 *
 * Markdown chunks are emitted with leading/trailing blank lines
 * trimmed; callers (the renderer and the markdown projector) put
 * the spacing back when joining so the resulting markdown stays
 * paragraph-clean regardless of source whitespace.
 */
export function parseMdx(source: string): ParsedMdx {
  const { frontmatter, body } = parseFrontmatter(source)
  const lines = body.split('\n')

  const nodes: MdxNode[] = []
  let buffer: string[] = []
  let inFence = false

  const flushBuffer = () => {
    if (buffer.length === 0) return
    const text = buffer.join('\n').replace(/^\n+|\n+$/g, '')
    if (text.length > 0) nodes.push({ type: 'md', text })
    buffer = []
  }

  for (const line of lines) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      buffer.push(line)
      continue
    }

    if (!inFence) {
      const match = line.match(TAG_LINE_RE)
      if (match) {
        flushBuffer()
        nodes.push({ type: 'jsx', name: match[1], props: parseProps(match[2]) })
        continue
      }
    }

    buffer.push(line)
  }
  flushBuffer()

  return { frontmatter, nodes, body }
}

export type MdxProjector = (props: Record<string, string>) => string

/**
 * Re-emit `<ComponentName ... />` tags as plain markdown by looking
 * each one up in `projectors`. Unknown components are dropped so
 * scrapers don't see leaked JSX. The frontmatter is preserved as
 * written.
 */
export function projectMdxToMarkdown(
  source: string,
  projectors: Record<string, MdxProjector>,
): string {
  const parsed = parseMdx(source)

  const fm = Object.entries(parsed.frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')

  // Drop empty projector outputs (unknown components) so we don't
  // leave a `\n\n\n\n` hole between the chunks they sat between.
  const body = parsed.nodes
    .map((node) => {
      if (node.type === 'md') return node.text
      const project = projectors[node.name]
      return project ? project(node.props) : ''
    })
    .filter((chunk) => chunk.length > 0)
    .join('\n\n')

  return fm ? `---\n${fm}\n---\n\n${body}\n` : `${body}\n`
}

/**
 * Default projectors shared by the site's `/<slug>.md` synth route
 * and `bf guide`. Keep these in sync with the matching site components.
 */
export const defaultMdxProjectors: Record<string, MdxProjector> = {
  PackageManagerTabs: ({ command, mode, defaultPm }) => {
    const pm = defaultPm || 'npm'
    const cmd = renderPackageManagerCommand(pm, command || '', (mode as 'dlx' | 'create') || 'dlx')
    return '```bash\n' + cmd + '\n```'
  },
}

function renderPackageManagerCommand(pm: string, command: string, mode: 'dlx' | 'create'): string {
  if (mode === 'create') {
    const stripped = command.replace(/@[^/]*$/, '')
    if (pm === 'bun') return `bun create ${stripped}`
    if (pm === 'pnpm') return `pnpm create ${stripped}`
    if (pm === 'yarn') return `yarn create ${stripped}`
    return `npm create ${command}`
  }
  if (pm === 'bun') return `bunx --bun ${command}`
  if (pm === 'pnpm') return `pnpm dlx ${command}`
  if (pm === 'yarn') return `yarn dlx ${command}`
  return `npx ${command}`
}
