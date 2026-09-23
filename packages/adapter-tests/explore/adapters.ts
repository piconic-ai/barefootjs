/**
 * The adapter axis of the bounded exploration (#3046).
 *
 * The explorer's reference run renders every reachable state through
 * Hono (`scripts/explore-generate.ts`, via the same snapshot path every
 * corpus fixture uses). This module adds the other template adapters as
 * SSR producers for the SAME states: each state is rendered through the
 * adapter's real backend (the `test-render` entry point its own
 * conformance tests use) and hydrated in the browser by the scenario's
 * client JS — which is adapter-independent, so a divergence on this axis
 * is that adapter's SSR markup not matching what the shared client
 * runtime expects to adopt.
 *
 * Adapters are dynamic-imported, and a missing backend toolchain is
 * recorded as an `unavailable` run (one failing `render` case in the
 * browser sweep) instead of aborting the generator for every other
 * adapter.
 */

import type { TemplateAdapter } from '@barefootjs/jsx'
import type { RenderOptions } from '../src/jsx-runner'

export interface LoadedExploreAdapter {
  /** Adapter id — the adapter's own `.name` (e.g. `go-template`), used in fixture ids and quarantine keys. */
  id: string
  /** Fresh instance per compile — adapters accumulate per-compile state. */
  create(): TemplateAdapter
  render(options: RenderOptions): Promise<string>
  /** True when `err` is the renderer's "backend toolchain not installed" error. */
  isUnavailable(err: unknown): boolean
}

interface AdapterSpec {
  id: string
  load(): Promise<LoadedExploreAdapter>
}

function spec(
  id: string,
  importAdapter: () => Promise<Record<string, unknown>>,
  adapterClass: string,
  importRender: () => Promise<Record<string, unknown>>,
  renderFn: string,
  unavailableError: string,
): AdapterSpec {
  return {
    id,
    async load() {
      const [adapterMod, renderMod] = await Promise.all([importAdapter(), importRender()])
      const Adapter = adapterMod[adapterClass] as new () => TemplateAdapter
      const render = renderMod[renderFn] as (options: RenderOptions) => Promise<string>
      const Unavailable = renderMod[unavailableError] as new (...args: unknown[]) => Error
      return {
        id,
        create: () => new Adapter(),
        render,
        isUnavailable: err => err instanceof Unavailable,
      }
    },
  }
}

// Sorted by id. Hono is the reference run, not an entry here.
export const EXPLORE_ADAPTERS: readonly AdapterSpec[] = [
  spec('blade', () => import('@barefootjs/blade/adapter'), 'BladeAdapter', () => import('@barefootjs/blade/test-render'), 'renderBladeComponent', 'BladeNotAvailableError'),
  spec('erb', () => import('@barefootjs/erb/adapter'), 'ErbAdapter', () => import('@barefootjs/erb/test-render'), 'renderErbComponent', 'ErbNotAvailableError'),
  spec('go-template', () => import('@barefootjs/go-template/adapter'), 'GoTemplateAdapter', () => import('@barefootjs/go-template/test-render'), 'renderGoTemplateComponent', 'GoNotAvailableError'),
  spec('jinja', () => import('@barefootjs/jinja/adapter'), 'JinjaAdapter', () => import('@barefootjs/jinja/test-render'), 'renderJinjaComponent', 'PythonNotAvailableError'),
  spec('minijinja', () => import('@barefootjs/rust/adapter'), 'MinijinjaAdapter', () => import('@barefootjs/rust/test-render'), 'renderMinijinjaComponent', 'RustNotAvailableError'),
  spec('mojolicious', () => import('@barefootjs/mojolicious/adapter'), 'MojoAdapter', () => import('@barefootjs/mojolicious/test-render'), 'renderMojoComponent', 'PerlNotAvailableError'),
  spec('pebble', () => import('@barefootjs/pebble/adapter'), 'PebbleAdapter', () => import('@barefootjs/pebble/test-render'), 'renderPebbleComponent', 'JavaNotAvailableError'),
  spec('twig', () => import('@barefootjs/twig/adapter'), 'TwigAdapter', () => import('@barefootjs/twig/test-render'), 'renderTwigComponent', 'TwigNotAvailableError'),
  spec('xslate', () => import('@barefootjs/xslate/adapter'), 'XslateAdapter', () => import('@barefootjs/xslate/test-render'), 'renderXslateComponent', 'XslateNotAvailableError'),
]

/**
 * Resolve `EXPLORE_ADAPTERS` (comma-separated ids, or `all`) to specs.
 * Empty / unset → no adapter runs (the Hono reference run only), so a
 * plain `bun run explore:generate` stays exactly as fast as before.
 */
export function selectExploreAdapters(env: string | undefined): readonly AdapterSpec[] {
  const raw = (env ?? '').trim()
  if (raw === '') return []
  if (raw === 'all') return EXPLORE_ADAPTERS
  const wanted = raw.split(',').map(s => s.trim()).filter(Boolean)
  const unknown = wanted.filter(id => !EXPLORE_ADAPTERS.some(a => a.id === id))
  if (unknown.length > 0) {
    throw new Error(`EXPLORE_ADAPTERS: unknown adapter id(s) ${unknown.join(', ')} — known: ${EXPLORE_ADAPTERS.map(a => a.id).join(', ')}`)
  }
  return EXPLORE_ADAPTERS.filter(a => wanted.includes(a.id))
}
