'use client'
import { createSignal, onMount, onCleanup } from '@barefootjs/client'

// Real output of the bf CLI, captured against the Counter on this deck's "Write" slide.
type Scene = { cmd: string; lines: string[] }
const SCENES: Scene[] = [
  {
    "cmd": "bf debug graph counter",
    "lines": [
      "Counter (./counter.tsx)",
      "  signals:",
      "    count (initial: props.initial ?? 0)",
      "  dom bindings:",
      "      count -> <p>{count()}</p> at counter.tsx:8",
      "      <button onClick={...}> -> setCount, count at counter.tsx:9",
      "  dependency graph:",
      "    count -> dom:text \"s0\"",
      "    count -> dom:click handler \"s2\""
    ]
  },
  {
    "cmd": "bf debug trace counter count",
    "lines": [
      "count (signal)",
      "  -> text \"s0\"",
      "  -> click handler \"s2\""
    ]
  },
  {
    "cmd": "bf debug events counter",
    "lines": [
      "Counter — 1 event handler(s)",
      "",
      "  +1 button",
      "    onClick -> setCount",
      "    updates: count -> text \"s0\", click handler \"s2\"",
      "    at counter.tsx:9"
    ]
  },
  {
    "cmd": "bf debug summary counter",
    "lines": [
      "Counter",
      "  hydrated: yes",
      "  client bundle: counter.client.js",
      "  signals: 1",
      "  memos: 0",
      "  loops: 0",
      "  event handlers: 1",
      "  dynamic text bindings: 1",
      "  dynamic attributes: 0"
    ]
  }
]

export function Terminal() {
  const [scene, setScene] = createSignal(0)
  const [typed, setTyped] = createSignal('')
  const [shown, setShown] = createSignal(0)
  const [done, setDone] = createSignal(false)

  const current = () => SCENES[scene()]
  const visible = () => current().lines.slice(0, shown()).map((text, i) => ({ i, text }))

  onMount(() => {
    let timer: number | null = null
    const at = (ms: number, fn: () => void) => { timer = window.setTimeout(fn, ms) }
    const run = () => {
      const s = current()
      setTyped(''); setShown(0); setDone(false)
      let k = 0
      const type = () => {
        if (k <= s.cmd.length) { setTyped(s.cmd.slice(0, k)); k++; at(28 + Math.random() * 40, type); return }
        at(260, print)
      }
      let n = 0
      const print = () => {
        if (n < s.lines.length) { n++; setShown(n); at(55, print); return }
        setDone(true)
        at(3200, () => { setScene((scene() + 1) % SCENES.length); run() })
      }
      at(400, type)
    }
    run()
    onCleanup(() => { if (timer) clearTimeout(timer) })
  })

  return (
    <div className="term">
      <div className="term-bar"><span></span><span></span><span></span></div>
      <pre className="term-body"><span className="term-prompt">$ </span><span className="term-cmd">{typed()}</span><span className={done() ? 'term-cursor off' : 'term-cursor'}>▍</span>{'\n'}{visible().map(l => (
  <span key={l.i} className="term-line">{l.text}{'\n'}</span>
))}</pre>
    </div>
  )
}
