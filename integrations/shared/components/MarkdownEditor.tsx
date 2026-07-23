'use client'

// Live Markdown editor — a compact BarefootJS onboarding showcase.
//
// What it demonstrates:
//   - A single source-of-truth signal (`text`) driving several derived views.
//   - `createMemo` for parsing + stats that recompute only when `text` changes.
//   - Reactive list rendering (`blocks().map(...)`) for the live preview, the
//     same pattern as TodoApp but producing block elements instead of items.
//   - Plain (non-reactive) event handlers doing textarea manipulation, showing
//     that heavy imperative logic lives in ordinary functions, not the graph.

import { createSignal, createMemo } from '@barefootjs/client'

type Seg = { bold: boolean; text: string }
// Every block renders through the SAME shape — a <div> with a precomputed
// className plus a list of inline segments. Keeping one uniform shape lets the
// preview map be a single JSX expression (like Tetris's grid), which is the
// form the compiler lowers cleanly; a map callback with a statement body and
// several `if`-returns is NOT lowered and emits broken client JS.
type Block = { cls: string; segs: Seg[] }

// Split a line into alternating plain / bold segments on `**`. Even indices are
// plain, odd indices are bold — rendered as <strong> in the preview. Segments
// are precomputed here (in the parser, part of the reactive `blocks` memo) so
// the preview renders them with a plain nested `.map`, no child component — a
// prop-driven child would sever reactivity on the client.
function splitBold(text: string): Seg[] {
  return text.split('**').map((seg, i) => ({ bold: i % 2 === 1, text: seg }))
}

// Block-level Markdown parser. Kept deliberately small — no inline HTML, no
// third-party dependency — so the whole example stays readable end to end.
function parseBlocks(src: string): Block[] {
  const out: Block[] = []
  const lines = src.split('\n')
  let inCode = false
  for (const line of lines) {
    const fence = line.trimStart().startsWith('```')
    if (fence) {
      inCode = !inCode
      continue
    }
    if (inCode) {
      // Preserve the raw line (including leading spaces) as a single segment.
      out.push({ cls: 'md-blk md-code', segs: [{ bold: false, text: line }] })
      continue
    }
    const trimmed = line.trim()
    if (trimmed === '') {
      out.push({ cls: 'md-blk md-gap', segs: [] })
      continue
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      out.push({ cls: `md-blk md-h md-h${heading[1].length}`, segs: splitBold(heading[2]) })
      continue
    }
    if (trimmed.startsWith('> ')) {
      out.push({ cls: 'md-blk md-quote', segs: splitBold(trimmed.slice(2)) })
      continue
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      out.push({ cls: 'md-blk md-li', segs: splitBold(trimmed.slice(2)) })
      continue
    }
    out.push({ cls: 'md-blk md-p', segs: splitBold(trimmed) })
  }
  return out
}

const SAMPLE = `# BarefootJS Markdown Editor

Type on the **left**, see it rendered on the **right**.
Everything updates through a single \`text\` signal.

## Features

- Live preview via reactive memos
- Word, character and line counters
- **Bold** inline formatting
- Toolbar shortcuts

> No virtual DOM. Only the nodes that change are touched.

\`\`\`
const [text, setText] = createSignal(SAMPLE)
\`\`\`
`

export function MarkdownEditor() {
  const [text, setText] = createSignal(SAMPLE)

  const blocks = createMemo(() => parseBlocks(text()))
  const charCount = createMemo(() => text().length)
  const wordCount = createMemo(() => {
    const t = text().trim()
    return t === '' ? 0 : t.split(/\s+/).length
  })
  const lineCount = createMemo(() => text().split('\n').length)
  const readMinutes = createMemo(() => Math.max(1, Math.ceil(wordCount() / 200)))

  // Insert text around the current textarea selection. Pure imperative DOM work
  // — it reads/writes the element directly and then syncs the signal.
  const wrapSelection = (before: string, after: string) => {
    const el = document.getElementById('md-input') as HTMLTextAreaElement | null
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const value = el.value
    const selected = value.slice(start, end)
    const next = value.slice(0, start) + before + selected + after + value.slice(end)
    setText(next)
    el.focus()
    const caret = start + before.length + selected.length
    // Restore the caret after the runtime flushes the new value.
    requestAnimationFrame(() => {
      el.selectionStart = caret
      el.selectionEnd = caret
    })
  }

  return (
    <div className="md-editor">
      <div className="md-toolbar">
        <button className="md-btn" onClick={() => wrapSelection('**', '**')}>Bold</button>
        <button className="md-btn" onClick={() => wrapSelection('# ', '')}>H1</button>
        <button className="md-btn" onClick={() => wrapSelection('## ', '')}>H2</button>
        <button className="md-btn" onClick={() => wrapSelection('- ', '')}>List</button>
        <button className="md-btn" onClick={() => wrapSelection('> ', '')}>Quote</button>
        <button className="md-btn" onClick={() => wrapSelection('`', '`')}>Code</button>
        <button className="md-btn md-btn-danger" onClick={() => setText('')}>Clear</button>
      </div>

      <div className="md-panes">
        <textarea
          id="md-input"
          className="md-input"
          spellcheck={false}
          value={text()}
          onInput={(e) => setText(e.target.value)}
          placeholder="Write some Markdown…"
        />

        <div className="md-preview">
          {blocks().map((block, i) => (
            <div className={block.cls} key={i}>
              {block.segs.map((seg, j) =>
                seg.bold ? <strong key={j}>{seg.text}</strong> : <span key={j}>{seg.text}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="md-stats">
        <span className="md-stat"><strong>{wordCount()}</strong> words</span>
        <span className="md-stat"><strong>{charCount()}</strong> characters</span>
        <span className="md-stat"><strong>{lineCount()}</strong> lines</span>
        <span className="md-stat">~<strong>{readMinutes()}</strong> min read</span>
      </div>
    </div>
  )
}

export default MarkdownEditor
