/**
 * Hydration-payload conformance for the fixtures whose `bf-p` carries
 * every prop the caller passed (#3845).
 *
 * `normalizeHTML` strips `bf-p` before any HTML comparison, so a key the
 * client reads but the payload leaves out is invisible to the JSX suite.
 * The general fix is a decode-and-compare oracle over every fixture
 * (`hydration-props-conformance.ts`, still an inventory tool). Until that
 * is wired in, this suite pins the payload for a short list of fixtures
 * whose client code reads every prop the caller passes, so the root
 * component's decoded `bf-p` must equal the fixture's `props` (less the
 * `__` plumbing keys): keys reached
 * only through a `{...rest}` / `{...props}` spread, and props read only in
 * a `.filter()` predicate.
 *
 * Every adapter runs it through `runAdapterConformanceTests`, and the test
 * names carry the fixture id, so `fixtures:smoke <id>` selects them.
 */

import { describe, expect } from 'bun:test'
import type { TemplateAdapter } from '@barefootjs/jsx'
import { jsxFixtures } from '../fixtures'
import { extractBfPOccurrences } from './hydration-props-conformance'
import type { RenderOptions } from './jsx-runner'
import { canSkipRenderError } from './render-error-policy'
import { renderTest } from './render-test'

/**
 * Fixtures whose client code reads every prop the caller passes, so the
 * root `bf-p` equals the fixture's `props` exactly.
 */
export const FULL_HYDRATION_PAYLOAD_FIXTURES: ReadonlySet<string> = new Set([
  'rest-spread-root-hydration-props',
  'props-object-spread-child-hydration-props',
  'rest-spread-child-override-hydration-props',
  'filter-predicate-on-prefixed-prop',
  'filter-predicate-renamed-destructured-prop',
  'filter-predicate-block-shadowed-prop',
])

export interface RunHydrationPayloadConformanceOptions {
  factory: () => TemplateAdapter
  render: (opts: RenderOptions) => Promise<string>
  onRenderError?: (err: Error, fixtureId: string) => boolean
  /** Fixtures this adapter skips or refuses in the JSX suite. */
  skipFixtures: ReadonlySet<string>
}

export function runHydrationPayloadConformance(opts: RunHydrationPayloadConformanceOptions): void {
  describe('hydration payload conformance (#3845)', () => {
    for (const fixture of jsxFixtures) {
      if (!FULL_HYDRATION_PAYLOAD_FIXTURES.has(fixture.id) || opts.skipFixtures.has(fixture.id)) continue
      renderTest(`[${fixture.id}] bf-p carries every prop the client reads`, async () => {
        let html: string
        try {
          html = await opts.render({
            source: fixture.source,
            adapter: opts.factory(),
            props: fixture.props !== undefined ? structuredClone(fixture.props) : undefined,
            components: fixture.components,
            componentModules: fixture.componentModules,
            componentName: fixture.componentName,
          })
        } catch (err) {
          if (canSkipRenderError(err, fixture.id, opts.onRenderError)) return
          throw err
        }
        const [root] = extractBfPOccurrences(html)
        expect(root?.parseError).toBeUndefined()
        expect(root?.value).toEqual(callerProps(fixture.props))
      })
    }
  })
}

/**
 * The fixture's props without the `__`-prefixed plumbing keys (a shared
 * fixture's `__instanceId`), which the renderer never serializes.
 */
function callerProps(props: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (props === undefined) return undefined
  return Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith('__')))
}
