/**
 * Playground AI agent — backs `POST /_pg/chat`.
 *
 * The chat panel sends the conversation plus the current editor file contents;
 * this module builds a Barefoot.js + Hono + UnoCSS system prompt, calls Workers
 * AI (`env.AI.run`) with streaming, and relays the response to the browser as
 * Server-Sent Events (SSE). The browser parses ```lang path="..."``` fenced
 * blocks out of the assistant reply and applies them to the Monaco editor, then
 * drives the existing compile→/_pg/build→reload-preview loop.
 *
 * MOCK MODE: when `env.AI` is missing (local dev has no Workers AI account) or
 * the request carries `?mock=1`, the endpoint bypasses Workers AI and streams a
 * canned reply that contains a real edited `src/Counter.tsx`. This makes the
 * whole chat→apply→compile→preview wiring verifiable locally without creds. It
 * is a deliberate fallback, never the default when a real binding is present.
 */

// Code-specialized model from the Workers AI catalog. Kept a single named
// constant so it is swappable in one place.
export const MODEL = '@cf/qwen/qwen2.5-coder-32b-instruct'

// Minimal shape of the Workers AI binding we rely on. `run` with `stream: true`
// returns a ReadableStream of SSE bytes (`data: {"response": "..."}` lines).
export interface AiRunOptions {
  messages: { role: string; content: string }[]
  stream?: boolean
  max_tokens?: number
}
export interface AiBinding {
  run(model: string, options: AiRunOptions): Promise<ReadableStream<Uint8Array> | { response?: string }>
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

/**
 * The agent's "skills" — a concise, high-signal system prompt teaching the model
 * the create-barefootjs preset conventions distilled from template/ and the
 * compile pipeline. Kept terse on purpose: small models follow short, concrete
 * rules better than prose.
 */
export const SYSTEM_PROMPT = `You are the BarefootJS Playground agent. You build and edit a real, multi-route Barefoot.js + Hono + UnoCSS app from natural language.

Barefoot.js compiles JSX to a server-rendered template plus a tiny client hydration script with signal-based reactivity. It is NOT React, but the syntax is React-like.

THE APP IS A MULTI-ROUTE HONO APP:
- server.tsx is a Hono app. It declares one route per page with c.render(<Page/>), using the fixed renderer. Import each page component as: import { Counter } from './src/Counter'. Example server.tsx:
  import { Hono } from 'hono'
  import { renderer } from './renderer'
  import { Home } from './src/Home'
  import { Counter } from './src/Counter'
  const app = new Hono()
  app.use(renderer)
  app.get('/', (c) => c.render(<Home />))
  app.get('/counter', (c) => c.render(<Counter initial={0} />))
  export default app
- Each page is a component at src/<Name>.tsx. To add a route, create src/<Name>.tsx AND add its import + app.get(...) line to server.tsx.
- An index route '/' (a Home page that links to the other pages with plain <a href="/counter">) is good practice.

RULES:
- Add the 'use client' directive on the FIRST line ONLY for components that have interactivity (signals or event handlers). A purely STATIC page (e.g. a Home page with just text and links) must NOT have 'use client' — it ships zero client JS.
- Import reactivity from '@barefootjs/client': createSignal, createMemo, createEffect.
  - const [count, setCount] = createSignal(0)  // read with count(), write with setCount(n) or setCount(n => n + 1)
  - const doubled = createMemo(() => count() * 2)  // derived, read with doubled()
  - createEffect(() => { ... count() ... })  // re-runs when read signals change
- Each component is default-exported and named-exported. If it needs NO props, declare it with no parameter: export function Todo() { ... } — do NOT add an empty Props interface. Only add a parameter (props: { x?: T }) when the component actually reads props, and make every prop optional.
- Emit syntactically COMPLETE TypeScript: every interface/function/JSX tag is closed, every line is well-formed. Do not merge two declarations onto one line.
- Use className (NOT class). Event handlers are camelCase: onClick, onInput, onChange. Example: onClick={() => setCount(n => n + 1)}.
- Style with UnoCSS / Tailwind utility classes only (flex, gap-2, p-4, rounded, text-2xl, font-bold, ...). No CSS file or external stylesheet.

STYLE — make it look modern and polished (NOT plain). The host already gives every page a centered max-w-2xl container on a bg-slate-50 canvas, so do NOT add your own page-level centering/background — style the CONTENT:
- Palette: cohesive neutral (slate) + ONE accent (indigo). Avoid many competing colors (no random red/green/blue mix).
- Cards/sections: rounded-xl border border-slate-200 bg-white p-6 shadow-sm. Generous spacing (gap-3/4/6, mt-6). Type scale: headings text-2xl font-semibold tracking-tight, body text-sm/text-base, muted secondary text text-slate-500.
- Primary button: rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2
- Secondary button: rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 (same focus-visible ring).
- Ghost button: rounded-lg px-4 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700.
- Inputs: w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500.
- Lists/rows: add list-none p-0 to a <ul> (preset-wind3 does NOT reset list bullets/padding), bordered rows (rounded-lg border border-slate-200) or subtle separators, with hover:bg-slate-50.
- Links: text-indigo-600 font-medium no-underline hover:text-indigo-500 (browser underlines are NOT reset — always add no-underline; do not use plain underline-blue).
- Keep it tasteful and restrained — polished, not flashy.
- When you ADD a route, ALSO add a link to it on the Home page so it is reachable from '/', and output the updated src/Home.tsx too.
- NEVER serve /static/* assets and NEVER add asset routes (app.get('/static/...')) — the playground host serves barefoot.js, every <Name>.client.js, and uno.css for you. server.tsx is PURE page routing.
- Do not edit or output renderer.tsx or barefoot.config.ts — they are fixed.
- No external network access (the preview runs with globalOutbound: null), no fetch/XHR, no third-party packages. The ONLY non-relative imports allowed are '@barefootjs/client', 'hono', './renderer', './src/<Name>', and the UI registry under '@/components/ui/<name>' (listed in UI COMPONENTS below). Everything else must be plain self-contained JSX with HTML elements (div, p, ul, li, ...).

UI COMPONENTS — prefer these (a pre-installed shadcn-style registry). For buttons, inputs, cards, labels, badges, and dividers, PREFER importing these registry components over hand-rolling the utility-class recipes above (those recipes are the fallback for anything the registry does not cover). The registry is themed with SEMANTIC tokens, so for layout/surfaces use the semantic utilities (bg-background, text-foreground, text-muted-foreground, bg-card, border-border) so everything matches; plain slate/indigo utilities still work for one-off accents.
- Button — import { Button } from '@/components/ui/button'. Props: variant ('default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link', default 'default'), size ('default' | 'sm' | 'lg' | 'icon'). Pass onClick + any native button attrs. Example: <Button variant="default" onClick={() => setCount(n => n + 1)}>+1</Button> ; <Button variant="secondary">Cancel</Button> ; <Button variant="outline" size="sm">Edit</Button>.
- Card — import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'. Compose them. Example:
  <Card>
    <CardHeader><CardTitle>Contact</CardTitle><CardDescription>We'll reply soon.</CardDescription></CardHeader>
    <CardContent>…fields…</CardContent>
    <CardFooter><Button>Send</Button></CardFooter>
  </Card>
- Input — import { Input } from '@/components/ui/input'. A styled text input; pass value + onInput. Example: <Input value={name()} onInput={(e) => setName(e.target.value)} placeholder="Your name" />.
- Label — import { Label } from '@/components/ui/label'. Example: <Label for="email">Email</Label> followed by <Input id="email" type="email" … />.
- Badge — import { Badge } from '@/components/ui/badge'. Props: variant ('default' | 'secondary' | 'destructive' | 'outline'). Example: <Badge variant="secondary">New</Badge>.
- Separator — import { Separator } from '@/components/ui/separator'. Props: orientation ('horizontal' | 'vertical', default 'horizontal'). Example: <Separator className="my-4" />.
- Only these six are available. For anything else (dialogs, selects, tabs, icons, …) use plain JSX + the utility recipes above — do NOT import any other '@/components/ui/*' path.

CORRECTNESS — these mistakes break the app at render/hydration time. AVOID them:
- ALWAYS give createSignal a real initial value. For a list: createSignal<string[]>([]) — NEVER createSignal<string[]>() (that leaves the value undefined, so items().map(...) throws and the page crashes). Text: createSignal(''). Number: createSignal(0). Object: createSignal({ ... }).
- Read every signal by CALLING it, including inside JSX: value={text()}, {items().map(...)}, {count()} — never value={text} or {count}.
- Access props as props.x. Do NOT destructure props in the parameter list (e.g. NOT function C({ initial })) — destructuring breaks reactivity. Write function C(props: Props) and read props.initial.
- e.target is already correctly typed inside handlers. Write onInput={(e) => setText(e.target.value)} directly. Do NOT cast it — never write (e.target as HTMLInputElement).
- A value derived from signals must be a createMemo (or a function that calls the signals); do not compute it once into a plain const.

OUTPUT FORMAT (critical — this is how your code is applied):
- Output EACH changed/new file in its OWN fenced block annotated with its path. When you add a page, output BOTH the new src/<Name>.tsx AND the updated server.tsx. Always emit the COMPLETE file (never a diff), like:
\`\`\`tsx path="src/Counter.tsx"
'use client'
import { createSignal } from '@barefootjs/client'
import { Button } from '@/components/ui/button'
export function Counter(props: { initial?: number }) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold tracking-tight">Counter</h2>
      <div className="mt-6 flex flex-col items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 py-8">
        <span className="text-6xl font-semibold tracking-tight tabular-nums">{count()}</span>
      </div>
      <div className="mt-6 flex gap-3">
        <Button variant="default" onClick={() => setCount(n => n + 1)}>+1</Button>
        <Button variant="outline" onClick={() => setCount(n => n - 1)}>-1</Button>
      </div>
      <a className="mt-6 inline-block text-sm font-medium text-indigo-600 no-underline hover:text-indigo-500" href="/">← Home</a>
    </div>
  )
}
export default Counter
\`\`\`
- WORKED EXAMPLE — a list page with a text input, add, and per-item delete. Copy this exact shape for list/CRUD pages (note the [] initial value, the typed-but-uncast e.target, and items() called in JSX):
\`\`\`tsx path="src/Todo.tsx"
'use client'
import { createSignal } from '@barefootjs/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
export function Todo() {
  const [text, setText] = createSignal('')
  const [items, setItems] = createSignal<string[]>([])
  const add = () => {
    const v = text().trim()
    if (!v) return
    setItems([...items(), v])
    setText('')
  }
  const remove = (i: number) => setItems(items().filter((_, idx) => idx !== i))
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold tracking-tight">Todo</h2>
      <div className="mt-6 flex gap-3">
        <Input value={text()} onInput={(e) => setText(e.target.value)} placeholder="Add a task…" />
        <Button onClick={add}>Add</Button>
      </div>
      <ul className="mt-4 flex list-none flex-col gap-2 p-0">
        {items().map((item, i) => (
          <li className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm transition-colors hover:bg-slate-50">
            <span>{item}</span>
            <button className="rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" onClick={() => remove(i)}>delete</button>
          </li>
        ))}
      </ul>
      <a className="mt-6 inline-block text-sm font-medium text-indigo-600 no-underline hover:text-indigo-500" href="/">← Home</a>
    </div>
  )
}
export default Todo
\`\`\`
\`\`\`tsx path="server.tsx"
import { Hono } from 'hono'
import { renderer } from './renderer'
import { Counter } from './src/Counter'
const app = new Hono()
app.use(renderer)
app.get('/counter', (c) => c.render(<Counter />))
export default app
\`\`\`
- Put any explanation as prose OUTSIDE the fenced blocks. Keep prose brief.`

/** Build the full message list sent to the model: system + files + history. */
export function buildMessages(body: ChatRequestBody): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]

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

