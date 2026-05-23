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
 *   - #1502 → #1527 — statement-mode + module-mode infrastructure +
 *     the rest of `docs/core/**` (29 pages total in the corpus)
 *   - #1529 — client-JS snapshot assertion for ✅ examples (74 seeded)
 *   - #1534 — statement-mode scaffold appends `return <div />` so
 *     signal / memo / effect declarations in API-reference snippets
 *     become snapshottable (74 → 140 contracts after Copilot-suggested
 *     placeholder skip rules)
 *   - this PR — per-BFxxx matcher for `error-codes.md`, lifting that
 *     page out of blanket-skip. Walks each `### BFxxx —` H3 and tests
 *     its ❌/⚠️ snippet against a permissive (`code IS in errors`)
 *     assertion. Surfaced 11 BFxxx codes that `errors.ts` defines but
 *     no production code emits, plus 3 codes whose doc snippet is too
 *     minimal to trip the implemented check; both lists catalogued as
 *     `test.skip` with explicit reasons.
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
 *        - statement (`const`, `if`, plain call): wrap inside a function
 *          body that returns `<div />`, with the reactivity imports
 *          available. The trailing return is what makes the body a
 *          renderable component — without it, `analyzeComponent`
 *          short-circuits and emits no IR / no client JS, so
 *          declarations like `createSignal(0)` in the body would not
 *          be snapshotted.
 *        - module (`'use client'` / `import` / `export` / `type` /
 *          `interface`): compile as-is at module scope.
 *   5. Compile via `TestAdapter` (Hono-like baseline):
 *        - positive / negative-go-mojo-only: assert no fatal errors AND
 *          snapshot the generated client JS (when produced) — pins the
 *          semantic shape so a future regression that silently drops a
 *          piece of the pipeline (e.g. a `.filter()` falling out of a
 *          `.filter().map()`, the #1434 failure mode) flips this test
 *          red instead of compiling through unchanged. Pure-server
 *          snippets emit no client JS and are not snapshotted here;
 *          adapter-conformance already covers their template output.
 *        - negative-all-adapters: assert ONLY the expected BFxxx code
 *          is present in fatals (no other fatal codes)
 *
 * The `negative-go-mojo-only` cases are asserted as positive here — the
 * cross-adapter check (Go / Mojo actually raising BFxxx) is a follow-up
 * once the mechanism is proven on more pages.
 */

import { describe, test, expect } from 'bun:test'
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
  if (/\[\s*\.\.\.\s*\]/.test(body)) return 'contains `[ ... ]` placeholder'
  // TS-signature notation in prose-style snippets like
  // `createPortal(children, container?, options?)`. The `?` after an
  // identifier immediately followed by `,` / `)` is not valid TSX (TS
  // only allows `?` on parameter declarations, not on call arguments),
  // so snapshotting these would pin parser leniency rather than any
  // real compiler semantics — and become fragile if parsing tightens.
  // Excludes legitimate `?.` optional chaining and `cond ? a : b`
  // ternaries by requiring `,` or `)` immediately after `?`.
  if (/\w\?\s*[,)]/.test(body)) {
    return 'TS-signature notation (`arg?, …` / `arg?)`) — placeholder, not real code'
  }
  if (/\bbf[A-Z]\w*\(/.test(body)) {
    return 'uses compiler-internal helper (bfText/bfComment/bfScopeAttr/...)'
  }
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

// Trailing JSX return forces the statement body to be analysed as a
// renderable component. Without this, `analyzeComponent` short-circuits
// on `!ctx.jsxReturn`, producing no IR / no client JS — leaving these
// snippets at the weaker "no fatal errors" assertion. With the return
// in place, signal / memo / effect declarations in the body land in the
// component's reactivity graph and show up in the snapshotted client
// JS, so a regression that silently drops, say, a dep from a memo is
// caught here too (the #1439 gap behind v4).
const STATEMENT_SCAFFOLD_FOOTER = `
  return <div />
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
  { path: 'core/core-concepts/how-it-works.md' },
  { path: 'core/core-concepts/reactivity.md' },
  { path: 'core/core-concepts/mpa-style.md' },
  { path: 'core/core-concepts/ai-native.md' },
  { path: 'core/adapters/hono-adapter.md' },
  { path: 'core/adapters/go-template-adapter.md' },
  { path: 'core/adapters/custom-adapter.md' },
  { path: 'core/advanced/code-splitting.md' },
  { path: 'core/advanced/compiler-internals.md' },
  // `core/advanced/error-codes.md` is handled by the per-BFxxx
  // matcher (see bottom of file) rather than the general extractor:
  // its `negative-all-adapters` strictness ("BFxxx must be the ONLY
  // fatal") doesn't fit a reference page whose minimal reproductions
  // routinely trip unrelated checks, and the per-section walker can
  // tie each ❌ snippet to its parent `### BFxxx —` H3.
  { path: 'core/advanced/performance.md' },
  { path: 'core/reactivity.md' },
  { path: 'core/introduction.md' },
]

