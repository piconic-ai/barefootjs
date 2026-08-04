// Text::Xslate (Perl) adapter starter.
//
// Scaffolds a plain Plack/PSGI app that renders BarefootJS marked
// templates with Text::Xslate (Kolon syntax) — no web framework
// required. The runtime modules come from CPAN (declared in `cpanfile`,
// installed via `cpanm --installdeps .`): `BarefootJS::Backend::Xslate`
// supplies the Xslate rendering backend and pulls in `BarefootJS` (the
// engine-agnostic core + dev-reload runtime) and `Text::Xslate`. The app
// is served under Starman, whose prefork model lets the dev-reload SSE
// endpoint stream without blocking the whole server.

import { execSync } from 'node:child_process'
import type { AdapterTemplate } from '../templates'
import {
  buildGitignore,
  CSS_LINKS_BEGIN,
  CSS_LINKS_END,
  FAVICON_SVG,
  faviconLinkTag,
  STYLES_CSS,
  TOKENS_CSS,
  UNOCSS_DEV_DEPENDENCIES,
  UNO_CSS_PLACEHOLDER,
  unoConfigTs,
} from './shared'

// \`templates: 'dist/templates'\` is a SEPARATE, non-web-exposed
// directory the Plack app reads locally (never served over HTTP — see
// app.psgi's Text::Xslate \`path\` option). \`build.outDir\` is the
// CLIENT asset half — hashed JS bundles app.psgi's mount table serves
// from \`dist/client\` at \`/static/components/\`.
const XSLATE_VITE_CONFIG_TS = `import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/xslate/vite'

const HERE = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/static/components/',
  resolve: {
    // Mirrors tsconfig.json's \`@/components/*\` path mapping (unused by
    // the starter Counter, which is self-contained — see
    // XSLATE_COUNTER_TSX — but a future \`bf add\` fetching a registry
    // component that imports via \`@/components/...\` would need it; see
    // the Go adapters' \`vite.config.ts\` docstring for why Vite's
    // dev-server dependency pre-scan needs this even though \`tsc\`/\`tsx\`
    // already resolve it from tsconfig alone).
    alias: {
      '@/components': resolve(HERE, 'components'),
    },
  },
  // \`./public\` is served directly by app.psgi's Plack::App::File mount,
  // not by Vite — see the Go adapters' \`vite.config.ts\` docstring for
  // why Vite's own default \`publicDir\` copy-into-\`outDir\` behavior has
  // to be turned off here.
  publicDir: false,
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  plugins: barefoot({
    components: ['components'],
    templates: 'dist/templates',
  }),
})
`

