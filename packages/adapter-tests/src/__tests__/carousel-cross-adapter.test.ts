/**
 * Carousel cross-adapter SSR render conformance (#1971).
 *
 * Unlike `calendar-cross-adapter` (compile-diagnostics only — the calendar
 * grid is wall-clock dependent), the carousel demos render a fully static
 * SSR template, so this asserts the stronger property: every server adapter
 * (Go, Mojo, Xslate) produces byte-identical normalized HTML to the Hono
 * reference for all three carousel demos.
 *
 * This pins the #1971 SSR-parity fixes, each of which previously diverged
 * silently (compiled clean / rendered wrong, or refused with BF101):
 *   - string-ternary memos (`directionClasses` / `positionClasses` /
 *     `paddingClass`) — Go mistyped them `bool`;
 *   - the optional `opts` object prop — Go always-truthy struct, and an
 *     inline `opts={{ … }}` was dropped (Go) or refused with BF101
 *     (Mojo/Xslate);
 *   - the inline `[1,2,3,4,5].map(...)` scalar-item loop — Go rendered zero
 *     items;
 *   - the carousel context value's client-only function members — Mojo
 *     emitted undeclared `$scrollPrev` vars.
 *
 * Each adapter skips gracefully when its runtime isn't installed (Go 1.25+,
 * or perl with Mojolicious / Text::Xslate), matching the adapter-conformance
 * suite's policy.
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { normalizeHTML } from '../jsx-runner'
import { resolveSiblingComponents } from '../../fixtures/_helpers'
import { spec as carouselSpec } from '../../fixtures/carousel'

// __tests__ -> src -> adapter-tests -> packages -> repo root
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const source = readFileSync(
  resolve(ROOT, 'site/ui/components/carousel-demo.tsx'),
  'utf8',
).trimStart()
// Sibling sources (carousel primitive + icon), keyed by import specifier —
// the same set the carousel hydrate fixture resolves.
const components = resolveSiblingComponents(carouselSpec)

const demos = [
  'CarouselPreviewDemo',
  'CarouselSizesDemo',
  'CarouselOrientationDemo',
] as const

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
  { name: 'Go', adapter: goTemplateAdapter, render: renderGoTemplateComponent, notAvailable: GoNotAvailableError },
  { name: 'Mojo', adapter: mojoAdapter, render: renderMojoComponent, notAvailable: PerlNotAvailableError },
  { name: 'Xslate', adapter: xslateAdapter, render: renderXslateComponent, notAvailable: XslateNotAvailableError },
]

describe('Carousel cross-adapter SSR render conformance (#1971)', () => {
  for (const componentName of demos) {
    for (const { name, adapter, render, notAvailable } of adapterCases) {
      test(`${componentName} renders byte-identical on ${name} and Hono`, async () => {
        const common = {
          source,
          props: { __instanceId: `${componentName}_test` },
          components,
          componentName,
        }
        const hono = normalizeHTML(
          await renderHonoComponent({ adapter: honoAdapter, ...common }),
        )
        let out: string
        try {
          out = normalizeHTML(await render({ adapter, ...common }))
        } catch (err) {
          // Runtime not installed (CI image without Go 1.25+ / perl modules):
          // skip, same as the adapter-conformance renderer's policy.
          if (err instanceof notAvailable) return
          throw err
        }
        expect(out).toBe(hono)
      }, 30_000)
    }
  }
})
