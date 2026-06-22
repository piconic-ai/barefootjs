/**
 * Calendar cross-adapter compile conformance (#1467).
 *
 * The Calendar grid bakes per-day selection state (single + range) onto
 * the `CalendarDay` data so the template reads member fields
 * (`day.isSingleSelected`, `day.buttonClasses`, …) instead of calling
 * user-defined predicates per cell. A server-side template language has
 * no JS runtime and cannot evaluate a `dayIsSingleSelected(day)`
 * predicate at render time, so the predicate-call form raised BF102 on
 * the Go adapter (and was a latent hazard on the Perl adapters). This
 * test pins the fix: the Calendar component, the `date-picker` that
 * composes it, and the shipped Calendar demos must all compile to every
 * shipping adapter — Hono, Go, Mojolicious, and Text::Xslate — with zero
 * error diagnostics.
 *
 * This is a *compile* conformance (diagnostics only), deliberately NOT a
 * frozen-HTML fixture in the `fixtures/` corpus: the grid renders the
 * current month, so byte-exact SSR output is a function of the wall
 * clock and unsuitable for a deterministic snapshot. Runtime selection
 * behavior (the reactive grid rebuild on click) is covered by
 * `site/ui/e2e/calendar.spec.ts`.
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileJSX } from '@barefootjs/jsx'
import { goTemplateAdapter } from '@barefootjs/go-template/adapter'
import { mojoAdapter } from '@barefootjs/mojolicious/adapter'
import { xslateAdapter } from '@barefootjs/xslate/adapter'
import { honoAdapter } from '@barefootjs/hono/adapter'

// `packages/adapter-tests` is ESM ("type": "module"), so `__dirname` is not
// defined — compute the dir from `import.meta.url` (same idiom as
// `no-bun-coupling.test.ts`).
// __tests__ -> src -> adapter-tests -> packages -> repo root
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

const sources: ReadonlyArray<readonly [label: string, relPath: string]> = [
  ['calendar UI', 'ui/components/ui/calendar/index.tsx'],
  ['date-picker UI (composes calendar)', 'ui/components/ui/date-picker/index.tsx'],
  ['calendar-demo', 'site/ui/components/calendar-demo.tsx'],
  ['calendar-usage-demo', 'site/ui/components/calendar-usage-demo.tsx'],
]

const adapters = [
  ['Go', goTemplateAdapter],
  ['Mojo', mojoAdapter],
  ['Xslate', xslateAdapter],
  ['Hono', honoAdapter],
] as const

describe('Calendar cross-adapter compile conformance (#1467)', () => {
  for (const [label, relPath] of sources) {
    const source = readFileSync(resolve(ROOT, relPath), 'utf8').trimStart()
    const filename = relPath.split('/').pop()!
    for (const [adapterName, adapter] of adapters) {
      test(`${label} compiles on ${adapterName} with no error diagnostics`, () => {
        const result = compileJSX(source, filename, { adapter, outputIR: true })
        const errors = (result.errors ?? []).filter((e) => e.severity === 'error')
        expect(errors).toEqual([])
      })
    }
  }
})
