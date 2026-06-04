/**
 * Playground AI agent — backs `POST /_pg/chat`.
 *
 * A FUNCTION-CALLING agent. Instead of baking the entire BarefootJS + Hono +
 * registry API surface into one giant system prompt, the prompt is short (core
 * rules + output format) and the model looks knowledge up ON DEMAND via tools:
 *
 *   - search_components(query)      → matching registry components
 *   - get_component_docs(name)      → props / variants / usage for one component
 *   - barefoot_guide(topic)         → reactivity rules / error-code explanations
 *   - hono_docs(query?)             → server.tsx routing essentials
 *
 * Each tool is a thin in-Worker lookup over generated/knowledge-bundle.ts, which
 * build/build-knowledge.ts extracts from the `bf` CLI at BUILD time (the CLI is
 * a Node/Bun subprocess and cannot run inside workerd at request time).
 *
 * TOOL-CALLING LOOP (Workers AI specifics, verified against the live binding):
 *   - Tool rounds run NON-streamed (Workers AI streams a tool call as TEXT when
 *     `tools` are passed with `stream:true`, so tool_calls must be collected
 *     from a non-streamed call).
 *   - Workers AI returns tool calls in its NATIVE shape `{name, arguments}`
 *     (llama) OR the OpenAI shape `{id, type, function:{name, arguments}}`
 *     (qwen). We normalize both. When echoing the assistant's tool_calls back
 *     into the message history, the API validator REQUIRES the OpenAI shape
 *     ({id,type,function}), so we always re-emit that shape.
 *   - When the model stops requesting tools, the FINAL round runs WITHOUT tools
 *     and NON-streamed, so its full reply can be VALIDATED before the user sees
 *     it. The validated (possibly repaired) text is then replayed to the browser
 *     as our existing SSE delta protocol — the client /_pg/chat contract is
 *     unchanged.
 *
 * MAKING A WEAK MODEL RELIABLE (the design goal — close the quality gap with
 * engineering, not a bigger model):
 *   - PROACTIVE DOCS INJECTION: before the final round, the authoritative
 *     props/variants for every registry component in play are injected, so the
 *     model has them even if it skipped get_component_docs.
 *   - VALIDATE → SELF-REPAIR: the final reply's ```tsx path="..."``` file blocks
 *     are parsed and checked, CHEAPLY and DETERMINISTICALLY, against the embedded
 *     COMPONENT_DOCS — invalid variants/props (e.g. variant "primary"), wrong
 *     <Input type>, missing/typo'd @/components/ui imports, and unavailable
 *     components. Any issue triggers a focused server-side repair round (the
 *     exact issues + the correct options), capped at MAX_REPAIR_ROUNDS; the best
 *     result is surfaced after the cap. No compile is needed.
 *   - The concise BarefootJS rules + Hono essentials + the semantic shadcn STYLE
 *     guidance live in SYSTEM_PROMPT (correctness/on-theme), with the tools for
 *     detailed component-specific lookups.
 *
 * MOCK MODE: when `env.AI` is missing (local dev has no Workers AI account) or
 * the request carries `?mock=1`, the endpoint bypasses Workers AI and tools and
 * streams a canned multi-file reply. A deliberate fallback, never the default
 * when a real binding is present.
 */

import {
  COMPONENT_DOCS,
  COMPONENT_INDEX,
  BAREFOOT_GUIDE,
  HONO_DOCS,
} from './generated/knowledge-bundle'

// Workers AI model. MUST support function/tool calling. Verified working
// against the live `env.AI`: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` returns
// clean tool calls and, on a tools-less streamed round, clean fenced output.
// Kept a single named constant so it is swappable in one place. (Alternative
// verified: `@cf/qwen/qwen3-30b-a3b-fp8` — also works, but emits verbose
// reasoning_content and is slower; the parser below tolerates its OpenAI-shaped
// tool calls too, so swapping MODEL is sufficient.)
export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

// Max tool-calling rounds before forcing a final answer, to bound latency and
// avoid loops. Each round may issue several tool calls.
const MAX_TOOL_ROUNDS = 4

// --- Workers AI binding types ----------------------------------------------

/** A tool definition passed to the model (OpenAI function-calling schema). */
export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description?: string }>
      required?: string[]
    }
  }
}

/** A tool call as returned by Workers AI — both observed shapes. */
interface RawToolCall {
  id?: string
  name?: string
  arguments?: unknown
  type?: string
  function?: { name?: string; arguments?: unknown }
}

interface AiNonStreamResult {
  response?: string | null
  tool_calls?: RawToolCall[]
  // qwen / OpenAI-shaped models nest the message under choices[].
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: RawToolCall[] }
  }>
}

export interface AiRunOptions {
  messages: AiMessage[]
  tools?: ToolDef[]
  stream?: boolean
  max_tokens?: number
}
export interface AiBinding {
  run(
    model: string,
    options: AiRunOptions,
  ): Promise<ReadableStream<Uint8Array> | AiNonStreamResult>
}

/** A normalized tool call (OpenAI shape) for both history and execution. */
interface NormToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** A chat message, including the tool-protocol roles. */
interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: NormToolCall[]
  tool_call_id?: string
  name?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatFile {
  path: string
  content: string
}

