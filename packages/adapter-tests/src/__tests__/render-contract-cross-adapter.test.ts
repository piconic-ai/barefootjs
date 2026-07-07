/**
 * Render-stage cross-adapter conformance (#2158).
 *
 * Every adapter bug found in the 0.17–0.18 review was invisible at the
 * compile layer: the compile matrix read 496/496 clean while every found
 * bug (Ruby's `derive_vars_from_defaults` string-vs-symbol `propName`
 * lookup, #2157, chief among them) only surfaced when a real backend
 * *executed* the template. "compile-clean ≠ renders-correctly."
 *
 * This test renders the shared `renderContractFixture` (a Counter with
 * signal/memo text plus three `<Button>` children-forwarding slots, the
 * exact shape #2157 broke) through each adapter's OWN real render
 * pipeline — Hono's in-process JSX render, the Go template adapter's
 * real `go` binary, Mojolicious's real `perl`/Mojolicious::Lite, and
 * Text::Xslate's real `perl`/Text::Xslate — and asserts
 * `assertRenderContract` on every output. Unlike
 * `carousel-cross-adapter.test.ts` (byte-identical HTML comparison
 * against a Hono reference), this contract doesn't require the outputs
 * to match each other: SSR whitespace / marker shape legitimately
 * differs per adapter. It only requires each adapter's own render to
 * satisfy the same five render-stage invariants.
 *
 * Mirrors `carousel-cross-adapter.test.ts`'s adapter-availability
 * handling: Go must run (go1.24+ is installed in CI/sandbox), Mojo/Xslate
 * skip gracefully via their `*NotAvailableError` when the Perl runtime
 * modules aren't installed.
 */
import { describe, test, expect } from 'bun:test'
import type { TemplateAdapter } from '@barefootjs/jsx'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import { honoAdapter } from '@barefootjs/hono/adapter'
import {
  renderGoTemplateComponent,
  GoNotAvailableError,
} from '@barefootjs/go-template/test-render'
import { goTemplateAdapter } from '@barefootjs/go-template/adapter'
import {
  renderMojoComponent,
  PerlNotAvailableError,
} from '@barefootjs/mojolicious/test-render'
import { mojoAdapter } from '@barefootjs/mojolicious/adapter'
import {
  renderXslateComponent,
  XslateNotAvailableError,
} from '@barefootjs/xslate/test-render'
import { xslateAdapter } from '@barefootjs/xslate/adapter'
import { assertRenderContract, renderContractFixture } from '../render.contract'

interface AdapterCase {
  name: string
  adapter: TemplateAdapter
  render: (opts: {
    source: string
    adapter: TemplateAdapter
    props: Record<string, unknown>
    components?: Record<string, string>
    componentName: string
  }) => Promise<string>
  /** Error thrown when this adapter's runtime is absent (→ skip, not fail).
   *  `any[]` (not `never[]`) so the concrete `(message: string)` ctors of the
   *  *NotAvailableError classes assign cleanly; only used for `instanceof`. */
  notAvailable: new (...args: any[]) => Error
}

const adapterCases: AdapterCase[] = [
  { name: 'Hono', adapter: honoAdapter, render: renderHonoComponent, notAvailable: class Never extends Error {} },
  { name: 'Go', adapter: goTemplateAdapter, render: renderGoTemplateComponent, notAvailable: GoNotAvailableError },
  { name: 'Mojo', adapter: mojoAdapter, render: renderMojoComponent, notAvailable: PerlNotAvailableError },
  { name: 'Xslate', adapter: xslateAdapter, render: renderXslateComponent, notAvailable: XslateNotAvailableError },
]

describe('Render-stage cross-adapter conformance contract (#2158)', () => {
  for (const { name, adapter, render, notAvailable } of adapterCases) {
    test(`${name} satisfies the render contract for Counter+Button`, async () => {
      let html: string
      try {
        html = await render({ adapter, ...renderContractFixture })
      } catch (err) {
        // Runtime not installed (this sandbox lacks the Perl modules for
        // Mojo/Xslate): skip, same policy as carousel-cross-adapter and the
        // adapter-conformance renderer.
        if (err instanceof notAvailable) return
        throw err
      }
      expect(html).toBeTruthy()
      assertRenderContract(html)
    }, 30_000)
  }
})
