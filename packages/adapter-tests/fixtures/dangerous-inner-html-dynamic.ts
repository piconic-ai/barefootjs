import { createFixture } from '../src/types'

/**
 * `dangerouslySetInnerHTML` with a DYNAMIC (prop-derived) `__html` value —
 * the sibling of `dangerous-inner-html`, which covers the static-literal
 * case that #2207 lowers. #2319 graduates this case on every template
 * adapter: the `__html` expression is serialized by the adapter and emitted
 * through that language's raw-output sink at request time (Blade `{!! !!}`,
 * ERB unescaped `<%= %>`, Go `template.HTML` via `bf_raw_html`, Jinja/
 * MiniJinja `| safe`, Twig `| raw`, Mojolicious `<%== %>`, Xslate
 * `mark_raw`). The runtime evaluates the value — it is never spliced into
 * template source — so no template-metacharacter guard applies, matching
 * React's "dangerously = the caller owns the value's safety" contract and
 * the Hono/CSR path (which already drives a signal-reactive
 * `el.innerHTML = …` — see
 * `packages/jsx/src/__tests__/dangerously-set-inner-html.test.ts` and
 * `compiler-stress-1244.test.ts`). All adapters render to Hono parity.
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
