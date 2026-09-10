// @barefootjs/compat — doc-facing adapter catalog.
//
// `adapter-registry.ts` is the ONE place TemplateAdapter packages are
// enumerated for compiling; this file is the doc-facing counterpart —
// the ONE place those same packages are grouped into the "backend
// families" (Perl → Mojolicious + Xslate, PHP → Twig + Blade, …) that
// README.md and docs/core/core-concepts/backend-freedom.md render as an
// adapter table via `scripts/generate-adapter-docs.ts`.
//
// `assertAdapterDocCatalogComplete` (exercised by
// `__tests__/adapter-doc-catalog.test.ts`) diffs this file's package list
// against `COMPAT_ADAPTER_PACKAGES` so that registering a new
// TemplateAdapter package without adding it here fails CI instead of
// leaving the README / docs tables silently stale — the same
// registry-vs-floor shape `spec/subset-conformance.md` uses for
// compiler-side catalogues.

import { COMPAT_ADAPTER_PACKAGES } from './adapter-registry'

export interface AdapterFamily {
  /** Display name for the family, e.g. 'Hono', 'Perl'. */
  name: string
  /** Language column, e.g. 'TypeScript', 'Perl'. */
  language: string
  /** Output file extension(s) the family's adapters emit, e.g. '.ep / .tx'. */
  output: string
  /** Template engine(s) / web framework(s) the family targets. */
  backend: string
  /**
   * npm package names implementing this family, matching
   * `COMPAT_ADAPTER_PACKAGES` — except `csr`, which renders client-side
   * only and so is never a `TemplateAdapter` in that registry.
   */
  packages: readonly string[]
  /** Path to the family's doc page, relative to `docs/core/`. */
  docPage: string
}

// One row per backend family, in the order they should render. Perl and
// PHP each group two packages (one shared engine-agnostic runtime, two
// template-engine backends) — see docs/core/adapters/perl-adapter.md and
// php-adapter.md for why that split exists.
export const ADAPTER_FAMILIES: readonly AdapterFamily[] = [
  {
    name: 'Hono',
    language: 'TypeScript',
    output: '.tsx',
    backend: 'Hono / JSX-based servers',
    packages: ['@barefootjs/hono'],
    docPage: 'adapters/hono-adapter.md',
  },
  {
    name: 'Go',
    language: 'Go',
    output: '.tmpl + _types.go',
    backend: 'html/template (Echo, Gin, Chi, net/http)',
    packages: ['@barefootjs/go-template'],
    docPage: 'adapters/go-template-adapter.md',
  },
  {
    name: 'Perl',
    language: 'Perl',
    output: '.ep / .tx',
    backend: 'Mojolicious, Text::Xslate (any PSGI/Plack app)',
    packages: ['@barefootjs/mojolicious', '@barefootjs/xslate'],
    docPage: 'adapters/perl-adapter.md',
  },
  {
    name: 'Ruby',
    language: 'Ruby',
    output: '.erb',
    backend: 'stdlib ERB (any Rack app — Sinatra, Rails)',
    packages: ['@barefootjs/erb'],
    docPage: 'adapters/ruby-adapter.md',
  },
  {
    name: 'Python',
    language: 'Python',
    output: '.jinja',
    backend: 'Jinja2 (Flask, Django, bare WSGI)',
    packages: ['@barefootjs/jinja'],
    docPage: 'adapters/python-adapter.md',
  },
  {
    name: 'PHP',
    language: 'PHP',
    output: '.twig / .blade.php',
    backend: 'Twig (Slim, plain PHP), Laravel Blade (illuminate/view standalone)',
    packages: ['@barefootjs/twig', '@barefootjs/blade'],
    docPage: 'adapters/php-adapter.md',
  },
  {
    name: 'Rust',
    language: 'Rust',
    output: '.j2',
    backend: 'minijinja (axum, actix-web, warp)',
    packages: ['@barefootjs/rust'],
    docPage: 'adapters/rust-adapter.md',
  },
  {
    name: 'CSR',
    language: '—',
    output: '— (client-rendered)',
    backend: 'None (browser-only)',
    packages: ['@barefootjs/client'],
    docPage: 'adapters/csr.md',
  },
] as const

/** Family name reserved for the client-only renderer — excluded from the `TemplateAdapter` floor check below. */
const CSR_FAMILY_NAME = 'CSR'

/**
 * Every family's packages, minus CSR, sorted — the set this catalog
 * claims to cover `TemplateAdapter`-wise.
 */
function catalogedTemplateAdapterPackages(): string[] {
  return ADAPTER_FAMILIES.filter(f => f.name !== CSR_FAMILY_NAME)
    .flatMap(f => f.packages)
    .toSorted()
}

/**
 * Throws when this catalog's package list has drifted from
 * `COMPAT_ADAPTER_PACKAGES` (adapter-registry.ts) in either direction —
 * a package registered there with no family here, or a family here
 * naming a package no longer registered there.
 */
export function assertAdapterDocCatalogComplete(): void {
  const cataloged = new Set(catalogedTemplateAdapterPackages())
  const registered = new Set(COMPAT_ADAPTER_PACKAGES)

  const missing = [...registered].filter(pkg => !cataloged.has(pkg)).sort()
  const stale = [...cataloged].filter(pkg => !registered.has(pkg)).sort()

  if (missing.length === 0 && stale.length === 0) return

  const lines = ['adapter-doc-catalog.ts is out of sync with adapter-registry.ts:']
  if (missing.length > 0) {
    lines.push(`  registered but not in any ADAPTER_FAMILIES entry: ${missing.join(', ')}`)
  }
  if (stale.length > 0) {
    lines.push(`  in ADAPTER_FAMILIES but no longer registered: ${stale.join(', ')}`)
  }
  lines.push('Add or remove the family in packages/compat/src/adapter-doc-catalog.ts to match.')
  throw new Error(lines.join('\n'))
}
