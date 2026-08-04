// Mojolicious (Perl) adapter starter.
//
// Scaffolds a Mojolicious::Lite app that pulls the BarefootJS Perl
// runtime + Mojolicious integration from CPAN (declared in `cpanfile`,
// installed via `cpanm --installdeps .`). The `Mojolicious::Plugin::BarefootJS`
// distribution ships the plugin, the dev-reload plugin, and the
// `BarefootJS::Backend::Mojo` rendering backend; `BarefootJS` ships the
// engine-agnostic core runtime — so nothing is vendored into the project.

import { execSync } from 'node:child_process'
import type { AdapterTemplate } from '../templates'
import {
  buildGitignore,
  CSS_LINKS_BEGIN,
  CSS_LINKS_END,
  FAVICON_SVG,
  faviconLinkTag,
  SHARED_COUNTER_TSX,
  SHARED_COUNTER_TEST_TSX,
  STYLES_CSS,
  TOKENS_CSS,
  UNOCSS_DEV_DEPENDENCIES,
  UNO_CSS_PLACEHOLDER,
  unoConfigTs,
} from './shared'

// \`templates: 'dist/templates'\` is a SEPARATE, non-web-exposed
// directory the Mojolicious backend reads locally (never served over
// HTTP — see app.pl's \`app->renderer->paths\`). \`build.outDir\` is the
// CLIENT asset half — hashed JS bundles app.pl's forwarding route
// serves from \`dist/client\` at \`/static/components/\`.
const MOJO_VITE_CONFIG_TS = `import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/mojolicious/vite'

const HERE = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/static/components/',
  resolve: {
    // Mirrors tsconfig.json's \`@/components/*\` path mapping — see the
    // Go adapters' \`vite.config.ts\` docstring for why Vite's dev-server
    // dependency pre-scan needs this even though \`tsc\`/\`tsx\` already
    // resolve it from tsconfig alone.
    alias: {
      '@/components': resolve(HERE, 'components'),
    },
  },
  // \`./public\` is served directly by app.pl's static-path routes, not
  // by Vite — see the Go adapters' \`vite.config.ts\` docstring for why
  // Vite's own default \`publicDir\` copy-into-\`outDir\` behavior has to
  // be turned off here.
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

const MOJO_APP_PL = `#!/usr/bin/env perl
use Mojolicious::Lite -signatures;

# Load the BarefootJS plugin (installed from CPAN — see cpanfile).
# Provides the \`bf\` helper + manifest-driven child rendering.
plugin 'BarefootJS';

# Dev-only browser auto-reload over SSE. The plugin polls
# \`dist/.dev/build-id\` (written by \`vite dev\` after every
# successful rebuild) and streams \`event: reload\` to subscribers — the
# layout's \`<%== bf_dev_snippet %>\` registers an EventSource subscriber.
# Self-disabling when \`app->mode eq 'production'\`, so the snippet and
# SSE endpoint never reach prod.
plugin 'BarefootJS::DevReload';

# Static asset roots:
#   - dist/         — compiled component bundles (served at /static/components)
#   - public/       — handwritten static files (served at /static)
push @{app->static->paths}, app->home->child('public');
push @{app->static->paths}, app->home->child('dist');

# Templates produced by \`vite build\` / \`vite dev\`.
app->renderer->paths->[0] = app->home->child('dist/templates');

# In dev mode, drop the template cache so \`vite dev\`
# changes show up without a full server restart.
if (app->mode eq 'development') {
    app->renderer->cache->max_keys(0);
}

