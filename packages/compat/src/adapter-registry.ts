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
// declares all 8 adapters as `devDependencies` — see
// packages/compat/package.json. Adapters are still dynamic-imported
// rather than statically imported, so a package that fails to resolve
// (e.g. unbuilt dist) degrades to a reported skip instead of a hard
// crash, keeping the loader total. The monorepo always has all 8
// installed, so a run from this repo loads every adapter.

import type { ConformancePins, TemplateAdapter } from '@barefootjs/jsx'

interface CompatAdapterSpec {
  pkg: string
  className: string
}

// Sorted by package name.
const COMPAT_ADAPTERS: CompatAdapterSpec[] = [
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
    // One throwaway instance just to read `.name` — the real per-compile
    // instances always come from `factory()` below.
    const probe = new AdapterClass()
    loaded.push({
      id: probe.name,
      pkg: spec.pkg,
      factory: () => new AdapterClass(),
      pins,
    })
  }

  return { loaded, skipped }
}
