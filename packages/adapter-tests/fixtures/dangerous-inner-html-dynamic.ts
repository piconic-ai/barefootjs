import { createFixture } from '../src/types'

/**
 * `dangerouslySetInnerHTML` with a DYNAMIC (prop-derived) `__html` value —
 * the sibling of `dangerous-inner-html`, which covers the static-literal
 * case that #2207 lowers. A dynamic value still refuses with `BF101` on
 * every template adapter: embedding a non-compile-time-known string
 * directly into a template language's raw/unescaped-output sink at SSR
 * time is a first-class injection vector unless that runtime also
 * sanitizes the value first, which none of these 8 template runtimes do
 * by default. Hono/CSR render it correctly regardless (the client already
 * supports a fully dynamic, even signal-reactive, `__html` — see
 * `packages/jsx/src/__tests__/dangerously-set-inner-html.test.ts` and
 * `compiler-stress-1244.test.ts`), so this is purely a template-adapter
 * gap. Tracked as a deliberate follow-up, not a bug: #2319 (successor to #2215).
 */
export const fixture = createFixture({
  id: 'dangerous-inner-html-dynamic',
  description: 'dangerouslySetInnerHTML with a prop-derived value renders on Hono/CSR, refuses on template adapters',
  source: `
function DangerousInnerHtmlDynamic({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
export { DangerousInnerHtmlDynamic }
`,
  props: { html: '<b>bold</b> &amp; safe' },
  // A dynamic (non-literal) `__html` is slot-tracked for hydration (`bf="s0"`)
  // unlike the static-literal fixture — the client needs an addressable slot
  // to re-run `el.innerHTML = ...` if `html` changes, even though this fixture
  // itself is a plain prop (not a signal) and never actually re-renders.
  expectedHtml: `
    <div bf-s="test" bf="s0"><b>bold</b> &amp; safe</div>
  `,
})
