/**
 * Render-stage conformance contract (#2158) — Hono reference leg.
 *
 * Every adapter bug found in the 0.17–0.18 review was invisible at the
 * compile layer: the compile matrix read 496/496 clean while every found
 * bug (Ruby's `derive_vars_from_defaults` string-vs-symbol `propName`
 * lookup, #2157, chief among them) only surfaced when a real backend
 * *executed* the template. "compile-clean ≠ renders-correctly."
 *
 * `assertRenderContract` (`../render.contract.ts`) is the fixed set of
 * assertions every adapter runs against its own real render pipeline.
 * Go, Mojolicious, Text::Xslate, ERB, Jinja, minijinja (Rust), Twig, and
 * Blade all run it through `runAdapterConformanceTests`'s render-contract
 * suite in their own package (and own CI workflow) — see
 * `../run-adapter-conformance.ts`. Hono has no `runAdapterConformanceTests`
 * call site of its own (it's the in-process reference adapter every other
 * adapter's HTML conformance is diffed against), so this file is its one
 * dedicated leg, run in this package's own suite instead.
 *
 * Renders the shared `counter-buttons` corpus fixture
 * (`../../fixtures/counter-buttons.ts`) through Hono's real in-process
 * render and asserts the same five checks. Also keeps unit coverage for
 * `decodeHtmlEntities`, the small HTML-entity normalizer the contract
 * uses to treat legitimate per-backend encoding divergences (e.g. Go's
 * `&#43;` for `+`) as equivalent.
 */
import { describe, test, expect } from 'bun:test'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import { honoAdapter } from '@barefootjs/hono/adapter'
import { assertRenderContract, decodeHtmlEntities } from '../render.contract'
import { fixture as counterButtons } from '../../fixtures/counter-buttons'

describe('Render-stage conformance contract (#2158)', () => {
  test('Hono satisfies the render contract for Counter+Button', async () => {
    const html = await renderHonoComponent({
      source: counterButtons.source,
      adapter: honoAdapter,
      components: counterButtons.components,
      componentName: counterButtons.componentName,
    })
    expect(html).toBeTruthy()
    assertRenderContract(html)
  }, 30_000)
})

describe('decodeHtmlEntities', () => {
  test('decodes numeric decimal and hex references', () => {
    expect(decodeHtmlEntities('&#43;')).toBe('+')
    expect(decodeHtmlEntities('&#x2B;')).toBe('+')
  })

  test('decodes named entities', () => {
    expect(decodeHtmlEntities('&lt;div&gt; &amp; &quot;x&quot; &#39;y&#39;')).toBe(`<div> & "x" 'y'`)
  })

  test('decodes &amp; last so an already-decoded &amp;lt; is not re-decoded into <', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;')
  })

  test('leaves an out-of-range numeric reference unchanged instead of throwing', () => {
    // Above Unicode's max codepoint (0x10FFFF) — String.fromCodePoint
    // throws RangeError on this input.
    expect(() => decodeHtmlEntities('&#9999999999;')).not.toThrow()
    expect(decodeHtmlEntities('&#9999999999;')).toBe('&#9999999999;')
  })

  test('leaves a lone UTF-16 surrogate numeric reference unchanged instead of throwing', () => {
    // 0xD800 is only valid as half of a UTF-16 surrogate pair, never a
    // standalone codepoint — String.fromCodePoint throws RangeError.
    expect(() => decodeHtmlEntities('&#xD800;')).not.toThrow()
    expect(decodeHtmlEntities('&#xD800;')).toBe('&#xD800;')
  })
})