# Mojolicious's built-in static dispatcher does not honour URL prefixes,
# so map \`/static/*\` requests explicitly:
#   - \`/static/components/*\` → \`dist/client/*\` (matches
#     vite.config.ts's \`base\`).
#   - \`/static/*\` → \`public/*\` (the handwritten stylesheets).
get '/static/components/*asset' => sub ($c) {
    $c->reply->static('client/' . ($c->stash('asset') // '')) or $c->reply->not_found;
};
get '/static/*asset' => sub ($c) {
    $c->reply->static($c->stash('asset') // '') or $c->reply->not_found;
};

# Component props are ordinary stash values. The plugin seeds every
# template variable's static default from the build manifest, so
# passing \`initial\` here is optional — but it's how you hand real
# data to a component, so the starter route shows the shape.
get '/' => sub ($c) {
    $c->render(template => 'Counter', layout => 'default', initial => 0);
};

app->start;

__DATA__

@@ layouts/default.html.ep
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BarefootJS app</title>
    ${faviconLinkTag('/static/favicon.svg')}
    ${CSS_LINKS_BEGIN}
    <!-- Link all three sheets so the browser fetches them in parallel —
         chaining via styles.css @import would defer tokens/uno to a
         second round-trip and flash unstyled DOM. tokens first so its
         CSS variables are defined before any rule references them. -->
    <link rel="stylesheet" href="/static/tokens.css">
    <link rel="stylesheet" href="/static/styles.css">
    <link rel="stylesheet" href="/static/uno.css">
    ${CSS_LINKS_END}
</head>
<body>
    <main><%== content %></main>
    %== $c->bf->scripts
    %== bf_dev_snippet
</body>
</html>
`

// The BarefootJS Perl modules are published to CPAN, so the scaffold
// declares them as ordinary dependencies rather than vendoring copies
// under ./lib. `Mojolicious::Plugin::BarefootJS` ships the plugin, the
// dev-reload plugin, and `BarefootJS::Backend::Mojo`; it pulls in
// `BarefootJS` (the engine-agnostic core) and `Mojolicious`
// transitively. Both are listed explicitly so `cpanm --installdeps .`
// resolves a known-good set even if a transitive pin drifts.
const MOJO_CPANFILE = `# Required Perl deps. Install with: cpanm --installdeps .
requires 'perl', '5.020';
requires 'BarefootJS', '0.9.6';
requires 'Mojolicious::Plugin::BarefootJS', '0.9.6';
requires 'Mojolicious', '9.0';
`

const MOJO_TSCONFIG = `{
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

// Mojolicious scaffold: `dist/` is the vite build output. `local/` is
// where `carton install` (cpanfile-driven, the documented Perl
// dependency story) drops vendored modules. `*.tmp` covers Mojolicious'
// per-request scratch files; `log/` is where Mojo writes its dev log.
const MOJO_GITIGNORE = buildGitignore([
  {
    heading: 'vite build outputs (regenerated by `vite build` / `vite dev`)',
    entries: ['dist/'],
  },
  {
    heading: 'Perl dependencies + runtime scratch',
    entries: ['local/', 'log/', '*.tmp'],
  },
])

export const MOJO_ADAPTER: AdapterTemplate = {
  label: 'Mojolicious (Perl, EP templates SSR)',
  port: 3002,
  files: {
    'app.pl': MOJO_APP_PL,
    'cpanfile': MOJO_CPANFILE,
    'vite.config.ts': MOJO_VITE_CONFIG_TS,
    'tsconfig.json': MOJO_TSCONFIG,
    // Only the source `components/` tree needs scanning: Mojolicious
    // has no compiled `.tsx` output to also scan.
    'uno.config.ts': unoConfigTs([
      'components/**/*.tsx',
    ]),
    // Registry <Button> is auto-installed for mojo via the
    // adapter-default `bundledRegistryComponents` (`['button']`)
    // now that #1443's chain of PRs taught the Mojo adapter to
    // lower the registry Slot's `[a, b].filter(Boolean).join(' ')`
    // className-merge expression to Embedded Perl. The starter uses
    // the same Button-based Counter the Hono / CSR / Echo scaffolds
    // use, so the onboarding story is consistent across adapters.
    'components/Counter.tsx': SHARED_COUNTER_TSX,
    'components/Counter.test.tsx': SHARED_COUNTER_TEST_TSX,
    'public/styles.css': STYLES_CSS,
    'public/tokens.css': TOKENS_CSS,
    'public/uno.css': UNO_CSS_PLACEHOLDER,
    'public/favicon.svg': FAVICON_SVG,
    '.gitignore': MOJO_GITIGNORE,
  },
  scripts: {
    // `vite build` runs once up front so `dist/templates` exists before
    // morbo starts (a missing template on the very first request would
    // 500 until the eager dev pass caught up); `vite dev` then takes
    // over the watch loop, re-emitting templates with dev-origin script
    // URLs on every component edit, paired with morbo (which
    // auto-reloads on app.pl edits) and the UnoCSS watcher.
    dev: 'vite build && unocss && concurrently -k -n dev,uno,server -c blue,magenta,green "vite dev" "unocss --watch" "morbo app.pl -l http://*:3002"',
    build: 'vite build && unocss',
    start: 'perl app.pl daemon -l http://*:3002',
  },
  dependencies: {
    '@barefootjs/client': 'latest',
    '@barefootjs/mojolicious': 'latest',
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
  // Registry <Button> + its <Slot> dependency now lower to Embedded
  // Perl cleanly via the #1443 PR stack (`array-method` IR for
  // `.join`, `bf_filter_truthy` for `.filter(Boolean)`, array-literal
  // emit, nested-filter `.length`). Auto-installing `button` here
  // brings the Mojo scaffold in line with the Hono / CSR / Echo
  // onboarding flow so `npm create barefootjs@latest --adapter mojo`
  // produces the same Counter shape across adapters. Omit the
  // explicit empty array so init.ts's default `['button']` applies.
  prereqWarnings: () => perlPrereqs(),
  // Mojolicious itself is a Perl dependency, not an npm one — point
  // the user at the bundled cpanfile so they don't trip over a
  // missing `morbo` after `npm install`. Surfaced in the printed
  // "Get started:" guide (issue #1416 item 2).
  extraSetupSteps: [
    {
      label: 'Install Perl deps for the Mojolicious runtime (see cpanfile):',
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
    execSync('perl -MMojolicious -e1', { stdio: 'ignore' })
  } catch {
    warnings.push(
      'Mojolicious not installed. Run `cpanm --installdeps .` (or `cpan Mojolicious`) before starting the dev server.',
    )
  }
  return warnings
}
