import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `static-array-from-props-with-component`
 * (#2321). Same refusal site as `static-array-from-props-client`'s
 * base — `entries` is a function-scope computed local no DSL adapter
 * can bind as a template variable — but this base ALSO involves a
 * sibling-imported child component (`Tag` from `./tag`), which the
 * other base fixture does not. That's a genuinely different shape (a
 * `childComponent` loop body, not a plain element body), so this
 * fixture gets its own dedicated twin rather than riding
 * `static-array-from-props-client`'s: sharing was checked, not assumed
 * — see #2321's escape-twin work — and the childComponent shape needed
 * its own `compileForCompat` + CSR proof before it could count as
 * "verified".
 *
 * Byte-for-byte copy of the base plus the one `/* @client *​/`
 * insertion, for the same reason `static-array-from-props-client` is:
 * the whole loop (the `entries` computation included) is deferred into
 * `init`, so the compiled CSR template function never touches
 * `props.tags` — verified by INSPECTING the emitted client JS: the
 * template's loop array is substituted with an empty literal
 * (`${[].map(([id, t]) => ...)}`) and the string `tags` never appears in
 * the `template:` line, only inside `init`. Not verified by comparing
 * renders with and without props: `renderCsrComponent` swallows init
 * exceptions (`try { init(...) } catch {}`, `src/csr-render.ts`), so
 * identical markup would not distinguish "init never read the prop" from
 * "init threw and was ignored". No
 * `map-array-builder-body-client`-style divergence was needed.
 *
 * SSR renders the `<ul>` EMPTY on every backend (Hono included —
 * `isClientOnly` short-circuits the same way a signal-gated
 * `/* @client *​/` would; the `Tag` child never even gets compiled into
 * this template's HTML). This does **not** fix #2321: the compiler
 * still cannot lower a props-derived computed const into a DSL template
 * at SSR time — the loop (and its child-component body) is simply
 * deferred to the browser instead. #2321 stays open as an SSR
 * capability gap; what this fixture proves is that the refusal has a
 * working client-directive escape, not that the gap is closed.
 */
export const fixture = createFixture({
  id: 'static-array-from-props-with-component-client',
  description: '/* @client */ twin of static-array-from-props-with-component — DSL BF101 (computed-const loop array) suppressed (#2321)',
  source: `
'use client'
import { Tag } from './tag'

type Props = {
  tags: Record<string, { variant: 'on' | 'off' }>
}

export function TagList(props: Props) {
  const entries = Object.entries(props.tags).filter(([, t]) => t.variant === 'on')
  return (
    <ul>
      {/* @client */ entries.map(([id, t]) => (
        <Tag key={id} id={id} variant={t.variant} />
      ))}
    </ul>
  )
}
`,
  components: {
    './tag.tsx': `
'use client'
export function Tag(props: { id: string; variant: 'on' | 'off' }) {
  return <span class={'tag-' + props.variant}>{props.id}</span>
}
`,
  },
  props: {
    tags: { a: { variant: 'on' }, b: { variant: 'off' }, c: { variant: 'on' } },
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})
