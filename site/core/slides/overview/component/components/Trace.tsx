'use client'
import { createSignal, createEffect, onMount, onCleanup } from '@barefootjs/client'

// "Only what changed, changes." — a counter next to the DOM the compiler emitted for it.
// On every click the runtime writes exactly one text node; the inspector lights that node up.
// The counter clicks itself every couple of seconds until someone clicks it, so the one
// lit node is seen without anyone having to touch the slide.
export function Trace() {
  const [count, setCount] = createSignal(0)
  const [writes, setWrites] = createSignal(0)
  const [auto, setAuto] = createSignal(true)
  const bump = () => { setCount(count() + 1); setWrites(writes() + 1) }
  const click = () => { setAuto(false); bump() }

  onMount(() => {
    const id = setInterval(() => { if (auto()) bump() }, 2400)
    onCleanup(() => clearInterval(id))
  })

  const mountNode = (el: HTMLElement) => {
    let first = true
    createEffect(() => {
      count()
      if (first) { first = false; return }
      el.animate(
        [{ background: 'rgba(63,164,91,.55)', boxShadow: '0 0 0 6px rgba(63,164,91,.25)' }, { background: 'rgba(63,164,91,0)', boxShadow: '0 0 0 0 rgba(63,164,91,0)' }],
        { duration: 700, easing: 'ease-out' }
      )
    })
  }

  // `peitho present` mounts every slide's component once, up front, and
  // keeps it alive across navigation (a video background elsewhere in
  // this deck shouldn't restart every time a viewer flips back to check
  // something). Without this, the auto-demo above starts ticking — and
  // `count`/`writes` keeps climbing — from the moment the whole
  // presentation loads, not from when this slide is actually shown, and
  // a manual click on an earlier visit (which turns `auto` off) stays off
  // for the rest of the presentation. `peitho:slidechange` (dispatched on
  // `window` by present's shell every time the visible slide changes) is
  // how this restarts fresh each time a viewer arrives at this slide
  // specifically. `getRootNode()` finds this element's own shadow root —
  // `document.currentScript` doesn't work inside one, confirmed on-device.
  const mountRoot = (el: HTMLElement) => {
    const root = el.getRootNode()
    const slideKey = root instanceof ShadowRoot ? (root.host as HTMLElement).dataset.slideKey : undefined
    if (slideKey === undefined) return
    const onSlideChange = (event: Event): void => {
      if ((event as CustomEvent<{ key?: string }>).detail?.key === slideKey) {
        setCount(0)
        setWrites(0)
        setAuto(true)
      }
    }
    window.addEventListener('peitho:slidechange', onSlideChange)
    onCleanup(() => window.removeEventListener('peitho:slidechange', onSlideChange))
  }

  return (
    <div className="trace" ref={mountRoot}>
      <div className="trace-app">
        <p className="trace-value">{count()}</p>
        <button className="counter-btn" onClick={click}>+1</button>
      </div>
      <div className="trace-dom">
        <div className="trace-dom-head">
          <span>DOM</span>
          <span className="trace-writes">{writes()} writes · 1 node each</span>
        </div>
        <pre className="trace-tree"><span className="tk-tag">&lt;div</span>{' '}<span className="tk-bf">bf-s="Counter_0"</span><span className="tk-tag">&gt;</span>{'\n  '}<span className="tk-tag">&lt;p</span>{' '}<span className="tk-bf">bf="s1"</span><span className="tk-tag">&gt;</span><span className="tk-dim">&lt;!--bf:s0--&gt;</span><span className="trace-node" ref={mountNode}>{count()}</span><span className="tk-dim">&lt;!--/--&gt;</span><span className="tk-tag">&lt;/p&gt;</span>{'\n  '}<span className="tk-tag">&lt;button</span>{' '}<span className="tk-bf">bf="s2"</span><span className="tk-tag">&gt;</span>+1<span className="tk-tag">&lt;/button&gt;</span>{'\n'}<span className="tk-tag">&lt;/div&gt;</span></pre>
      </div>
    </div>
  )
}