export interface ChatRequestBody {
  messages?: ChatMessage[]
  files?: ChatFile[]
}

// --- System prompt (short: core rules + output format + "use the tools") ----

/**
 * Deliberately SHORT. The verbose per-component API docs, the registry list,
 * and the long style prose now live in the tools/knowledge (queried on demand).
 * This keeps only: the app shape, the output format, the few correctness rules
 * that cause hard crashes, and the instruction to USE THE TOOLS.
 */
export const SYSTEM_PROMPT = `You are the BarefootJS Playground agent. You build and edit a real, multi-route Barefoot.js + Hono + UnoCSS app from natural language. Barefoot.js compiles JSX to a server-rendered template plus a tiny signal-based client hydration script. It is NOT React, but the syntax is React-like.

USE THE TOOLS — do not guess. Before you write code, look knowledge up:
- search_components — which registry UI components exist (button, card, input, label, badge, separator).
- get_component_docs — a component's exact props, variants, and usage. Call this BEFORE using any @/components/ui/* component; never invent a prop or variant.
- barefoot_guide — reactivity rules and compiler error codes (topics: reactivity, create-signal, create-memo, create-effect, props-reactivity, client-directive, error-codes).
- hono_docs — how server.tsx routing works in this app.

APP SHAPE:
- Multi-route Hono app. server.tsx declares one route per page with c.render(<Page/>) using the FIXED renderer, importing each page from './src/<Name>'. Call hono_docs for the exact shape.
- Each page is a component at src/<Name>.tsx. To add a route: create src/<Name>.tsx AND add its import + app.get(...) to server.tsx. An index '/' Home page linking to the others (plain <a href="/path">) is good practice; when you add a route, add a link to it from Home and output the updated src/Home.tsx too.
- Do NOT edit or output renderer.tsx or barefoot.config.ts (fixed). NEVER add asset routes (app.get('/static/...')) — the host serves barefoot.js, every <Name>.client.js, and uno.css. The ONLY non-relative imports allowed: 'hono', '@barefootjs/client', './renderer', './src/<Name>', and '@/components/ui/<name>'. Everything else is plain self-contained JSX (div, p, ul, li, ...).

CRITICAL CORRECTNESS — these mistakes crash the app at render/hydration time. NEVER do them:
- ALWAYS give createSignal a real initial value: a list is createSignal<string[]>([]) (NEVER createSignal<string[]>() — undefined makes .map throw); text createSignal(''); number createSignal(0); object createSignal({}).
- Read every signal by CALLING it, including in JSX: value={text()}, {items().map(...)}, {count()} — never value={text}.
- Access props as props.x. Do NOT destructure props in the parameter list (breaks reactivity): write function C(props: Props) and read props.initial.
- e.target is already correctly typed inside handlers: onInput={(e) => setText(e.target.value)}. Do NOT cast it.
- Add 'use client' on the FIRST line ONLY for components with interactivity (signals or event handlers). A purely static page must NOT have it.
- Use className (NOT class). Event handlers are camelCase (onClick, onInput, onChange). Import reactivity from '@barefootjs/client'.
- Components with no props take no parameter (export function Todo() {}); add (props: { x?: T }) only when props are read.
- Label uses \`for\` (NOT htmlFor): <Label for="email">. Import reactivity (createSignal/createMemo/createEffect) from '@barefootjs/client'.

STYLE — match the semantic shadcn theme (the registry components and the theme tokens are already wired):
- PREFER the registry components (Button, Card, Input, Label, Badge, Separator) over hand-rolled markup. Group a form/section in a <Card> with CardHeader/CardTitle/CardContent/CardFooter.
- Use the SEMANTIC theme tokens, not random colors: surfaces bg-background / bg-card / text-foreground / text-muted-foreground; borders border-border / border-input; the primary action is the theme primary (an indigo-ish hue) via <Button> (variant="default") or text-primary — do NOT hardcode bg-blue-500 / bg-gray-300 / text-green-600 etc.
- Cards/containers: rounded-xl border border-border bg-card p-6 shadow-sm. Space with gap-*/space-y-*. Headings font-semibold tracking-tight.
- The host already centers each page in a max-w-2xl container on bg-slate-50 — style the CONTENT, not page-level centering/background. UnoCSS / Tailwind utility classes only (no CSS file).

OUTPUT FORMAT (critical — this is how your code is applied):
- Output EACH changed/new file in its OWN fenced block annotated with its path, the COMPLETE file (never a diff). When you add a page, output BOTH the new src/<Name>.tsx AND the updated server.tsx (and the updated src/Home.tsx if you added a link). Like:
\`\`\`tsx path="src/Counter.tsx"
'use client'
import { createSignal } from '@barefootjs/client'
export function Counter(props: { initial?: number }) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
}
export default Counter
\`\`\`
- Put any explanation as brief prose OUTSIDE the fenced blocks.`

// --- Tool definitions -------------------------------------------------------