// Plain Plack/PSGI app. The Text::Xslate backend has no framework
// dependency, so the whole server is a single PSGI coderef plus a
// Plack::Builder mount table for static assets + the dev-reload SSE
// endpoint. \`vite build\` / \`vite dev\` writes Kolon \`.tx\` templates
// to dist/templates and the client bundles to dist/client; the
// handwritten stylesheets live under public/.
const XSLATE_APP_PSGI = `#!/usr/bin/env perl
use strict;
use warnings;
use utf8;
use feature 'signatures';
no warnings 'experimental::signatures';

# All three modules ship on CPAN (see cpanfile). BarefootJS::Backend::Xslate
# pulls in BarefootJS (the engine-agnostic core + dev-reload runtime) and
# Text::Xslate.
use Plack::Builder;
use Plack::Request;
use Plack::App::File;
use Encode ();
use JSON::PP ();

use BarefootJS;
use BarefootJS::Backend::Xslate;
use BarefootJS::DevReload;

my $DEV = ($ENV{PLACK_ENV} // 'development') ne 'production';

# Canonical JSON keeps SSR output deterministic (matching the runtime's
# sorted-key policy) and round-trips utf8 cleanly.
my $J = JSON::PP->new->canonical->allow_nonref->utf8;

# One Text::Xslate backend renders every component from dist/templates.
# In dev the template cache is disabled so \`vite dev\` edits render
# on the next request without restarting the server.
my $backend = BarefootJS::Backend::Xslate->new(
    path           => ['dist/templates'],
    json_encoder   => sub ($data) { $J->encode($data) },
    xslate_options => { cache => $DEV ? 0 : 1 },
);

# Load the build manifest (\`vite build\` / \`vite dev\` writes
# dist/templates/manifest.json).
# It carries each component's \`ssrDefaults\` — the static fallback for every
# template variable (signals, memos, and the props they read). A plain PSGI
# app has no plugin to seed those automatically (unlike the Mojolicious
# integration), so we read them here and bind them as render vars. Without
# this, \`<: \$count :>\` / \`<: my \$count = (\$initial // 0) :>\` reference
# unbound variables.
sub load_manifest () {
    open my $fh, '<:raw', 'dist/templates/manifest.json' or return {};
    local $/;
    my $json = <$fh>;
    close $fh;
    my $m = eval { $J->decode($json) };
    return (ref $m eq 'HASH') ? $m : {};
}
# Cache the manifest in production; re-read each request in dev so a
# \`vite dev\` rebuild surfaces new defaults without a restart.
my $MANIFEST = $DEV ? undef : load_manifest();
sub manifest () { return $DEV ? load_manifest() : $MANIFEST }

# Build the SSR stash for a component from its manifest \`ssrDefaults\`,
# resolved against \`%props\` (the caller-supplied override) through the
# production \`BarefootJS::_derive_stash_from_defaults\` (mirrors the
# corrected Perl shape in \`BarefootJS.pm\`'s own \`register_components_
# from_manifest\`) — so an aliased destructured prop's CALLER-facing key
# (\`propName\`, e.g. \`n\` for \`{ n: count }\`) is honoured, not just the
# local template var name. Resolving \`$d->{value}\` directly, ignoring
# \`propName\`, silently dropped every caller-supplied value for a renamed
# prop.
sub ssr_defaults ($component, %props) {
    my $entry = manifest()->{$component} or return ();
    my $defaults = $entry->{ssrDefaults} or return ();
    return BarefootJS::_derive_stash_from_defaults($defaults, \\%props);
}

sub rand_suffix () { return substr(sprintf('%f', rand()) =~ s/^0\\.//r, 0, 6) }

# Render a top-level component template and wrap it in the page layout.
# Manifest defaults seed the stash (resolved against \`%override\`, the
# caller-supplied props, so an aliased prop's rename resolves correctly).
# \`ssr_defaults\`' resolved extras go LAST in the hash literal (later key
# wins in a Perl hash construction), so they win over the raw \`%override\`
# map for any key they resolve — matching the production merge order
# (\`BarefootJS.pm\`'s \`register_components_from_manifest\`: \`{ %\$props,
# %extra }\`, extra applied last) instead of the reverse. \`%override\`
# still wins for any key \`ssr_defaults\` did NOT touch (an extraneous,
# undeclared prop \`ssr_defaults\` has no manifest entry for).
sub render_component ($component, %override) {
    my $bf = BarefootJS->new(undef, { backend => $backend });
    $bf->_scope_id($component . '_' . rand_suffix());
    my %stash = (%override, ssr_defaults($component, %override));
    my $body = $backend->render_named($component, $bf, \\%stash);
    return layout(body => $body, scripts => $bf->scripts);
}

sub layout (%a) {
    # Dev-only SSE reload subscriber. Self-suppressed in production (the
    # \`/_bf/reload\` mount below is gated too).
    my $dev_snippet = $DEV ? BarefootJS::DevReload->snippet('/_bf/reload') : '';
    return <<"HTML";
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BarefootJS app</title>
    ${faviconLinkTag('/static/favicon.svg')}
    ${CSS_LINKS_BEGIN}
    <!-- Link all three sheets so the browser fetches them in parallel.
         tokens first so its CSS variables exist before any rule uses them. -->
    <link rel="stylesheet" href="/static/tokens.css">
    <link rel="stylesheet" href="/static/styles.css">
    <link rel="stylesheet" href="/static/uno.css">
    ${CSS_LINKS_END}
</head>
<body>
    <main>$a{body}</main>
    $a{scripts}
    $dev_snippet
</body>
</html>
HTML
}

my $app = sub ($env) {
    my $req  = Plack::Request->new($env);
    my $path = $req->path_info;
    if ($req->method eq 'GET' && ($path eq '/' || $path eq '')) {
        my $html = Encode::encode_utf8(render_component('Counter'));
        return [200, ['Content-Type' => 'text/html; charset=utf-8'], [$html]];
    }
    return [404, ['Content-Type' => 'text/plain'], ['Not Found']];
};

# Mount table. Plack::App::URLMap matches the longest path prefix, so the
# nested /static/components mount wins over /static for client bundles.
#   - /static/components/* -> dist/client/*  (matches vite.config.ts's base)
#   - /static/*            -> public/*        (handwritten stylesheets)
builder {
    enable 'Plack::Middleware::ContentLength';

    mount '/static/components' => Plack::App::File->new(root => 'dist/client')->to_app;
    mount '/static'            => Plack::App::File->new(root => 'public')->to_app;

    if ($DEV) {
        mount '/_bf/reload' => BarefootJS::DevReload->to_app(dist_dir => 'dist');
    }

    mount '/' => $app;
};
`

