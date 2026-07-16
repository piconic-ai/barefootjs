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
 * - `expectAttribute` — assert the first match's `attribute` equals
 *   `value` exactly. Use for reactive attribute bindings (e.g.
 *   `data-active`, `aria-pressed`) that the runtime updates separately
 *   from textContent.
 * - `expectVisible` / `expectHidden` — Playwright `toBeVisible` /
 *   `toBeHidden`. Pick these when the user-observable signal is
 *   visibility rather than a specific attribute value — e.g. the
 *   `hidden` boolean attribute disappears entirely on open, which a
 *   value-based `expectAttribute` cannot express.
 * - `fill` — Playwright `locator.fill(value)`. Sets `<input>` /
 *   `<textarea>` / `[contenteditable]` value AND fires the input event,
 *   so the framework's `onInput` handlers run.
 * - `expectValue` — Playwright `toHaveValue`. Asserts the form
 *   control's *value property* (not the `value` HTML attribute, which
 *   only reflects the initial value after user typing).
 * - `hover` — Playwright `locator.hover()`: real mouse movement onto the
 *   first match, firing mouseenter/mouseleave on the elements the
 *   pointer crosses (#1467 Phase 2c, tooltips). To *un*-hover, hover a
 *   different element — Playwright has no unhover. `position` (offsets
 *   from the element's top-left) pins an exact pointer target: the
 *   un-hover idiom is `{ selector: 'html', position: { x: 1, y: 1 } }`,
 *   parking the pointer in the body margin where no content sits —
 *   hovering a container's *centre* can land back inside the very
 *   element being un-hovered on a CSS-less host page.
 * - `press` — Playwright `locator.press(key)` with a key name like
 *   `'Escape'`. Dispatches trusted keydown/keyup on the first match —
 *   use `body` as the selector for document-level key handlers
 *   (overlay ESC-to-close), since the handler is on `document` and the
 *   event bubbles from wherever focus is.
 * - `drag` — a pointer drag from the centre of the first match by
 *   `deltaX`/`deltaY` CSS pixels (#1467 Phase 3, carousel). Issues real
 *   `pointerdown` → `pointermove` (stepped) → `pointerup`, the gesture
 *   pointer-based libraries like Embla bind. On a CSS-less host page the
 *   resulting *scroll distance* is layout-dependent, so assert on the
 *   deterministic fallout (aria/data attributes, button `disabled`)
 *   rather than pixel offsets — see the determinism caveat in #1971.
 */
export type InteractionStep =
  | { type: 'click'; selector: string }
  | { type: 'expectText'; selector: string; text: string }
  | { type: 'expectContains'; selector: string; text: string }
  | {
      type: 'expectAttribute'
      selector: string
      attribute: string
      value: string
    }
  | { type: 'expectVisible'; selector: string }
  | { type: 'expectHidden'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'expectValue'; selector: string; value: string }
  | { type: 'hover'; selector: string; position?: { x: number; y: number } }
  | { type: 'press'; selector: string; key: string }
  | { type: 'drag'; selector: string; deltaX?: number; deltaY?: number }

/**
 * An additional evaluation point for oracle conformance
 * (`spec/subset-conformance.md`). A marked template is a *function* from
 * data to HTML; the fixture's primary `props`/`expectedHtml` pair observes
 * one point of it. Each data point re-renders the fixture with adversarial
 * props and compares the adapter's output against the live JS reference
 * render — no hand-written expectation.
 *
 * Props must stay inside the JSON data domain (validated by
 * `createFixture`): finite numbers, strings, booleans, `null`, arrays,
 * plain objects. To express "optional prop absent", omit the key —
 * `undefined` is not JSON-representable across backends. Catalogued rich
 * types (`Date`) join the domain in a later roadmap stage.
 */
export interface JSXDataPoint {
  /** Short unique name within the fixture, e.g. `'empty-label'`. */
  name: string
  /**
   * Props for this evaluation point. Inside the JSON data domain (finite
   * numbers, strings, booleans, `null`, arrays, plain objects) plus the
   * catalogued rich type `Date` (#2274) — a real `Date` instance here, or,
   * for the JSON-serialized generated catalogue, a `{ $date: ISO }` envelope
   * that `data-point-conformance.ts` materializes back into a `Date` before
   * either render leg (a `Date` cannot survive the committed JSON artifact).
   */
  props: Record<string, unknown>
}

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
  /**
   * Pre-compiled child SSR modules (import specifier → absolute module
   * path) for the Hono render — #1467 Phase 2a. Set for `site/ui`
   * fixtures: the parent's `../<child>` import is re-anchored to a
   * committed, export-intact marked-template module so SSR loads it as a
   * real module instead of inlining + stripping the child's exports.
   * Takes precedence over `components` for the same key; `components`
   * still feeds the CSR harness (child client JS).
   */
  componentModules?: Record<string, string>
  /**
   * Explicit component to render when `source` declares multiple
   * exports. Omitted for single-export fixtures — adapters fall back
   * to the first function-valued export, which in Bun is alphabetical
   * for dynamically-imported modules and can otherwise pick the wrong
   * sibling (e.g. `PropsReactivityComparison` before `ReactiveProps`).
   */
  componentName?: string
  /** Props to pass when rendering (optional) */
  props?: Record<string, unknown>
  /**
   * Additional evaluation points for oracle conformance
   * (`spec/subset-conformance.md`). Gated behind the primary
   * `expectedHtml` smoke point: they only run when the fixture's primary
   * render matches, so a fixture declaring `dataPoints` must also declare
   * `expectedHtml` (enforced by `createFixture`).
   */
  dataPoints?: ReadonlyArray<JSXDataPoint>
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
  /**
   * Bare module specifiers the fixture's client JS resolves at runtime to
   * a third-party ESM bundle on disk (#1467 Phase 3, carousel → embla).
   * Maps each specifier (e.g. `'embla-carousel'`) to an absolute path to
   * its ESM build.
   *
   * The fixture-hydrate host page serves each bundle and adds the matching
   * importmap entry **only for fixtures that declare it** — so a bare
   * `import('embla-carousel')` resolves in the browser without polluting
   * the importmap of every other fixture (the gating the acceptance
   * criteria require). Fixtures with no external deps omit this field and
   * their host page keeps the bare `@barefootjs/client/runtime` importmap
   * untouched.
   */
  externalImports?: Record<string, string>
  /**
   * Inline CSS injected into the fixture-hydrate host page `<head>`, gated
   * the same way as `externalImports` — present only for fixtures that
   * declare it, so every other fixture's host page stays CSS-less (#1467
   * Phase 3).
   *
   * Reserved for the rare component whose hydrated behaviour depends on
   * *some* layout existing, not on specific pixels: Embla measures slide
   * geometry to decide whether it can scroll, and with zero CSS every
   * slide collapses to the same position so `canScrollNext()` is
   * permanently false and no interaction is possible. A few fixed-width
   * flex rules give Embla a layout to measure; assertions still read only
   * the layout-independent `disabled` state, never offsets (see the
   * determinism caveat in #1971). Do **not** reach for this to restyle a
   * component — the corpus is deliberately unstyled.
   */
  hostStyles?: string
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
 * Assert a data-point prop value stays inside the supported data domain
 * (`spec/subset-conformance.md`): the JSON data domain — finite numbers,
 * strings, booleans, `null`, arrays, and plain objects — plus the
 * catalogued rich type `Date` (#2274), the first host type with a
 * cross-backend lowering (`date-lowering.ts`) and runtime helper. A valid
 * `Date` instance is admitted directly (an `Invalid Date` is refused — it
 * cannot survive `toISOString` transport); the `{ $date: ISO }` envelope the
 * generated catalogue uses is a plain object and passes as one (it is
 * materialized into a `Date` at render time). Everything else —
 * `undefined`, `NaN`/`Infinity`, functions, other class instances — cannot
 * cross the host-language boundary and fails loudly at fixture-definition
 * time rather than as a confusing render divergence.
 */
function assertJsonDomain(fixtureId: string, pointName: string, value: unknown, path: string): void {
  const fail = (why: string): never => {
    throw new Error(
      `[${fixtureId}] dataPoint '${pointName}': props${path} ${why} — ` +
        `outside the JSON data domain (see spec/subset-conformance.md). ` +
        `Omit the key to express an absent optional prop.`,
    )
  }
  if (value === null) return
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return
    case 'number':
      if (!Number.isFinite(value)) fail(`is a non-finite number (${value})`)
      return
    case 'undefined':
      fail('is undefined')
      return
    case 'object':
      break
    default:
      fail(`is a ${typeof value}`)
      return
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertJsonDomain(fixtureId, pointName, v, `${path}[${i}]`))
    return
  }
  // `Date` is the first catalogued rich type (#2274): admitted as a real
  // instance. An `Invalid Date` is refused, though — the harness transports a
  // Date as `value.toISOString()`, which throws `RangeError` on a NaN instant
  // (and the JS oracle throws the same evaluating the accessor), so it can
  // never round-trip. The #2288 zero-value fallback is a *runtime* helper
  // contract for a nil/malformed native value at request time; this
  // definition-time gate never reaches it.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) fail('is an Invalid Date')
    return
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    const ctor = (value as object).constructor?.name ?? 'unknown'
    fail(`is a ${ctor} instance`)
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    assertJsonDomain(fixtureId, pointName, v, `${path}.${k}`)
  }
}

/**
 * Create a JSXFixture with automatic source trimming.
 * Strips leading newline from template literals so source
 * can be written with a natural indentation style.
 * Normalizes expectedHtml by collapsing whitespace.
 * Validates `dataPoints` (JSON data domain, unique names, and the
 * primary `expectedHtml` smoke point they are gated behind).
 */
export function createFixture(input: {
  id: string
  description: string
  source: string
  components?: Record<string, string>
  componentModules?: Record<string, string>
  componentName?: string
  props?: Record<string, unknown>
  dataPoints?: ReadonlyArray<JSXDataPoint>
  expectedHtml?: string
  expectedClientJs?: string
  interactions?: ReadonlyArray<InteractionStep>
  externalImports?: Record<string, string>
  hostStyles?: string
}): JSXFixture {
  const trimmedComponents = input.components
    ? Object.fromEntries(
        Object.entries(input.components).map(([k, v]) => [k, v.trimStart()]),
      )
    : undefined
  const normalizedExpectedHtml = input.expectedHtml
    ? normalizeExpectedHtml(input.expectedHtml)
    : undefined
  if (input.dataPoints && input.dataPoints.length > 0) {
    if (!input.expectedHtml) {
      throw new Error(
        `[${input.id}] dataPoints require expectedHtml: the primary point is the ` +
          `smoke test and human pin the oracle points are gated behind ` +
          `(spec/subset-conformance.md).`,
      )
    }
    const seen = new Set<string>()
    for (const point of input.dataPoints) {
      if (seen.has(point.name)) {
        throw new Error(`[${input.id}] duplicate dataPoint name '${point.name}'`)
      }
      seen.add(point.name)
      assertJsonDomain(input.id, point.name, point.props, '')
    }
  }
  return {
    ...input,
    source: input.source.trimStart(),
    components: trimmedComponents,
    expectedHtml: normalizedExpectedHtml,
    rawExpectedHtml: input.expectedHtml,
  }
}