export const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'search_components',
      description:
        'Search the available BarefootJS UI registry components by keyword. Returns matching components (name, description, category, import path). Use to discover which components exist before composing a UI.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Keywords describing the UI need, e.g. "button", "form input", "card". Empty returns all available components.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_component_docs',
      description:
        "Get the exact props, variants, usage examples, exported names, and import path for ONE registry UI component. Call this BEFORE using a component so you never invent a prop or variant value.",
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Component name (lowercase): button, card, input, label, badge, or separator.',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'barefoot_guide',
      description:
        'Look up BarefootJS reactivity rules or compiler error-code explanations. Topics: reactivity, create-signal, create-memo, create-effect, props-reactivity, client-directive, error-codes.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description:
              'The guide topic, e.g. "create-signal", "props-reactivity", or "error-codes".',
          },
        },
        required: ['topic'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hono_docs',
      description:
        "How server.tsx page routing works in this playground app (Hono + the fixed renderer + c.render). Call before writing or editing server.tsx.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional focus, e.g. "add a route". Ignored — the full routing cheatsheet is returned.',
          },
        },
        required: [],
      },
    },
  },
]

// --- Tool implementations (in-Worker lookups over the embedded knowledge) ----

function toolSearchComponents(query: string): string {
  const q = (query ?? '').trim().toLowerCase()
  const matches = q
    ? COMPONENT_INDEX.filter(
        (c) =>
          c.name.includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q),
      )
    : COMPONENT_INDEX
  const list = (matches.length ? matches : COMPONENT_INDEX).map((c) => ({
    name: c.name,
    description: c.description,
    category: c.category,
    importPath: c.importPath,
  }))
  return JSON.stringify({ components: list }, null, 2)
}

function toolGetComponentDocs(name: string): string {
  const key = (name ?? '').trim().toLowerCase()
  const docs = COMPONENT_DOCS[key]
  if (!docs) {
    return JSON.stringify({
      error: `Unknown component "${name}". Available: ${Object.keys(COMPONENT_DOCS).join(', ')}. Only these are importable as @/components/ui/<name>; anything else must be plain JSX.`,
    })
  }
  return JSON.stringify(docs, null, 2)
}

function toolBarefootGuide(topic: string): string {
  const t = (topic ?? '').trim().toLowerCase().replace(/\s+/g, '-')
  const keys = Object.keys(BAREFOOT_GUIDE)
  // Exact key first.
  let key = keys.find((k) => k === t)
  // Then substring either direction (e.g. "errors" → "error-codes").
  if (!key) key = keys.find((k) => k.includes(t) || t.includes(k))
  // Then loose word-stem overlap so "signals" → "create-signal", "memo" →
  // "create-memo", "effects" → "create-effect". Compare the topic's stem
  // (trailing plural 's' dropped) against each key's path segments' stems.
  if (!key) {
    const stem = (s: string) => s.replace(/s$/, '')
    const ts = stem(t)
    key = keys.find((k) =>
      k.split(/[-/]/).some((seg) => stem(seg) === ts || stem(seg).includes(ts) || ts.includes(stem(seg))),
    )
  }
  if (!key) {
    return `Unknown topic "${topic}". Available topics: ${keys.join(', ')}.`
  }
  return BAREFOOT_GUIDE[key]
}

function toolHonoDocs(): string {
  return HONO_DOCS
}

/** Execute a single tool call by name; returns the tool result string. */
function runTool(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'search_components':
      return toolSearchComponents(String(args.query ?? ''))
    case 'get_component_docs':
      return toolGetComponentDocs(String(args.name ?? ''))
    case 'barefoot_guide':
      return toolBarefootGuide(String(args.topic ?? ''))
    case 'hono_docs':
      return toolHonoDocs()
    default:
      return JSON.stringify({ error: `Unknown tool "${name}"` })
  }
}

// --- Output validation + self-repair ----------------------------------------
// CHEAP, DETERMINISTIC checks against the embedded COMPONENT_DOCS — NO compile.
// They catch the failure modes a weak model exhibits even with tools: invented
// registry variants/props, wrong @/components/ui import paths, and using a
// component that is not one of the six available. Any issue triggers a focused
// server-side repair round (see runRepairRounds); the user-visible SSE stream
// is unchanged — only the FINAL, validated text is streamed.

/** One extracted ```tsx path="..."``` file block from a model reply. */
export interface FileBlock {
  path: string
  content: string
}

// A fenced block annotated with a path: ```tsx path="src/Foo.tsx" … ```.
// Tolerant of the language tag (tsx/jsx/ts) and of single/double quotes.
const FILE_BLOCK_RE =
  /```(?:tsx|jsx|ts|js)?\s+path=["']([^"']+)["']\s*\n([\s\S]*?)```/g

/** Parse every fenced file block out of a model reply. */
export function parseFileBlocks(reply: string): FileBlock[] {
  const blocks: FileBlock[] = []
  FILE_BLOCK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = FILE_BLOCK_RE.exec(reply)) !== null) {
    blocks.push({ path: m[1].trim(), content: m[2] })
  }
  return blocks
}

/** A single validation problem, with the correct options to feed the repair. */
export interface ValidationIssue {
  path: string
  message: string
}

