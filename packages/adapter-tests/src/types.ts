/**
 * Adapter Conformance Test Suite — Type Definitions
 */

/**
 * A single compile-time diagnostic the fixture is expected to emit.
 *
 * Used in `JSXFixture.expectedDiagnostics` per adapter to assert the
 * compiler is loud about an unsupported pattern, rather than silently
 * emitting broken template output that only fails at request time.
 */
export interface ExpectedDiagnostic {
  /** Error code (e.g. `'BF101'`, `'BF103'`). */
  code: string
  /** Severity to match against `CompilerError.severity`. */
  severity: 'error' | 'warning'
}

/**
 * A single scripted interaction step the fixture-hydrate runner executes
 * against the live page after hydration.
 *
 * - `click` — dispatch a click on the first match of `selector`
 * - `expectText` — assert the first match of `selector` matches `text`
 *   under Playwright's `toHaveText` semantics (whitespace is normalized
 *   and trimmed)
 * - `expectContains` — assert the first match contains `text` as a
 *   substring (Playwright `toContainText`, same normalization rules)
 */
export type InteractionStep =
  | { type: 'click'; selector: string }
  | { type: 'expectText'; selector: string; text: string }
  | { type: 'expectContains'; selector: string; text: string }

/**
 * A JSX fixture defines a component source and optional props for rendering.
 * Used by the JSX conformance runner to compile and render across adapters.
 *
 * Fixtures intentionally carry no adapter-specific knowledge — diagnostic
 * expectations live on the adapter side (`runAdapterConformanceTests`
 * `expectedDiagnostics`), so adding a new adapter doesn't require touching
 * any fixture.
 */
export interface JSXFixture {
  /** Unique fixture identifier, e.g., "counter" */
  id: string
  /** Human-readable description */
  description: string
  /** JSX source code (complete component file) */
  source: string
  /** Additional component files available for import (filename → source) */
  components?: Record<string, string>
  /** Props to pass when rendering (optional) */
  props?: Record<string, unknown>
  /** Expected normalized HTML output (generated from reference Hono adapter) */
  expectedHtml?: string
  /**
   * Raw (un-normalized) expectedHtml as authored — preserved so the
   * fixture-hydrate runner (#1467) can serve the byte-exact SSR snapshot
   * into the browser. `createFixture` collapses whitespace in
   * `expectedHtml` for cross-adapter comparison ergonomics, which would
   * silently drift hydration inputs for fixtures whose DOM cares about
   * inter-element whitespace (e.g. `<pre>`, `<textarea>`).
   */
  rawExpectedHtml?: string
  /**
   * Frozen client JS bundle output (from `generateClientJs`).
   *
   * Set only on fixtures that participate in the fixture-hydrate layer
   * (#1467). Pairing this with `expectedHtml` lets the real-browser runner
   * hydrate a known-good template + client JS pair so failures point at
   * `packages/client/src/runtime/` rather than the compiler.
   */
  expectedClientJs?: string
  /**
   * Scripted interactions for the fixture-hydrate layer (#1467).
   *
   * The runner serves `expectedHtml`, loads `expectedClientJs`, waits for
   * hydration, then steps through each entry asserting DOM state.
   */
  interactions?: ReadonlyArray<InteractionStep>
}

/**
 * Normalize expectedHtml by collapsing whitespace for comparison.
 * Allows expectedHtml to be written with indentation in fixtures
 * while still matching flat HTML output from adapters.
 */
export function normalizeExpectedHtml(html: string): string {
  return html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
}

/**
 * Create a JSXFixture with automatic source trimming.
 * Strips leading newline from template literals so source
 * can be written with a natural indentation style.
 * Normalizes expectedHtml by collapsing whitespace.
 */
export function createFixture(input: {
  id: string
  description: string
  source: string
  components?: Record<string, string>
  props?: Record<string, unknown>
  expectedHtml?: string
  expectedClientJs?: string
  interactions?: ReadonlyArray<InteractionStep>
}): JSXFixture {
  const trimmedComponents = input.components
    ? Object.fromEntries(
        Object.entries(input.components).map(([k, v]) => [k, v.trimStart()]),
      )
    : undefined
  const normalizedExpectedHtml = input.expectedHtml
    ? normalizeExpectedHtml(input.expectedHtml)
    : undefined
  return {
    ...input,
    source: input.source.trimStart(),
    components: trimmedComponents,
    expectedHtml: normalizedExpectedHtml,
    rawExpectedHtml: input.expectedHtml,
  }
}
