import { createFixture } from '../src/types'

// #2126 follow-up: `props.X` reads on an UNTYPED props object reach the
// SSR template as bare scalars through carriers `augmentInheritedPropAccesses`
// historically didn't scan — dynamic text children, conditional conditions,
// and loop array expressions. With no type to populate `propsParams`, a
// missed read meant the emitted template referenced a variable the props
// type / ssrDefaults never declared: a strict-mode 500 on the Perl-family
// adapters, a missing struct field on Go. Rendered with NO props so every
// adapter must produce Hono's zero-props output (empty label, false
// condition, empty list, seeded signal default) purely from the compiler's
// own seeding — nothing is supplied at the call site.
//
// The label read carries a `?? ''` fallback: the strict-var coverage is
// identical (the template still references the bare `$label` scalar —
// existence, not value, is what strict mode checks), but a BARE
// `{props.label}` diverges on the CSR runtime, which stringifies the raw
// `undefined` into literal "undefined" text where Hono renders ''. That
// divergence is a separate client-runtime semantic, not this fixture's
// subject.
export const fixture = createFixture({
  id: 'untyped-props-reads',
  description:
    'Untyped props object read via text expression, condition, and loop array — rendered with no props',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function UntypedReads(props) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  return (
    <div>
      <p>{props.label ?? ''}</p>
      {props.show && <span>visible</span>}
      <ul>{(props.items ?? []).map((it) => <li key={it}>{it}</li>)}</ul>
      <button onClick={() => setCount(count() + 1)}>count: {count()}</button>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s7">
      <p bf="s1"><!--bf:s0--><!--/--></p>
      <!--bf-cond-start:s2-->
      <!--bf-cond-end:s2-->
      <ul bf="s4"></ul>
      <button bf="s6">count: <!--bf:s5-->0<!--/--></button>
    </div>
  `,
})
