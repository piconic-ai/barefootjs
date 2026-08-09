'use client'
import { Editable } from './Editable'

// Mirrors piconic-ai/koma's FrameEditor: a highlight layer painted behind a
// textarea, both captured by `ref`, kept scrolled in lockstep.
export function ScrollSync() {
  let textareaEl: HTMLTextAreaElement | null = null
  let highlightEl: HTMLElement | null = null
  let renderSeq = 0

  const syncScroll = () => {
    if (highlightEl && textareaEl) {
      highlightEl.scrollTop = textareaEl.scrollTop
      renderSeq++
    }
  }

  // Reachable: passed to a CHILD component, whose props survive verbatim.
  const handleTextareaRef = (el: HTMLTextAreaElement) => {
    textareaEl = el
    el.addEventListener('scroll', syncScroll)
  }

  // The only writer of `highlightEl` — reachable ONLY through the `ref` on an
  // INTRINSIC element below, which the SSR renderer strips.
  const handleHighlightRef = (el: HTMLElement) => {
    highlightEl = el
  }

  return (
    <div>
      <pre ref={handleHighlightRef} />
      <Editable ref={handleTextareaRef} />
    </div>
  )
}
