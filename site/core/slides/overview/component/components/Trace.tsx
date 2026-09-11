'use client'
import { createSignal, createEffect } from '@barefootjs/client'

// "Only what changed, changes." — a counter next to the DOM the compiler emitted for it.
// On every click the runtime writes exactly one text node; the inspector lights that node up.
export function Trace() {
  const [count, setCount] = createSignal(0)
  const [writes, setWrites] = createSignal(0)
  const bump = () => { setCount(count() + 1); setWrites(writes() + 1) }

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

  return (
    <div className="trace">
      <div className="trace-app">
        <p className="trace-value">{count()}</p>
        <button className="counter-btn" onClick={bump}>+1</button>
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
