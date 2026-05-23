/**
 * Doc Examples (#1439)
 *
 * Mechanically validates that the fenced code examples in user-facing
 * documentation still compile (or fail with the documented BFxxx code)
 * on the current compiler.
 *
 * Prompted by #1434 — `.filter().map()` with a block-body predicate
 * silently dropped the `.filter()` even though that exact shape is
 * documented as supported. A documented pattern that silently breaks
 * is the worst case for end-user trust, so this test treats each doc
 * example as a contract.
 *
 * Coverage milestones:
 *   - #1497 — `docs/core/rendering/jsx-compatibility.md`
 *   - #1499 — `docs/core/rendering/{client-directive,fragment}.md`
 *   - this PR — `docs/core/reactivity/create-signal.md` + statement-mode
 *     / module-mode infrastructure so API-reference snippets can be
 *     compiled too (not just JSX expressions in render position)
 *
 * Pipeline per page:
 *   1. Walk fenced ```tsx blocks. If a fence contains any `//` marker,
 *      split it into segments on `//` and blank lines. Otherwise treat
 *      the whole fence as one segment — this preserves multi-statement
 *      examples (full modules, `'use client'` + decls) that the doc
 *      author meant as a single coherent snippet.
 *   2. Classify each segment by the marker on its label line:
 *        - `// ❌ BFxxx (all adapters)` → `negative-all-adapters`
 *        - `// ❌ BFxxx on Go/Mojo`   → `negative-go-mojo-only`
 *        - anything else              → `positive`
 *   3. Skip segments matching shared placeholder/fragment patterns or
 *      per-page overrides, with a recorded reason.
 *   4. Classify the body by kind (expression / statement / module) and
 *      wrap with the matching scaffold:
 *        - expression (`{...}` / `<...>`): wrap inside a JSX render tree
 *          with pre-declared signals (`count`, `todos`, `items`, …).
 *        - statement (`const`, `if`, plain call): wrap inside an empty
 *          function body with the reactivity imports available.
 *        - module (`'use client'` / `import` / `export` / `type` /
 *          `interface`): compile as-is at module scope.
 *   5. Compile via `TestAdapter` (Hono-like baseline):
 *        - positive / negative-go-mojo-only: assert no fatal errors
 *        - negative-all-adapters: assert ONLY the expected BFxxx code
 *          is present in fatals (no other fatal codes)
 *
 * The `negative-go-mojo-only` cases are asserted as positive here — the
 * cross-adapter check (Go / Mojo actually raising BFxxx) is a follow-up
 * once the mechanism is proven on more pages.
 */