// The BarefootJS Perl modules are published to CPAN, so the scaffold
// declares them as ordinary dependencies. `BarefootJS::Backend::Xslate`
// ships the Xslate rendering backend and pulls in `BarefootJS` (the
// engine-agnostic core + dev-reload runtime) and `Text::Xslate`
// transitively; all are listed explicitly so `cpanm --installdeps .`
// resolves a known-good set. Plack provides the PSGI plumbing; Starman's
// prefork model is what lets the dev-reload SSE endpoint stream without
// blocking the whole server.
const XSLATE_CPANFILE = `# Required Perl deps. Install with: cpanm --installdeps .
requires 'perl', '5.020';
requires 'BarefootJS', '0.9.6';
requires 'BarefootJS::Backend::Xslate', '0.9.6';
requires 'Text::Xslate', '3.4.0';
requires 'Plack';
requires 'Starman';
`

const XSLATE_TSCONFIG = `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@barefootjs/jsx",
    "types": ["node"{{__PM_TYPES_ENTRY__}}],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/components/*": ["./components/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
`

// Self-contained starter Counter. Unlike the Hono / Mojo / CSR scaffolds
// it does NOT use the registry <Button>: the engine-agnostic
// `register_components_from_manifest` strips the Mojo `.html.ep` template
// suffix, not Xslate's `.tx`, so manifest-driven child rendering isn't on
// the Xslate path yet. A native-button Counter keeps the starter
// runnable end-to-end without that wiring (see `bundledRegistryComponents: []`).
const XSLATE_COUNTER_TSX = `'use client'

import { createSignal, createMemo } from '@barefootjs/client'

interface CounterProps {
  initial?: number
}

export function Counter(props: CounterProps) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="counter">
      <p className="counter-value">count: {count()}</p>
      <p className="counter-doubled">doubled: {doubled()}</p>
      <div className="counter-buttons">
        <button
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground"
          onClick={() => setCount((n) => n + 1)}
        >
          +1
        </button>
        <button
          className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground"
          onClick={() => setCount((n) => n - 1)}
        >
          -1
        </button>
        <button
          className="px-4 py-2 rounded-md bg-muted text-muted-foreground"
          onClick={() => setCount(0)}
        >
          Reset
        </button>
      </div>
    </div>
  )
}
`

// IR test paired with XSLATE_COUNTER_TSX. Mirrors the cross-adapter
// starter test, minus the registry-<Button> child assertion (the Xslate
// starter uses native <button> elements). `{{__TEST_RUNNER_IMPORT__}}`
// is filled by init.ts with the detected PM's runner.
const XSLATE_COUNTER_TEST_TSX = `import { describe, test, expect } from '{{__TEST_RUNNER_IMPORT__}}'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const CounterSource = readFileSync(resolve(__dirname, 'Counter.tsx'), 'utf-8')

describe('Counter', () => {
  const result = renderToTest(CounterSource, 'Counter.tsx')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is Counter', () => {
    expect(result.componentName).toBe('Counter')
  })

  test('has expected signals', () => {
    expect(result.signals).toContain('count')
  })

  test('renders as <div>', () => {
    expect(result.root.tag).toBe('div')
  })

  test('has event handlers', () => {
    const all = result.findAll({})
    expect(
      all.some((n) => n.events.includes('click') || n.props['onClick'] != null),
    ).toBe(true)
  })

  test('renders native <button> controls', () => {
    const all = result.findAll({})
    expect(all.some((n) => n.tag === 'button')).toBe(true)
  })

  test('toStructure() shows expected tree', () => {
    const structure = result.toStructure()
    expect(structure.length).toBeGreaterThan(0)
    expect(structure).toContain('div')
  })
})
`

// Xslate scaffold: `dist/` is the vite build output. `local/` is where
// `carton install` (cpanfile-driven) drops vendored CPAN modules; `log/`
// + `*.tmp` cover dev-server scratch.
const XSLATE_GITIGNORE = buildGitignore([
  {
    heading: 'vite build outputs (regenerated by `vite build` / `vite dev`)',
    entries: ['dist/'],
  },
  {
    heading: 'Perl dependencies + runtime scratch',
    entries: ['local/', 'log/', '*.tmp'],
  },
])

