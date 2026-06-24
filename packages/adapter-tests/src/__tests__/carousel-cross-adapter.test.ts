/**
 * Carousel cross-adapter SSR render conformance (#1971).
 *
 * Unlike `calendar-cross-adapter` (compile-diagnostics only — the calendar
 * grid is wall-clock dependent), the carousel demos render a fully static
 * SSR template, so this asserts the stronger property: the Go adapter
 * produces byte-identical normalized HTML to the Hono reference for every
 * carousel demo.
 *
 * This pins the #1971 Go fixes, each of which previously diverged silently
 * (compiled clean, rendered wrong):
 *   - the `directionClasses` / `positionClasses` / `paddingClass` string
 *     ternary memos (were mistyped `bool` → `class="false"`);
 *   - the optional `opts` object prop (a value struct was always truthy, so
 *     `data-opts` was never omitted; and an inline `opts={{…}}` was dropped);
 *   - the inline `[1,2,3,4,5].map(...)` scalar-item loop (rendered zero
 *     items because the loop's scalar datum was never plumbed into the Go
 *     wrapper / body / constructor).
 *
 * Mojo/Xslate are intentionally NOT covered yet: the demo's
 * `opts={{ align: 'start' }}` inline object prop raises BF101 there, and the
 * scalar-literal loop has the same unmaterialised-SSR gap as Go did. Those
 * are tracked separately ("Go first", per the issue).
 *
 * Skips gracefully when no Go 1.25+ toolchain is available (the renderer
 * shells out to `go run`), matching the adapter-conformance suite's policy.
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import { honoAdapter } from '@barefootjs/hono/adapter'
import {
  renderGoTemplateComponent,
  GoNotAvailableError,
} from '@barefootjs/go-template/test-render'
import { goTemplateAdapter } from '@barefootjs/go-template/adapter'
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

describe('Carousel cross-adapter SSR render conformance (#1971)', () => {
  for (const componentName of demos) {
    test(`${componentName} renders byte-identical on Go and Hono`, async () => {
      const common = {
        source,
        props: { __instanceId: `${componentName}_test` },
        components,
        componentName,
      }
      const hono = normalizeHTML(
        await renderHonoComponent({ adapter: honoAdapter, ...common }),
      )
      let go: string
      try {
        go = normalizeHTML(
          await renderGoTemplateComponent({ adapter: goTemplateAdapter, ...common }),
        )
      } catch (err) {
        // No Go toolchain (CI image without Go 1.25+): skip, same as the
        // adapter-conformance renderer's `onRenderError` policy.
        if (err instanceof GoNotAvailableError) return
        throw err
      }
      expect(go).toBe(hono)
    }, 30_000)
  }
})
