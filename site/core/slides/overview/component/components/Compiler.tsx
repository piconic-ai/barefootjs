'use client'
import { createSignal, createMemo, onMount, onCleanup } from '@barefootjs/client'
import { OUTPUTS } from './outputs'

// One Counter.tsx, compiled by every adapter. The outputs are real compiler output
// (captured from the BarefootJS test-techniques talk, ToKyoto.js #3).
type Token = { i: number; text: string; cls: string }

const TEMPLATE = /(bf[-\w]*=(?:"[^"]*"|'[^']*'|\{[^}]*\})|\{\{[^}]*\}\}|\{%[^%]*%\}|<%-?[\s\S]*?-?%>|\{\{\/?bf\w*|bf\.\w+\([^)]*\)|bf\w+\([^)]*\)|@bf\w*|\$\w+->bf\w+)/

function tokenize(code: string): Token[] {
  const parts = code.split(TEMPLATE)
  const out: Token[] = []
  parts.forEach((text, i) => {
    if (!text) return
    out.push({ i, text, cls: i % 2 === 1 ? 'tk-bf' : 'tk' })
  })
  return out
}

export function Compiler(props: { auto?: boolean }) {
  const [idx, setIdx] = createSignal(0)
  const [auto, setAuto] = createSignal(props.auto ?? true)
  const current = createMemo(() => OUTPUTS[idx()])
  const tokens = createMemo(() => tokenize(current().code))

  onMount(() => {
    const id = setInterval(() => { if (auto()) setIdx((idx() + 1) % OUTPUTS.length) }, 2600)
    onCleanup(() => clearInterval(id))
  })

  const pick = (n: number) => { setAuto(false); setIdx(n) }

  // `peitho present` mounts every slide's component once, up front, and
  // keeps it alive across navigation — see Trace.tsx's own note on why.
  // Without this, the tab-cycling auto-demo above starts advancing from
  // the moment the whole presentation loads, not from when this slide is
  // actually shown, and a manual tab click on an earlier visit (which
  // turns `auto` off) stays off for the rest of the presentation.
  // `peitho:slidechange` is how this restarts fresh each time a viewer
  // arrives at this slide specifically.
  const mountRoot = (el: HTMLElement) => {
    const root = el.getRootNode()
    const slideKey = root instanceof ShadowRoot ? (root.host as HTMLElement).dataset.slideKey : undefined
    if (slideKey === undefined) return
    const onSlideChange = (event: Event): void => {
      if ((event as CustomEvent<{ key?: string }>).detail?.key === slideKey) {
        setIdx(0)
        setAuto(props.auto ?? true)
      }
    }
    window.addEventListener('peitho:slidechange', onSlideChange)
    onCleanup(() => window.removeEventListener('peitho:slidechange', onSlideChange))
  }

  return (
    <div className="compiler" ref={mountRoot}>
      <div className="compiler-tabs" role="tablist">
        {OUTPUTS.map((o, n) => (
          <button
            key={o.id}
            role="tab"
            className={n === idx() ? 'compiler-tab on' : 'compiler-tab'}
            onClick={() => pick(n)}
          >{o.lang}</button>
        ))}
      </div>
      <div className="compiler-out">
        <div className="compiler-meta">
          <span className="compiler-engine">{current().engine}</span>
          <span className="compiler-file">Counter.{current().fence}</span>
        </div>
        <pre className="compiler-code">{tokens().map(t => (
          <span key={t.i} className={t.cls}>{t.text}</span>
        ))}</pre>
      </div>
    </div>
  )
}
