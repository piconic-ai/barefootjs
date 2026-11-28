import { createFixture } from '../src/types'

/**
 * Markup a component receives, bound into an attribute. JSX renders the
 * markup as escaped text in the attribute, quotes included, and as markup
 * in element content. Covered for children read directly in both positions,
 * children held in state and bound plainly, in a template literal, in a
 * conditional attribute, and a JSX-valued prop read in both positions.
 */
export const fixture = createFixture({
  id: 'received-markup-in-attribute',
  description: 'Markup a component receives renders as escaped text in an attribute and as markup in content',
  source: `
import { Direct, Note, Tpl, Cond, Slot } from './note'
export function Host() {
  return (
    <div>
      <Direct><i className="label">hello</i></Direct>
      <Note><i className="label">hello</i></Note>
      <Tpl><i className="label">hello</i></Tpl>
      <Cond><i className="label">hello</i></Cond>
      <Slot header={<i className="label">hello</i>} />
    </div>
  )
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Direct(props: { children?: unknown }) {
  return <p title={props.children}>{props.children}</p>
}
export function Note(props: { children?: unknown }) {
  const [value, setValue] = createSignal(props.children)
  return <b title={value()} onClick={() => setValue('clicked')}>x</b>
}
export function Tpl(props: { children?: unknown }) {
  const [value, setValue] = createSignal(props.children)
  return <u title={\`[\${value()}]\`} onClick={() => setValue('clicked')}>x</u>
}
export function Cond(props: { children?: unknown }) {
  const [value, setValue] = createSignal(props.children)
  return <q title={value() ? value() : undefined} onClick={() => setValue('clicked')}>x</q>
}
export function Slot(props: { header?: unknown }) {
  return <s title={props.header}>{props.header}</s>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf-s="test_s0" title="&lt;i class=&quot;label&quot;&gt;hello&lt;/i&gt;"><i class="label">hello</i></p>
      <b bf-s="test_s1" bf="s0" title="&lt;i class=&quot;label&quot;&gt;hello&lt;/i&gt;">x</b>
      <u bf-s="test_s2" bf="s0" title="[&lt;i class=&quot;label&quot;&gt;hello&lt;/i&gt;]">x</u>
      <q bf-s="test_s3" bf="s0" title="&lt;i class=&quot;label&quot;&gt;hello&lt;/i&gt;">x</q>
      <s bf-s="test_s4" bf="s1" title="&lt;i class=&quot;label&quot;&gt;hello&lt;/i&gt;"><!--bf:s0--><i class="label">hello</i><!--/--></s>
    </div>
  `,
})