// Registry components keyed by their EXPORTED JSX identifier (Button, CardHeader,
// …) → the lowercase docs key. Built from COMPONENT_DOCS so it always matches the
// pre-compiled registry set. A component used in JSX whose tag is one of these
// must be imported from the matching @/components/ui/<name>.
const EXPORT_TO_DOCS_KEY: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const [key, docs] of Object.entries(COMPONENT_DOCS)) {
    for (const exp of docs.exports) map[exp] = key
  }
  return map
})()

// Native <input> type values — the ONLY valid `type` on the registry <Input>,
// which spreads ...props onto a real <input>. `textarea`/`select` are NOT input
// types (a weak model reaches for type="textarea" instead of a real <textarea>).
const VALID_INPUT_TYPES = new Set([
  'text', 'password', 'email', 'number', 'tel', 'url', 'search', 'date',
  'time', 'datetime-local', 'month', 'week', 'color', 'range', 'checkbox',
  'radio', 'file', 'hidden', 'submit', 'reset', 'button', 'image',
])

/** Map a docs key → the variant-prop name → allowed values (e.g. variant → [...]). */
function variantOptionsFor(docsKey: string): Record<string, string[]> {
  const docs = COMPONENT_DOCS[docsKey]
  if (!docs) return {}
  const out: Record<string, string[]> = {}
  // The docs key variants by their UNION TYPE name (ButtonVariant, ButtonSize).
  // Map each to the PROP that carries it by matching the prop's `type` field.
  for (const prop of docs.props) {
    const values = docs.variants[prop.type]
    if (values) out[prop.name] = values
  }
  return out
}

/**
 * Find every JSX opening tag for `component` in `content` and return the value
 * of its `attr={...}` / `attr="..."` string-literal attribute, if present.
 * Only literal string values are checked (dynamic `{expr}` values are skipped —
 * we cannot statically resolve them and must not false-flag them).
 */
function* literalAttrUsages(
  content: string,
  component: string,
  attr: string,
): Generator<string> {
  const tagRe = new RegExp(`<${component}(\\s[^>]*?)?/?>`, 'g')
  let tag: RegExpExecArray | null
  while ((tag = tagRe.exec(content)) !== null) {
    const attrs = tag[1] ?? ''
    const am = attrs.match(new RegExp(`\\b${attr}=["']([^"']*)["']`))
    if (am) yield am[1]
  }
}

/** Which registry component tags actually appear in this file. */
function usedRegistryComponents(content: string): Set<string> {
  const used = new Set<string>()
  for (const exp of Object.keys(EXPORT_TO_DOCS_KEY)) {
    if (new RegExp(`<${exp}[\\s/>]`).test(content)) used.add(exp)
  }
  return used
}

/** Which @/components/ui/<name> a file imports (docs keys). */
function importedRegistryKeys(content: string): Set<string> {
  const keys = new Set<string>()
  const re = /from\s+["']@\/components\/ui\/([a-z-]+)["']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) keys.add(m[1])
  return keys
}

/**
 * Validate one file's registry-component usage against COMPONENT_DOCS. Returns
 * the issues found (empty = clean). Deterministic and cheap — no compile.
 */
export function validateFile(block: FileBlock): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { path, content } = block

  // server.tsx structural checks. The Worker Loader entry imports the app as a
  // DEFAULT export and the renderer must be mounted, or every route 404s / the
  // page renders without its HTML shell. A weak model frequently emits
  // `export { app }` (named) — a hard, app-breaking mistake the registry checks
  // below would never see, so guard it here.
  if (path === 'server.tsx' || path.endsWith('/server.tsx')) {
    if (!/export\s+default\s+app\b/.test(content)) {
      issues.push({
        path,
        message:
          'server.tsx must end with `export default app` (a default export). `export { app }` is a named export and will not load. Change it to `export default app`.',
      })
    }
    if (!/app\.use\(\s*renderer\s*\)/.test(content)) {
      issues.push({
        path,
        message:
          "server.tsx must mount the fixed renderer before its routes: add `app.use(renderer)` (and `import { renderer } from './renderer'`).",
      })
    }
  }

  const used = usedRegistryComponents(content)
  const imported = importedRegistryKeys(content)

  // Imported-but-unavailable check first — it does not depend on JSX usage (a
  // file may import an unavailable component before it gets used).
  for (const key of imported) {
    if (!COMPONENT_DOCS[key]) {
      issues.push({
        path,
        message: `Imports '@/components/ui/${key}', which is not an available component. Available: ${Object.keys(COMPONENT_DOCS).join(', ')}. Anything else must be plain JSX (div, textarea, select, …).`,
      })
    }
  }

  if (used.size === 0) return issues

  // Group used components by their docs key (Card + CardHeader → "card").
  const usedKeys = new Set<string>()
  for (const comp of used) usedKeys.add(EXPORT_TO_DOCS_KEY[comp])

  for (const key of usedKeys) {
    // Import correctness: a used registry component must be imported from
    // @/components/ui/<name>.
    if (!imported.has(key)) {
      const exportsForKey = COMPONENT_DOCS[key].exports.join(', ')
      issues.push({
        path,
        message: `Uses <${[...used].filter((u) => EXPORT_TO_DOCS_KEY[u] === key).join('>, <')}> but does not import it. Add: import { ${exportsForKey} } from '@/components/ui/${key}'`,
      })
    }
  }

  // Variant / prop value checks for each used component.
  for (const comp of used) {
    const key = EXPORT_TO_DOCS_KEY[comp]
    const options = variantOptionsFor(key)
    for (const [attr, allowed] of Object.entries(options)) {
      for (const value of literalAttrUsages(content, comp, attr)) {
        if (!allowed.includes(value)) {
          issues.push({
            path,
            message: `<${comp} ${attr}="${value}"> is invalid. Valid ${attr} values for ${comp}: ${allowed.map((v) => `"${v}"`).join(', ')}.`,
          })
        }
      }
    }
  }

  // <Input type="..."> must be a real native input type (not textarea/select).
  if (used.has('Input')) {
    for (const value of literalAttrUsages(content, 'Input', 'type')) {
      if (!VALID_INPUT_TYPES.has(value)) {
        issues.push({
          path,
          message: `<Input type="${value}"> is not a valid input type. <Input> renders a native <input>; for multi-line text use a plain <textarea>, for choices a plain <select>. Valid input types: text, email, password, number, search, tel, url, date, checkbox, radio, file, ….`,
        })
      }
    }
  }

  return issues
}

