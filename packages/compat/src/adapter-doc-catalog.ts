// @barefootjs/compat — doc-facing adapter catalog.
//
// `adapter-registry.ts` is the ONE place TemplateAdapter packages are
// enumerated for compiling; this file is the doc-facing counterpart — the
// ONE place those same packages get a language/backend label for
// README.md, docs/core/core-concepts/backend-freedom.md, and
// docs/core/adapters.md, rendered as an adapter table via
// `scripts/generate-adapter-docs.ts`. One row per package — a language
// with two backends (Perl: Mojolicious + Xslate; PHP: Twig + Blade) gets
// two rows, not one combined row.
//
// `assertAdapterDocCatalogComplete` (exercised by
// `__tests__/adapter-doc-catalog.test.ts`) diffs this file's package list
// against `COMPAT_ADAPTER_PACKAGES` so that registering a new
// TemplateAdapter package without adding it here fails CI instead of
// leaving the README / docs tables silently stale — the same
// registry-vs-floor shape `spec/subset-conformance.md` uses for
// compiler-side catalogues.

import { COMPAT_ADAPTER_PACKAGES } from './adapter-registry'

export interface AdapterEntry {
  /** Language column, e.g. 'TypeScript', 'Perl'. Repeats across rows when a language has multiple backends. */
  language: string
  /** Concise backend/engine name, e.g. 'Mojolicious', 'Jinja2'. Not a full sentence. */
  backend: string
  /**
   * The npm package implementing this row, matching an entry in
   * `COMPAT_ADAPTER_PACKAGES` — except `@barefootjs/client` (CSR), which
   * renders client-side only and so is never a `TemplateAdapter` in that
   * registry.
   */
  pkg: string
  /** Path to this row's doc page, relative to `docs/core/`. */
  docPage: string
}

// One row per adapter package, in the order they should render.
export const ADAPTER_ENTRIES: readonly AdapterEntry[] = [
  { language: 'TypeScript', backend: 'Hono', pkg: '@barefootjs/hono', docPage: 'adapters/hono-adapter.md' },
  { language: 'Go', backend: 'html/template', pkg: '@barefootjs/go-template', docPage: 'adapters/go-template-adapter.md' },
  { language: 'Perl', backend: 'Mojolicious', pkg: '@barefootjs/mojolicious', docPage: 'adapters/perl-adapter.md' },
  { language: 'Perl', backend: 'Text::Xslate', pkg: '@barefootjs/xslate', docPage: 'adapters/perl-adapter.md' },
  { language: 'Ruby', backend: 'ERB', pkg: '@barefootjs/erb', docPage: 'adapters/ruby-adapter.md' },
  { language: 'Python', backend: 'Jinja2', pkg: '@barefootjs/jinja', docPage: 'adapters/python-adapter.md' },
  { language: 'PHP', backend: 'Twig', pkg: '@barefootjs/twig', docPage: 'adapters/php-adapter.md' },
  { language: 'PHP', backend: 'Laravel Blade', pkg: '@barefootjs/blade', docPage: 'adapters/php-adapter.md' },
  { language: 'Rust', backend: 'minijinja', pkg: '@barefootjs/rust', docPage: 'adapters/rust-adapter.md' },
  // Not a server backend — renders in the browser only, no template engine
  // involved. Kept in the table (last row) since it's still a way to ship
  // the same JSX, just with the "Backend" column repurposed to say so.
  { language: '—', backend: 'CSR (browser only)', pkg: '@barefootjs/client', docPage: 'adapters/csr.md' },
] as const

/** Package reserved for the client-only renderer — excluded from the `TemplateAdapter` floor check below. */
const CSR_PACKAGE = '@barefootjs/client'

/** Every cataloged package except CSR, sorted — the set this catalog claims to cover `TemplateAdapter`-wise. */
function catalogedTemplateAdapterPackages(): string[] {
  return ADAPTER_ENTRIES.filter(e => e.pkg !== CSR_PACKAGE)
    .map(e => e.pkg)
    .toSorted()
}

/**
 * Throws when this catalog's package list has drifted from
 * `COMPAT_ADAPTER_PACKAGES` (adapter-registry.ts) in either direction — a
 * package registered there with no row here, or a row here naming a
 * package no longer registered there.
 */
export function assertAdapterDocCatalogComplete(): void {
  const cataloged = new Set(catalogedTemplateAdapterPackages())
  const registered = new Set(COMPAT_ADAPTER_PACKAGES)

  const missing = [...registered].filter(pkg => !cataloged.has(pkg)).sort()
  const stale = [...cataloged].filter(pkg => !registered.has(pkg)).sort()

  if (missing.length === 0 && stale.length === 0) return

  const lines = ['adapter-doc-catalog.ts is out of sync with adapter-registry.ts:']
  if (missing.length > 0) {
    lines.push(`  registered but not in any ADAPTER_ENTRIES row: ${missing.join(', ')}`)
  }
  if (stale.length > 0) {
    lines.push(`  in ADAPTER_ENTRIES but no longer registered: ${stale.join(', ')}`)
  }
  lines.push('Add or remove the row in packages/compat/src/adapter-doc-catalog.ts to match.')
  throw new Error(lines.join('\n'))
}