const XSLATE_PORT = 3003

export const XSLATE_ADAPTER: AdapterTemplate = {
  label: 'Text::Xslate (Perl, Plack/PSGI SSR)',
  port: XSLATE_PORT,
  files: {
    'app.psgi': XSLATE_APP_PSGI,
    'cpanfile': XSLATE_CPANFILE,
    'vite.config.ts': XSLATE_VITE_CONFIG_TS,
    'tsconfig.json': XSLATE_TSCONFIG,
    // Only the source `components/` tree needs scanning: Xslate has no
    // compiled `.tsx` output to also scan.
    'uno.config.ts': unoConfigTs([
      'components/**/*.tsx',
    ]),
    'components/Counter.tsx': XSLATE_COUNTER_TSX,
    'components/Counter.test.tsx': XSLATE_COUNTER_TEST_TSX,
    'public/styles.css': STYLES_CSS,
    'public/tokens.css': TOKENS_CSS,
    'public/uno.css': UNO_CSS_PLACEHOLDER,
    'public/favicon.svg': FAVICON_SVG,
    '.gitignore': XSLATE_GITIGNORE,
  },
  scripts: {
    // `vite build` runs once up front so `dist/templates` exists before
    // Starman starts; `vite dev` then takes over the watch loop.
    // Starman (not plackup's default single-process server) so the
    // dev-reload SSE endpoint can stream while requests are served.
    dev: `vite build && unocss && concurrently -k -n dev,uno,server -c blue,magenta,green "vite dev" "unocss --watch" "plackup -s Starman --workers 5 -p ${XSLATE_PORT} app.psgi"`,
    build: 'vite build && unocss',
    start: `PLACK_ENV=production plackup -s Starman --workers 5 -p ${XSLATE_PORT} app.psgi`,
  },
  dependencies: {
    '@barefootjs/client': 'latest',
    '@barefootjs/xslate': 'latest',
    '@barefootjs/jsx': 'latest',
    '@barefootjs/shared': 'latest',
  },
  devDependencies: {
    ...UNOCSS_DEV_DEPENDENCIES,
    '@barefootjs/cli': 'latest',
    '@barefootjs/test': 'latest',
    '@barefootjs/vite': 'latest',
    vite: '^6.0.0',
    concurrently: '^9.0.0',
    typescript: '^5.6.0',
  },
  // The starter Counter uses native <button> elements, not the registry
  // <Button>, so no registry component needs to be fetched at init. See
  // XSLATE_COUNTER_TSX for why manifest-driven child rendering isn't on
  // the Xslate path yet.
  bundledRegistryComponents: [],
  prereqWarnings: () => perlPrereqs(),
  // Text::Xslate / Plack / Starman are Perl dependencies, not npm ones —
  // point the user at the cpanfile so they don't trip over a missing
  // `plackup` after `npm install`.
  extraSetupSteps: [
    {
      label: 'Install Perl deps for the Text::Xslate runtime (see cpanfile):',
      command: 'cpanm --installdeps .',
    },
  ],
}

function perlPrereqs(): string[] {
  const warnings: string[] = []
  try {
    execSync('perl --version', { stdio: 'ignore' })
  } catch {
    warnings.push('Perl not found on PATH. Install Perl 5.20+ before starting the dev server.')
  }
  try {
    execSync('perl -MText::Xslate -e1', { stdio: 'ignore' })
  } catch {
    warnings.push(
      'Text::Xslate not installed. Run `cpanm --installdeps .` before starting the dev server.',
    )
  }
  try {
    // The dev/start scripts invoke `plackup` (shipped with Plack) to run
    // the PSGI app, so a missing Plack surfaces as a bare "command not
    // found" rather than a module error — check it explicitly.
    execSync('perl -MPlack -e1', { stdio: 'ignore' })
  } catch {
    warnings.push(
      'Plack not installed (provides `plackup`). Run `cpanm --installdeps .` before starting the dev server.',
    )
  }
  try {
    execSync('perl -MStarman -e1', { stdio: 'ignore' })
  } catch {
    warnings.push(
      'Starman not installed (the dev server). Run `cpanm --installdeps .` before starting the dev server.',
    )
  }
  return warnings
}
