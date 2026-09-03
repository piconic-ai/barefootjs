// @barefootjs/compat — the ONE place TemplateAdapter packages are enumerated.
//
// packages/adapter-tests deliberately does not import any adapter (its
// conformance runner is fed a `createAdapter` factory by each adapter's
// own test file) — that inversion stays intact. This package needs the
// opposite: a single place that knows about every adapter so it can
// compile the same component through all of them. @barefootjs/compat owns
// that list instead of adapter-tests.
//
// This package is repo-internal (`private: true`, never published) and
// declares all 9 adapters as `devDependencies` — see
// packages/compat/package.json. Adapters are still dynamic-imported
// rather than statically imported, so a package that fails to resolve
// (e.g. unbuilt dist) degrades to a reported skip instead of a hard
// crash, keeping the loader total. The monorepo always has all 9
// installed, so a run from this repo loads every adapter.
//
// `loadCompatAdapters` itself stays total (see above) because an ad-hoc
// `bun run compat <component>` run should still cover every adapter it
// CAN load. A generator that WRITES a committed lock artifact
// (`support-matrix:lock`, `compat:lock`) must not: a lock computed from a
// subset silently drops those adapters' columns, and the committed lock
// then becomes the (wrong) expectation the freshness test compares
// against (#2785). Those callers use `loadAllCompatAdapters` below, which
// throws instead of returning a subset.

import type { ConformancePins, RenderDivergences, TemplateAdapter } from '@barefootjs/jsx'

interface CompatAdapterSpec {
  pkg: string
  className: string
}

// Sorted by package name.
const COMPAT_ADAPTERS: CompatAdapterSpec[] = [
  { pkg: '@barefootjs/blade', className: 'BladeAdapter' },
  { pkg: '@barefootjs/erb', className: 'ErbAdapter' },
  { pkg: '@barefootjs/go-template', className: 'GoTemplateAdapter' },
  { pkg: '@barefootjs/hono', className: 'HonoAdapter' },
  { pkg: '@barefootjs/jinja', className: 'JinjaAdapter' },
  { pkg: '@barefootjs/mojolicious', className: 'MojoAdapter' },
  { pkg: '@barefootjs/rust', className: 'MinijinjaAdapter' },
  { pkg: '@barefootjs/twig', className: 'TwigAdapter' },
  { pkg: '@barefootjs/xslate', className: 'XslateAdapter' },
]

export interface LoadedCompatAdapter {
  /** Matrix column id — the adapter's own `.name` (e.g. 'go-template'), NOT the package name. */
  id: string
  /** Source package, for skip/error reporting. */
  pkg: string
  /**
   * Fresh-instance factory. Conformance/build compiles accumulate
   * per-compile state on an adapter instance, so callers must construct
   * a new one for every compile rather than reusing this factory's result.
   */
  factory: () => TemplateAdapter
  /** The package's exported `conformancePins`, or `{}` when it exports none. */
  pins: ConformancePins
  /**
   * The package's exported `renderDivergences` (fixtures that compile
   * clean but render differently from the Hono reference on the
   * adapter's real backend — see the type's docstring in
   * `@barefootjs/jsx`), or `{}` when it exports none.
   */
  renderDivergences: RenderDivergences
}

export interface SkippedCompatAdapter {
  pkg: string
  reason: string
}

/**
 * Dynamic-import each registered adapter package and build a fresh-
 * instance factory for it. A package that fails to resolve, or that
 * doesn't export the expected class name, is reported as a skip with a
 * reason rather than throwing — a compat run should still cover every
 * adapter it CAN load.
 */
export async function loadCompatAdapters(): Promise<{
  loaded: LoadedCompatAdapter[]
  skipped: SkippedCompatAdapter[]
}> {
  const loaded: LoadedCompatAdapter[] = []
  const skipped: SkippedCompatAdapter[] = []

  for (const spec of COMPAT_ADAPTERS) {
    let mod: Record<string, unknown>
    try {
      mod = await import(spec.pkg)
    } catch (err) {
      skipped.push({ pkg: spec.pkg, reason: err instanceof Error ? err.message : String(err) })
      continue
    }

    const AdapterClass = mod[spec.className] as (new () => TemplateAdapter) | undefined
    if (typeof AdapterClass !== 'function') {
      skipped.push({ pkg: spec.pkg, reason: `${spec.pkg} does not export a class named ${spec.className}` })
      continue
    }

    const pins = (mod.conformancePins as ConformancePins | undefined) ?? {}
    const renderDivergences = (mod.renderDivergences as RenderDivergences | undefined) ?? {}
    // One throwaway instance just to read `.name` — the real per-compile
    // instances always come from `factory()` below.
    const probe = new AdapterClass()
    loaded.push({
      id: probe.name,
      pkg: spec.pkg,
      factory: () => new AdapterClass(),
      pins,
      renderDivergences,
    })
  }

  return { loaded, skipped }
}

/** Thrown by {@link loadAllCompatAdapters} when a lock generator would otherwise emit output missing registered adapter columns. */
export class MissingCompatAdaptersError extends Error {
  readonly skipped: readonly SkippedCompatAdapter[]

  constructor(skipped: readonly SkippedCompatAdapter[], total: number) {
    super(formatMissingCompatAdapters(skipped, total))
    this.name = 'MissingCompatAdaptersError'
    this.skipped = skipped
  }
}

function formatMissingCompatAdapters(skipped: readonly SkippedCompatAdapter[], total: number): string {
  const filters = skipped.map(s => `--filter '${s.pkg}'`).join(' ')
  return [
    `Refusing to write: ${skipped.length} of ${total} registered adapter packages did not load, so the output would silently drop their columns.`,
    ...skipped.map(s => `  - ${s.pkg}: ${s.reason}`),
    `Build them first:`,
    `  bun run ${filters} build`,
    `(or \`bun run build\` for every workspace package), then re-run.`,
  ].join('\n')
}

/**
 * Pure gate over a {@link loadCompatAdapters} result: returns `loaded` when
 * nothing was skipped, otherwise throws {@link MissingCompatAdaptersError}.
 * Split out from {@link loadAllCompatAdapters} so the refusal is
 * unit-testable without an actual unbuilt package on disk.
 */
export function requireAllCompatAdapters(result: {
  loaded: LoadedCompatAdapter[]
  skipped: SkippedCompatAdapter[]
}): LoadedCompatAdapter[] {
  if (result.skipped.length > 0) {
    throw new MissingCompatAdaptersError(result.skipped, result.loaded.length + result.skipped.length)
  }
  return result.loaded
}

/**
 * {@link loadCompatAdapters} for lock generators: all registered adapters or
 * a thrown {@link MissingCompatAdaptersError}, never a silently truncated
 * subset (#2785).
 */
export async function loadAllCompatAdapters(): Promise<LoadedCompatAdapter[]> {
  return requireAllCompatAdapters(await loadCompatAdapters())
}