/** Validate an entire model reply (all its file blocks). */
export function validateReply(reply: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const block of parseFileBlocks(reply)) {
    issues.push(...validateFile(block))
  }
  return issues
}

/** Docs keys for every registry component imported across a reply's files. */
function importedKeysInReply(reply: string): Set<string> {
  const keys = new Set<string>()
  for (const block of parseFileBlocks(reply)) {
    for (const k of importedRegistryKeys(block.content)) {
      if (COMPONENT_DOCS[k]) keys.add(k)
    }
  }
  return keys
}

/**
 * A compact, model-readable summary of one component's docs for proactive
 * injection / repair context: import line, props, and allowed variant values.
 * Smaller than the full get_component_docs JSON, focused on what prevents the
 * invalid-prop failure mode.
 */
function compactDocs(key: string): string {
  const d = COMPONENT_DOCS[key]
  if (!d) return ''
  const lines: string[] = []
  lines.push(`### ${d.title} — import { ${d.exports.join(', ')} } from '@/components/ui/${key}'`)
  const variantLines: string[] = []
  for (const prop of d.props) {
    const values = d.variants[prop.type]
    if (values) {
      variantLines.push(`  - ${prop.name}: ${values.map((v) => `"${v}"`).join(' | ')}${prop.default ? ` (default "${prop.default}")` : ''}`)
    } else {
      variantLines.push(`  - ${prop.name}: ${prop.type}${prop.required ? ' (required)' : ''}`)
    }
  }
  if (variantLines.length) lines.push('Props:\n' + variantLines.join('\n'))
  return lines.join('\n')
}

// --- Tool-call normalization ------------------------------------------------

/**
 * Normalize Workers AI's tool calls (native `{name, arguments}` OR OpenAI
 * `{id, type, function}`) into the OpenAI shape the API requires when the
 * assistant message carrying them is echoed back into the history.
 */
function normalizeToolCalls(raw: RawToolCall[] | undefined): NormToolCall[] {
  if (!raw || raw.length === 0) return []
  return raw.map((t, i) => {
    const name = t.name ?? t.function?.name ?? ''
    const rawArgs = t.arguments ?? t.function?.arguments ?? {}
    const argStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs)
    return {
      id: t.id ?? `call_${i}`,
      type: 'function',
      function: { name, arguments: argStr },
    }
  })
}

/** Read the assistant content + tool_calls out of either result shape. */
function readResult(result: AiNonStreamResult): {
  content: string
  toolCalls: NormToolCall[]
} {
  const msg = result.choices?.[0]?.message
  const content = (msg?.content ?? result.response ?? '') || ''
  const rawCalls = msg?.tool_calls ?? result.tool_calls
  return { content, toolCalls: normalizeToolCalls(rawCalls) }
}

/** Safely parse a tool call's JSON arguments. */
function parseArgs(argStr: string): Record<string, unknown> {
  try {
    const v = JSON.parse(argStr)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// --- Message assembly -------------------------------------------------------

/** Build the initial message list: system + current files + chat history. */
export function buildMessages(body: ChatRequestBody): AiMessage[] {
  const messages: AiMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]

  const files = body.files ?? []
  if (files.length > 0) {
    const rendered = files
      .map((f) => `\`\`\`tsx path="${f.path}"\n${f.content}\n\`\`\``)
      .join('\n\n')
    messages.push({
      role: 'system',
      content: `Current app files (edit server.tsx + src/<Name>.tsx as needed; renderer.tsx and barefoot.config.ts are fixed):\n\n${rendered}`,
    })
  }

  for (const m of body.messages ?? []) {
    if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: m.content })
    }
  }
  return messages
}

/**
 * Run the tool-calling rounds (NON-streamed). Mutates `messages` in place,
 * appending each assistant tool-call message and the corresponding tool
 * results, until the model stops requesting tools or MAX_TOOL_ROUNDS is hit.
 * Returns the names of every tool invoked (for observability/logging).
 */