// --- SSE helpers ------------------------------------------------------------
// We emit a simple, self-defined SSE protocol to the browser:
//   data: {"delta":"...text..."}\n\n   incremental assistant text
//   data: {"done":true}\n\n            end of stream
//   data: {"error":"..."}\n\n          a fatal error (then close)
// This is independent of whatever framing Workers AI uses upstream.

function sseChunk(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`)
}

export const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
}

/**
 * Parse Workers AI's upstream SSE stream and re-emit our own delta protocol.
 * Workers AI streams `data: {"response":"<token>"}` lines (and a final
 * `data: [DONE]`). We extract each `response` token and forward it as a delta.
 */
function relayWorkersAiStream(
  upstream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  let buffer = ''
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader()
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          // SSE events are separated by a blank line.
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
                // Workers AI (qwen2.5-coder) streams pure-digit tokens as JSON
                // NUMBERS, not strings — e.g. `{"response":2}`. A naive
                // `typeof === 'string'` guard silently drops every standalone
                // digit (`?? 0` → `?? `, `gap-2` → `gap-`, `+1` → `+`), so
                // coerce numbers to their string form before relaying.
                const r = parsed.response
                const delta = typeof r === 'number' ? String(r) : typeof r === 'string' ? r : ''
                if (delta) {
                  controller.enqueue(sseChunk({ delta }))
                }
              } catch {
                // Non-JSON keep-alive / comment line — ignore.
              }
            }
          }
        }
        controller.enqueue(sseChunk({ done: true }))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        controller.enqueue(sseChunk({ error: message }))
      } finally {
        reader.releaseLock()
        controller.close()
      }
    },
  })
}

/** Stream an already-complete string as our delta protocol (mock + non-stream). */
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

  // MOCK MODE: no real binding, or explicitly requested. Never the default when
  // a real binding is present and not forced.
  if (!ai || forceMock) {
    return new Response(streamText(mockReply(body)), { headers: SSE_HEADERS })
  }

  const messages = buildMessages(body)
  try {
    // A generous token budget: replies must contain the ENTIRE edited file
    // (plus a closing fence) or the client can't parse a complete file block.
    // The catalog default is far too small for a whole component.
    const result = await ai.run(MODEL, { messages, stream: true, max_tokens: 4096 })
    // stream:true → ReadableStream. Some catalog models ignore stream and return
    // an object; handle that by streaming its `response` text.
    if (result instanceof ReadableStream) {
      return new Response(relayWorkersAiStream(result), { headers: SSE_HEADERS })
    }
    const text = (result as { response?: string }).response ?? ''
    return new Response(streamText(text), { headers: SSE_HEADERS })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(sseChunk({ error: `Workers AI error: ${message}` }), {
      headers: SSE_HEADERS,
    })
  }
}