import { describe, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const DOCS_ROOT = resolve(__dirname, '../../../../docs')

type Expected =
  | { kind: 'positive' }
  | { kind: 'negative-all-adapters'; code: string }
  | { kind: 'negative-go-mojo-only'; code: string }

interface DocExample {
  label: string
  startLine: number
  expected: Expected
  body: string
  skipReason?: string
}

interface PageSpec {
  /** Path relative to `docs/`. */
  path: string
  /** Optional per-page override: return a skip reason or undefined. */
  pageSkip?: (body: string) => string | undefined
}

function parseExpected(labelLine: string): Expected {
  const text = labelLine.replace(/^\s*\/\/\s*/, '')
  const allAdapters = text.match(/❌\s*(BF\d+)\s*\(all adapters\)/)
  if (allAdapters) return { kind: 'negative-all-adapters', code: allAdapters[1] }
  const goMojo = text.match(/❌\s*(BF\d+)\s+on Go\/Mojo/)
  if (goMojo) return { kind: 'negative-go-mojo-only', code: goMojo[1] }
  const anyNegative = text.match(/❌\s*(BF\d+)/)
  if (anyNegative) return { kind: 'negative-all-adapters', code: anyNegative[1] }
  return { kind: 'positive' }
}

type BodyKind = 'expression' | 'statement' | 'module'

function detectBodyKind(body: string): BodyKind {
  const trimmed = body.trim()
  if (/^['"]use client['"]/.test(trimmed)) return 'module'
  if (/^import\b/.test(trimmed)) return 'module'
  if (/^export\b/.test(trimmed)) return 'module'
  if (/^type\b/.test(trimmed)) return 'module'
  if (/^interface\b/.test(trimmed)) return 'module'
  const firstChar = trimmed.charAt(0)
  if (firstChar === '{' || firstChar === '<') return 'expression'
  return 'statement'
}

function detectSharedSkipReason(body: string): string | undefined {
  if (/\(\s*\.\.\.\s*\)/.test(body)) return 'contains `(...)` placeholder'
  if (/>\s*\.\.\.\s*</.test(body)) return 'contains `>...<` placeholder'
  if (/\{\s*\.\.\.\s*\}/.test(body)) return 'contains `{ ... }` placeholder'
  if (/^\s*[a-zA-Z][\w-]*\s*=\s*[{"]/.test(body) && !/^\s*(const|let|var)\b/.test(body)) {
    return 'JSX attribute fragment (not a standalone expression / statement)'
  }
  return undefined
}

function extractExamples(md: string, page: PageSpec): DocExample[] {
  const lines = md.split('\n')
  const examples: DocExample[] = []

  let i = 0
  while (i < lines.length) {
    if (!/^```tsx\s*$/.test(lines[i])) {
      i++
      continue
    }

    const fenceLineNumber = i + 1
    let j = i + 1
    while (j < lines.length && !/^```\s*$/.test(lines[j])) j++

    const blockLines = lines.slice(i + 1, j)
    // Marker comments are at column 0 (e.g. `// ❌ BF021`, `// Source`).
    // Indented `//` lines are in-code comments and must NOT chop the fence
    // into segments. Compiler directive comments (`// @bf-ignore …`) are
    // part of the snippet, not a separator.
    const isMarker = (l: string) => /^\/\//.test(l) && !/^\/\/\s*@/.test(l)
    const hasMarkerLine = blockLines.some(isMarker)
    const segments: Array<{ offset: number; lines: string[] }> = []
    let cur: { offset: number; lines: string[] } | null = null

    const flush = () => {
      if (cur && cur.lines.some(l => l.trim() !== '')) segments.push(cur)
      cur = null
    }

    blockLines.forEach((ln, idx) => {
      if (isMarker(ln)) {
        flush()
        cur = { offset: idx, lines: [ln] }
      } else if (ln.trim() === '' && hasMarkerLine) {
        flush()
      } else {
        if (!cur) cur = { offset: idx, lines: [] }
        cur.lines.push(ln)
      }
    })
    flush()

    for (const seg of segments) {
      const hasLabel = /^\s*\/\//.test(seg.lines[0])
      const labelLine = hasLabel ? seg.lines[0] : ''
      const bodyLines = hasLabel ? seg.lines.slice(1) : seg.lines
      const body = bodyLines.join('\n').trim()
      if (body === '') continue
      const label = hasLabel
        ? labelLine.replace(/^\s*\/\/\s*/, '').trim() || '(empty label)'
        : '(no label)'
      const startLine =
        fenceLineNumber + 1 + seg.offset + (hasLabel ? 1 : 0)
      const expected = parseExpected(labelLine)
      const skipReason =
        detectSharedSkipReason(body) ?? page.pageSkip?.(body)
      examples.push({ label, startLine, expected, body, skipReason })
    }

    i = j + 1
  }
  return examples
}

const EXPRESSION_SCAFFOLD_HEADER = `'use client'
import { createSignal } from '@barefootjs/client'

function TodoItem(props: { todo: any; key?: any }) { return <li>{String(props.todo)}</li> }
function Item(props: { item: any; key?: any }) { return <li>{String(props.item)}</li> }
function Dashboard() { return <div>D</div> }

export function Example(props: { children?: any }) {
  const { children } = props
  const [count, setCount] = createSignal(0)
  const [isLoggedIn] = createSignal(false)
  const [todos] = createSignal<Array<{ id: number; done: boolean; name: string }>>([])
  const [items] = createSignal<Array<{ id: number; active: boolean; done: boolean; price: number; name: string; tags: Array<{ active: boolean }> }>>([])
  const [filter] = createSignal<'all' | 'active' | 'completed'>('all')
  const [accepted] = createSignal(false)
  const [text, setText] = createSignal('')
  const status: string = 'empty'
  const handleSubmit = () => {}
  return (
    <div>
`

const EXPRESSION_SCAFFOLD_FOOTER = `
    </div>
  )
}
`

const STATEMENT_SCAFFOLD_HEADER = `'use client'
import { createSignal, createEffect, createMemo, onMount, onCleanup, untrack } from '@barefootjs/client'

export function StatementExample() {
`

const STATEMENT_SCAFFOLD_FOOTER = `
}
`

function buildSource(example: DocExample): string {
  switch (detectBodyKind(example.body)) {
    case 'expression':
      return EXPRESSION_SCAFFOLD_HEADER + example.body + EXPRESSION_SCAFFOLD_FOOTER
    case 'statement':
      return STATEMENT_SCAFFOLD_HEADER + example.body + STATEMENT_SCAFFOLD_FOOTER
    case 'module':
      return example.body + '\n'
  }
}

const PAGES: PageSpec[] = [
  { path: 'core/rendering/jsx-compatibility.md' },
  {
    path: 'core/rendering/client-directive.md',
    pageSkip: body => {
      if (/@client \*\/ expression\s*\}/.test(body)) {
        return 'placeholder body (`{/* @client */ expression}`)'
      }
      return undefined
    },
  },
  { path: 'core/rendering/fragment.md' },
  { path: 'core/reactivity/create-signal.md' },
  { path: 'core/reactivity/create-effect.md' },
  { path: 'core/reactivity/create-memo.md' },
  { path: 'core/reactivity/on-mount.md' },
  { path: 'core/reactivity/on-cleanup.md' },
  { path: 'core/reactivity/untrack.md' },
  { path: 'core/reactivity/props-reactivity.md' },
  { path: 'core/components/component-authoring.md' },
  { path: 'core/components/children-slots.md' },
  { path: 'core/components/context-api.md' },
  { path: 'core/components/portals.md' },
  { path: 'core/components/props-type-safety.md' },
  { path: 'core/components/styling.md' },
]

const adapter = new TestAdapter()

function compileOnce(source: string) {
  const result = compileJSX(source, 'DocExample.tsx', { adapter })
  return result.errors.filter(e => e.severity === 'error')
}

for (const page of PAGES) {
  describe(`docs/${page.path} doc-examples`, () => {
    const md = readFileSync(resolve(DOCS_ROOT, page.path), 'utf8')
    const examples = extractExamples(md, page)

    test('extractor returned a non-empty set of examples', () => {
      if (examples.length === 0) {
        throw new Error(
          `extractor returned zero examples for ${page.path} — has the markdown structure changed?`,
        )
      }
    })

    for (const ex of examples) {
      const name = `L${ex.startLine} — ${ex.label}`

      if (ex.skipReason) {
        test.skip(`${name}  [skip: ${ex.skipReason}]`, () => {})
        continue
      }

      test(name, () => {
        const source = buildSource(ex)
        const fatals = compileOnce(source)

        switch (ex.expected.kind) {
          case 'positive':
          case 'negative-go-mojo-only': {
            if (fatals.length > 0) {
              const dump = fatals
                .map(e => `  ${e.code}: ${e.message}`)
                .join('\n')
              throw new Error(
                `expected no fatal errors on TestAdapter, got:\n${dump}\n--- source ---\n${source}`,
              )
            }
            return
          }
          case 'negative-all-adapters': {
            const code = ex.expected.code
            const matched = fatals.find(e => e.code === code)
            if (!matched) {
              const got = fatals.map(e => e.code).join(', ') || '(none)'
              throw new Error(
                `expected error ${code}, got: ${got}\n--- source ---\n${source}`,
              )
            }
            const unexpected = fatals.filter(e => e.code !== code)
            if (unexpected.length > 0) {
              const dump = unexpected
                .map(e => `  ${e.code}: ${e.message}`)
                .join('\n')
              throw new Error(
                `expected only ${code}, but got additional fatal errors:\n${dump}\n--- source ---\n${source}`,
              )
            }
            return
          }
        }
      })
    }
  })
}