async function runToolRounds(
  ai: AiBinding,
  messages: AiMessage[],
): Promise<string[]> {
  const invoked: string[] = []
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = (await ai.run(MODEL, {
      messages,
      tools: TOOLS,
      max_tokens: 1024,
    })) as AiNonStreamResult
    const { content, toolCalls } = readResult(result)
    if (toolCalls.length === 0) {
      // Model produced a (possibly final) assistant message with no tool calls.
      // Stop the tool loop; the streamed final round will regenerate the answer.
      break
    }
    // Echo the assistant tool-call message (OpenAI shape required by the API).
    messages.push({ role: 'assistant', content, tool_calls: toolCalls })
    for (const call of toolCalls) {
      invoked.push(call.function.name)
      const out = runTool(call.function.name, parseArgs(call.function.arguments))
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: out,
      })
    }
  }
  return invoked
}

// Max server-side repair rounds after the first final answer. Bounded so an
// uncooperative model cannot loop forever; the best result is surfaced after.
const MAX_REPAIR_ROUNDS = 2

/**
 * Drain Workers AI's STREAMED SSE response into a single string. Workers AI
 * streams `data: {"response":"<token>"}` lines (pure-digit tokens arrive as JSON
 * NUMBERS, e.g. `{"response":2}` — coerce them) and a final `data: [DONE]`.
 *
 * WHY stream-then-drain instead of a plain non-streamed `ai.run`: a non-streamed
 * 4096-token completion on a 70B model can exceed the upstream gateway timeout
 * (observed 504s at ~60s). A streamed call keeps the upstream connection
 * productive token-by-token, so it does not time out; we just accumulate the
 * tokens here because the validate→repair loop needs the WHOLE reply before the
 * user sees it.
 */
async function drainStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let buffer = ''
  let text = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        for (const line of rawEvent.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]' || payload === '') continue
          try {
            const parsed = JSON.parse(payload) as { response?: unknown }
            const r = parsed.response
            text += typeof r === 'number' ? String(r) : typeof r === 'string' ? r : ''
          } catch {
            // Non-JSON keep-alive / comment line — ignore.
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  return text
}

/**
 * Run ONE completion round (no tools) and return its full text. Streamed
 * upstream (to dodge the non-streamed gateway timeout) but drained here, so the
 * first final answer and each repair round can be validated before anything is
 * streamed to the user.
 */
async function completeOnce(
  ai: AiBinding,
  messages: AiMessage[],
): Promise<string> {
  const result = await ai.run(MODEL, { messages, stream: true, max_tokens: 4096 })
  if (result instanceof ReadableStream) return await drainStream(result)
  // Some catalog models ignore stream and return an object.
  return readResult(result as AiNonStreamResult).content
}

/**
 * Phrase the validation issues into a focused repair instruction, pulling the
 * correct options from COMPONENT_DOCS so the model has everything it needs to
 * fix the files in one shot.
 */
export function buildRepairMessage(
  issues: ValidationIssue[],
  reply: string,
): string {
  const byPath = new Map<string, string[]>()
  for (const i of issues) {
    const list = byPath.get(i.path) ?? []
    list.push(i.message)
    byPath.set(i.path, list)
  }
  const issueText = [...byPath.entries()]
    .map(([path, msgs]) => `In ${path}:\n${msgs.map((m) => `  - ${m}`).join('\n')}`)
    .join('\n\n')
  // Re-attach the authoritative docs for every registry component in play.
  const docs = [...importedKeysInReply(reply)].map(compactDocs).filter(Boolean)
  const docsBlock = docs.length
    ? `\n\nAuthoritative component docs (use ONLY these props/variants):\n${docs.join('\n\n')}`
    : ''
  return `Your previous answer has invalid registry-component usage. Fix EXACTLY these issues and output the COMPLETE corrected file(s) again, each in its own \`\`\`tsx path="..."\`\`\` block. Change nothing else.\n\n${issueText}${docsBlock}`
}

/**
 * Validate → self-repair loop. Given the first final reply, validate it against
 * COMPONENT_DOCS; if invalid, ask the model to fix exactly those issues, up to
 * MAX_REPAIR_ROUNDS. Returns the best reply (valid, or the last attempt) plus
 * the per-round issue counts (for logging / status). Pure of streaming.
 */
export async function runRepairRounds(
  ai: AiBinding,
  messages: AiMessage[],
  firstReply: string,
): Promise<{ reply: string; rounds: number; remainingIssues: ValidationIssue[] }> {
  let reply = firstReply
  let issues = validateReply(reply)
  let round = 0
  while (issues.length > 0 && round < MAX_REPAIR_ROUNDS) {
    round++
    // Echo the model's previous answer, then the focused repair request.
    messages.push({ role: 'assistant', content: reply })
    messages.push({ role: 'user', content: buildRepairMessage(issues, reply) })
    reply = await completeOnce(ai, messages)
    issues = validateReply(reply)
  }
  return { reply, rounds: round, remainingIssues: issues }
}

/**
 * Internal pure functions exposed for unit testing only (the in-Worker tool
 * layer + tool-call normalization + the deterministic output validator). Not
 * part of the agent's public API.
 */
