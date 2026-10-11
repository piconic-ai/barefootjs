import { createFixture } from '../src/types'

/**
 * A markup-valued prop rendered inside content an adapter captures before
 * printing it elsewhere is escaped exactly as it is in place (#3432):
 * children forwarded to a child component (text and attribute), and a
 * top-level `ref`-callback portal element's attribute and text.
 */
export const fixture = createFixture({
  id: 'captured-markup-escaping',
  description: 'A markup-valued prop is escaped inside forwarded children and a portaled element',
  source: `
'use client'
import { createPortal } from '@barefootjs/client'

function Frame(props: { children?: unknown }) {
  return <section className="frame">{props.children}</section>
}

export function CapturedMarkupEscaping(props: { label: string }) {
  const mount = (el: HTMLElement) => {
    if (el.parentNode !== document.body) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }
  return (
    <div>
      <Frame><b title={props.label}>{props.label}</b></Frame>
      <p className="portaled" title={props.label} ref={mount}>{props.label}</p>
    </div>
  )
}
`,
  props: { label: '<i>&"\'</i>' },
  expectedHtml: `
    <div bf-s="test"><section bf-s="test_s2" class="frame"><b bf="^s1" title="&lt;i&gt;&amp;&quot;&#39;&lt;/i&gt;"><!--bf:^s0-->&lt;i&gt;&amp;&quot;&#39;&lt;/i&gt;<!--/--></b></section></div>
    <p bf-po="test" bf="s4" class="portaled" title="&lt;i&gt;&amp;&quot;&#39;&lt;/i&gt;"><!--bf:s3-->&lt;i&gt;&amp;&quot;&#39;&lt;/i&gt;<!--/--></p>
  `,
})