const adapter = new TestAdapter()

function compileOnce(source: string) {
  const result = compileJSX(source, 'DocExample.tsx', { adapter })
  const fatals = result.errors.filter(e => e.severity === 'error')
  const clientJsFile = result.files.find(f => f.type === 'clientJs')
  return { fatals, clientJs: clientJsFile?.content ?? null }
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
        const { fatals, clientJs } = compileOnce(source)

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
            // Semantic snapshot. Snippets that exercise reactivity emit
            // client JS — pin it so a future regression that silently
            // drops, say, a `.filter()` from a list pipeline (the #1434
            // failure mode) flips this test red instead of compiling
            // through unchanged. Pure-server snippets (no `"use client"`)
            // emit no client JS and are skipped here — adapter-conformance
            // already covers their template output.
            if (clientJs !== null) {
              expect(clientJs).toMatchSnapshot()
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

// =============================================================================
// Per-BFxxx matcher for `docs/core/advanced/error-codes.md`
// =============================================================================
//
// The general extractor blanket-skips `error-codes.md` because its
// illustrative snippets depend on file-level context the shared
// scaffold can't reproduce (module vs function scope, directive
// position, undefined identifiers like `Child`/`count`) and because
// its `negative-all-adapters` assertion requires the labelled code
// to be the ONLY fatal — too strict for a reference page whose
// minimal repros routinely trip unrelated checks.
//
// This block walks each `### BFxxx — …` H3 section and tests its
// `// ❌` / `// ⚠️` snippet against a permissive assertion: the
// BFxxx code MUST appear among the diagnostics, but other diagnostics
// are allowed.
//
// Two gap categories surfaced by this matcher are catalogued via
// `test.skip` rather than removed, so the test corpus stays loud
// about the doc/compiler drift:
//
//   - "Documented but unimplemented" (BF010, BF011, BF012,
//     BF020, BF022, BF025, BF030, BF031, BF040, BF041, BF042, BF045):
//     `errors.ts` defines the constant + message but `grep ErrorCodes.X`
//     across `packages/jsx/src/**` finds zero production emission
//     sites, so no snippet shape will ever trip it.
//   - "Implemented but doc snippet too minimal": the code IS emitted
//     by the compiler in real programs, but the literal snippet in
//     `error-codes.md` doesn't carry enough context (e.g. BF043 needs
//     a stateful component; BF044 needs a declared signal getter).
//     These are doc-edit follow-ups.
//
// Both lists live in code so a future PR that wires up the missing
// emission site / enriches the doc snippet simply removes the entry
// and the corresponding `test()` starts asserting for real.

interface ErrorCodeContract {
  code: string
  marker: '❌' | '⚠️'
  body: string
  line: number
  label: string
  skipReason?: string
}

// BFxxx codes whose ❌/⚠️ snippet in `error-codes.md` is too minimal
// to actually trip the emission site (the doc shows the smallest
// possible reproduction, but the compiler check is gated by
// surrounding context the snippet omits).
const ERROR_CODES_DOC_TOO_MINIMAL: Record<string, string> = {
  BF021: 'BF021 has multiple ❌ snippets in placeholder form (`.map(...)`) — covered concretely by `jsx-compatibility.md` tests; the doc-form snippets here remain placeholder',
  BF043: 'BF043 fires only for STATEFUL components (signals/memos/effects). The doc snippet `function Child({ count }: Props)` has no reactivity, so the check is correctly silent — doc snippet needs enrichment to be testable as-is',
  BF044: 'BF044 fires only when a real signal getter is bound. The doc snippet `<Child count={count} />` references an undeclared `count`, so the check is silent — doc snippet needs enrichment',
}

// BFxxx codes that `errors.ts` defines but no production code in
// `packages/jsx/src/**` actually emits. Verified via
// `grep ErrorCodes.<NAME>` returning zero sites outside `errors.ts`
// and `__tests__/`. Documented for visibility; un-skipping requires
// implementing the missing emission site.
const ERROR_CODES_UNIMPLEMENTED: Record<string, string> = {
  BF010: 'documented but no emission site (see ErrorCodes.UNKNOWN_SIGNAL)',
  BF011: 'documented but no emission site (see ErrorCodes.SIGNAL_OUTSIDE_COMPONENT)',
  BF012: 'documented but no emission site (see ErrorCodes.INVALID_SIGNAL_USAGE)',
  BF020: 'documented but no emission site (see ErrorCodes.INVALID_JSX_EXPRESSION)',
  BF022: 'documented but no emission site (see ErrorCodes.INVALID_JSX_ATTRIBUTE)',
  BF030: 'documented but no emission site (see ErrorCodes.TYPE_INFERENCE_FAILED)',
  BF031: 'documented but no emission site (see ErrorCodes.PROPS_TYPE_MISMATCH)',
  BF040: 'documented but no emission site (see ErrorCodes.COMPONENT_NOT_FOUND)',
  BF041: 'documented but no emission site (see ErrorCodes.CIRCULAR_DEPENDENCY)',
  BF042: 'documented but no emission site (see ErrorCodes.INVALID_COMPONENT_NAME)',
}

function extractErrorCodeContracts(md: string): ErrorCodeContract[] {
  const lines = md.split('\n')
  const contracts: ErrorCodeContract[] = []

  // Walk H3 sections. A section runs from one `### BF\d+` heading to
  // the next H3 of any code (or EOF).
  let sectionCode: string | null = null
  let i = 0
  while (i < lines.length) {
    const heading = lines[i].match(/^###\s+(BF\d+)\b/)
    if (heading) {
      sectionCode = heading[1]
      i++
      continue
    }
    // Boundary into a non-BF H3 or H2 closes the section.
    if (/^#{1,3}\s/.test(lines[i]) && !/^###\s+BF\d+/.test(lines[i])) {
      sectionCode = null
      i++
      continue
    }
    if (sectionCode && /^```tsx\s*$/.test(lines[i])) {
      const fenceLineNumber = i + 1
      let j = i + 1
      while (j < lines.length && !/^```\s*$/.test(lines[j])) j++
      const blockLines = lines.slice(i + 1, j)
      // Same marker rules as the general extractor: column-0 `//`,
      // excluding `// @`-prefixed compiler directives. Split into
      // segments on markers + blank lines (when any marker exists).
      const isMarker = (l: string) => /^\/\//.test(l) && !/^\/\/\s*@/.test(l)
      const hasMarker = blockLines.some(isMarker)
      type Seg = { offset: number; lines: string[] }
      const segments: Seg[] = []
      let cur: Seg | null = null
      const flush = () => { if (cur && cur.lines.some(l => l.trim() !== '')) segments.push(cur); cur = null }
      blockLines.forEach((ln, idx) => {
        if (isMarker(ln)) { flush(); cur = { offset: idx, lines: [ln] } }
        else if (ln.trim() === '' && hasMarker) flush()
        else { if (!cur) cur = { offset: idx, lines: [] }; cur.lines.push(ln) }
      })
      flush()
      for (const seg of segments) {
        const labelLine = /^\s*\/\//.test(seg.lines[0]) ? seg.lines[0] : ''
        const body = (labelLine ? seg.lines.slice(1) : seg.lines).join('\n').trim()
        if (body === '') continue
        const markerMatch = labelLine.match(/(❌|⚠️)/)
        if (!markerMatch) continue
        const marker = markerMatch[1] as '❌' | '⚠️'
        const label = labelLine.replace(/^\s*\/\/\s*/, '').trim() || '(empty)'
        const startLine = fenceLineNumber + 1 + seg.offset + (labelLine ? 1 : 0)
        const skipReason =
          detectSharedSkipReason(body) ??
          ERROR_CODES_UNIMPLEMENTED[sectionCode] ??
          ERROR_CODES_DOC_TOO_MINIMAL[sectionCode]
        contracts.push({ code: sectionCode, marker, body, line: startLine, label, skipReason })
      }
      i = j + 1
      continue
    }
    i++
  }
  return contracts
}

describe('docs/core/advanced/error-codes.md per-BFxxx matchers', () => {
  const md = readFileSync(resolve(DOCS_ROOT, 'core/advanced/error-codes.md'), 'utf8')
  const contracts = extractErrorCodeContracts(md)

  test('extractor returned a non-empty contract set', () => {
    if (contracts.length === 0) {
      throw new Error('extractor returned zero contracts — has the page structure changed?')
    }
  })

  for (const c of contracts) {
    const name = `L${c.line} — ${c.code}: ${c.label}`
    if (c.skipReason) {
      test.skip(`${name}  [skip: ${c.skipReason}]`, () => {})
      continue
    }
    test(name, () => {
      // Module-level snippets (full files / module-level decls) compile
      // as-is; expression-mode snippets get wrapped in the expression
      // scaffold so identifiers like `items` resolve. detectBodyKind's
      // 'statement' bucket would normally wrap in `StatementExample`,
      // but error-codes.md statement-shaped bodies (`const [count] = …`
      // demonstrating module-level signal antipatterns) need to stay
      // at module scope to preserve the file-level context the BFxxx
      // check is actually about — so we treat 'statement' as 'module'
      // here.
      const trimmed = c.body.trim()
      const isExpression = trimmed.startsWith('{') || trimmed.startsWith('<')
      const source = isExpression
        ? EXPRESSION_SCAFFOLD_HEADER + c.body + EXPRESSION_SCAFFOLD_FOOTER
        : c.body + '\n'
      const result = compileJSX(source, 'DocExample.tsx', { adapter })
      const matched = result.errors.find(e => e.code === c.code)
      if (!matched) {
        const got = result.errors.map(e => `  ${e.severity} ${e.code}: ${e.message}`).join('\n') || '  (no diagnostics)'
        throw new Error(
          `expected diagnostic ${c.code}, got:\n${got}\n--- source ---\n${source}`,
        )
      }
    })
  }
})