export const __testing = {
  runTool,
  normalizeToolCalls,
  readResult,
  parseFileBlocks,
  validateFile,
  validateReply,
  buildRepairMessage,
  compactDocs,
}

// --- SSE helpers ------------------------------------------------------------
// Our delta protocol to the browser (independent of Workers AI's framing):
//   data: {"delta":"...text..."}\n\n   incremental assistant text
//   data: {"done":true}\n\n            end of stream
//   data: {"error":"..."}\n\n          a fatal error (then close)

function sseChunk(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`)
}

export const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
}

/**
 * Stream an already-complete string as our delta protocol.
 *
 * The REAL path streams the model's FINAL, VALIDATED reply this way: because
 * the validate→repair loop must inspect the whole reply before the user sees
 * it, the final model round runs NON-streamed and its (possibly repaired) text
 * is replayed here as deltas — the SSE contract to the browser is identical to
 * a live token stream. Also used by MOCK mode.
 */
function streamText(text: string): ReadableStream<Uint8Array> {
  // Chunk into small slices so the UI renders incrementally, exercising the
  // same streaming path the real model uses.
  const chunks: string[] = []
  const size = 24
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const c of chunks) {
        controller.enqueue(sseChunk({ delta: c }))
        // A tiny yield so the client paints between chunks.
        await new Promise((r) => setTimeout(r, 8))
      }
      controller.enqueue(sseChunk({ done: true }))
      controller.close()
    },
  })
}

/**
 * The canned MOCK reply. Emits a real, compilable MULTI-ROUTE app — server.tsx
 * (with `/` + `/counter`) plus src/Home.tsx and src/Counter.tsx — so the whole
 * chat → apply → compile → multi-route preview wiring is verifiable locally
 * without Workers AI creds. The counter's label reflects a "...label to X"
 * style request so a rename visibly takes effect; hydration (+1) keeps working.
 */
export function mockReply(body: ChatRequestBody): string {
  const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user')
  const text = (lastUser?.content ?? '').toLowerCase()
  // Pull a label out of "...label to X" / "...call it X"; fall back to "Count".
  let label = 'Count'
  const m =
    text.match(/label\s+to\s+["']?([a-z0-9 ]{1,24})["']?/i) ||
    text.match(/call\s+it\s+["']?([a-z0-9 ]{1,24})["']?/i) ||
    text.match(/to\s+["']([a-z0-9 ]{1,24})["']/i)
  if (m && m[1]) {
    label = m[1].trim().replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const homeFile = `export function Home() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">BarefootJS Playground</h1>
        <p className="text-base text-slate-500">A multi-route Hono app, server-rendered and hydrated live. Pick a demo.</p>
      </header>
      <ul className="flex list-none flex-col gap-3 p-0">
        <li>
          <a className="group flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50" href="/counter">
            <span className="flex flex-col gap-1">
              <span className="text-base font-medium text-slate-900">Counter</span>
              <span className="text-sm text-slate-500">A signal-based counter with derived state.</span>
            </span>
            <span className="text-slate-400 transition-colors group-hover:text-indigo-600">→</span>
          </a>
        </li>
      </ul>
    </div>
  )
}

export default Home
`

  const counterFile = `'use client'

import { createSignal, createMemo } from '@barefootjs/client'
import { Button } from '@/components/ui/button'

interface CounterProps {
  initial?: number
}

export function Counter(props: CounterProps) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">${label}</p>
      <div className="mt-4 flex flex-col items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 py-8">
        <span className="text-6xl font-semibold tracking-tight tabular-nums" data-testid="count">{count()}</span>
        <span className="text-sm text-muted-foreground">doubled: {doubled()}</span>
      </div>
      <div className="mt-6 flex gap-3">
        <Button variant="default" onClick={() => setCount((n) => n + 1)}>+1</Button>
        <Button variant="outline" onClick={() => setCount((n) => n - 1)}>-1</Button>
        <Button variant="ghost" className="ml-auto" onClick={() => setCount(0)}>Reset</Button>
      </div>
      <a className="mt-6 inline-block text-sm font-medium text-indigo-600 no-underline hover:text-indigo-500" href="/">← Home</a>
    </div>
  )
}

export default Counter
`

  const serverFile = `import { Hono } from 'hono'
import { renderer } from './renderer'
import { Home } from './src/Home'
import { Counter } from './src/Counter'

const app = new Hono()

app.use(renderer)

app.get('/', (c) => c.render(<Home />))
app.get('/counter', (c) => c.render(<Counter initial={0} />))

export default app
`

  return `Sure — here is a multi-route app: a home page at \`/\` linking to a counter at \`/counter\` (label "${label}").

\`\`\`tsx path="src/Home.tsx"
${homeFile}\`\`\`

\`\`\`tsx path="src/Counter.tsx"
${counterFile}\`\`\`

\`\`\`tsx path="server.tsx"
${serverFile}\`\`\`

(This is a mock response: local dev has no Workers AI binding, so the agent returned a canned multi-route edit to prove the chat → apply → compile → preview wiring.)`
}

/**
 * Handle `POST /_pg/chat`. Returns an SSE Response in all paths (real, mock,
 * error) so the client only needs one code path.
 *
 * REAL path: run the tool-calling rounds non-streamed (tools attached), then a
 * FINAL round without tools, streamed, relayed as our delta protocol.
 */
export async function handleChat(
  request: Request,
  ai: AiBinding | undefined,
): Promise<Response> {
  let body: ChatRequestBody
  try {
    body = (await request.json()) as ChatRequestBody
  } catch {
    return new Response(sseChunk({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: SSE_HEADERS,
    })
  }

  const url = new URL(request.url)
  const forceMock = url.searchParams.get('mock') === '1'

  // MOCK MODE: no real binding, or explicitly requested. The mock skips tools
  // and streams a canned multi-file reply.
  if (!ai || forceMock) {
    return new Response(streamText(mockReply(body)), { headers: SSE_HEADERS })
  }

  // Return the SSE Response IMMEDIATELY and run the whole multi-round pipeline
  // INSIDE the stream's start(): the tool rounds + final answer + validate→repair
  // are several sequential model calls, so doing them before constructing the
  // Response would leave the client connection idle (and risk a client-side
  // timeout) for the whole duration. Running them inside the stream lets us emit
  // small `status` deltas to keep the connection alive and give feedback, then
  // stream the FINAL, VALIDATED reply text. The client contract is unchanged: it
  // still only needs `delta` / `done` / `error`. (`status` is an optional,
  // ignorable hint.)
  const messages = buildMessages(body)
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const status = (s: string) => controller.enqueue(sseChunk({ status: s }))
      try {
        // 1) Tool-calling rounds. The model looks up component docs, barefoot
        //    rules, and hono routing on demand; results feed back in.
        status('Looking up components & docs…')
        const invoked = await runToolRounds(ai, messages)
        if (invoked.length > 0) {
          console.log(`[agent] tool calls: ${invoked.join(', ')}`)
        }

        // 2) Final answer round: NO tools. Workers AI does not reliably emit
        //    final prose when `tools` are attached to a streamed call, so the
        //    final round omits them. Some models (llama-3.3) otherwise keep
        //    "narrating" a tool call as plain text instead of finalizing — so an
        //    explicit finalize directive tells the model to STOP calling tools
        //    and emit the file blocks now, using what it gathered.
        messages.push({
          role: 'system',
          content:
            'You now have all the information you need. Do NOT call or mention any tool. Reply with ONLY the final answer: the complete edited file(s), each in its own fenced ```tsx path="..."``` block, plus brief prose outside the blocks. Output the file blocks directly.',
        })

        // 2a) Proactive docs injection: re-attach the authoritative
        //     props/variants for every registry component in play, so the model
        //     has them even if it skipped get_component_docs (nudges tool-skip
        //     cases — see D). Components are inferred from current files +
        //     whatever the user named in their last message.
        const referenced = new Set<string>()
        for (const f of body.files ?? []) {
          for (const k of importedRegistryKeys(f.content)) {
            if (COMPONENT_DOCS[k]) referenced.add(k)
          }
        }
        const lastUser = [...(body.messages ?? [])]
          .reverse()
          .find((m) => m.role === 'user')
        const lastText = (lastUser?.content ?? '').toLowerCase()
        for (const key of Object.keys(COMPONENT_DOCS)) {
          if (lastText.includes(key)) referenced.add(key)
        }
        if (referenced.size > 0) {
          const docs = [...referenced].map(compactDocs).filter(Boolean).join('\n\n')
          messages.push({
            role: 'system',
            content: `Authoritative docs for the registry components likely in play (use ONLY these props/variants — never invent one):\n\n${docs}`,
          })
        }

        // 2b) First final answer (streamed upstream, drained here) so it can be
        //     validated before the user sees it.
        status('Generating code…')
        let reply = await completeOnce(ai, messages)

        // 2c) Validate → self-repair loop (A). Cheap deterministic checks vs the
        //     embedded docs; focused repair rounds on any invalid variant/prop.
        const initialIssues = validateReply(reply)
        if (initialIssues.length > 0) {
          status(`Fixing ${initialIssues.length} component issue(s)…`)
          console.log(
            `[agent] validation found ${initialIssues.length} issue(s): ` +
              initialIssues.map((i) => `${i.path}: ${i.message}`).join(' | '),
          )
        }
        const { reply: repaired, rounds, remainingIssues } = await runRepairRounds(
          ai,
          messages,
          reply,
        )
        reply = repaired
        if (rounds > 0) {
          console.log(
            `[agent] repair rounds: ${rounds}` +
              (remainingIssues.length
                ? ` (still ${remainingIssues.length} issue(s) after cap — surfacing best result)`
                : ' (all issues fixed)'),
          )
        }

        // 3) Stream the FINAL, VALIDATED reply as our delta protocol.
        const size = 24
        for (let i = 0; i < reply.length; i += size) {
          controller.enqueue(sseChunk({ delta: reply.slice(i, i + size) }))
        }
        controller.enqueue(sseChunk({ done: true }))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        controller.enqueue(sseChunk({ error: `Workers AI error: ${message}` }))
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: SSE_HEADERS })
}
