// Specification-as-test for `bun create barefootjs --adapter mojo <project-name>`.
//
// This file verifies that the Mojo scaffold satisfies both the
// cross-adapter contract defined in `create-barefootjs` and the
// Mojo-specific wiring:
//
//   - `barefoot.config.ts` targets `@barefootjs/mojolicious/build` and
//     uses `clientJsBasePath: '/static/components/'`.
//   - `app.pl` forwards `/static/*` URLs to the on-disk static paths
//     (Mojolicious's built-in dispatcher does not honour URL prefixes,
//     so the explicit routes are load-bearing — without them every
//     stylesheet and client bundle 404s in the browser).
//   - the `cpanfile` declares the BarefootJS Perl deps + Mojolicious
//     (installed from CPAN, not vendored under `lib/`), and the plugin's
//     manifest-driven child rendering works without per-component wire-up.
//
//   BAREFOOT_CREATE_INTEGRATION=1 bun test src/__tests__/scaffold.test.ts

import { describe, test, expect, beforeAll } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  assertScaffoldContract,
  ensureCreateCli,
  type ScaffoldFacts,
} from '@barefootjs/adapter-tests'

// ---------------------------------------------------------------------------
// Helpers (thin wrappers around the compiled create-barefootjs CLI)
// ---------------------------------------------------------------------------

const CREATE_PKG_DIR = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../create-barefootjs',
)
const CREATE_CLI = path.join(CREATE_PKG_DIR, 'dist', 'index.js')

function mktmp(): string {
  return mkdtempSync(path.join(tmpdir(), 'bf-mojo-scaffold-test-'))
}

interface RunResult {
  exitCode: number | null
  stdout: string
  stderr: string
}

function runCreate(
  args: string[],
  opts: { cwd: string; env?: Record<string, string> },
): RunResult {
  ensureCreateCli(CREATE_PKG_DIR)
  const result = spawnSync('node', [CREATE_CLI, ...args], {
    cwd: opts.cwd,
    env: {
      ...process.env,
      ...opts.env,
      npm_config_user_agent: undefined,
    },
    encoding: 'utf-8',
  })
  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

const INTEGRATION = process.env.BAREFOOT_CREATE_INTEGRATION === '1'

// ---------------------------------------------------------------------------
// Happy-path scenario — `bun create barefootjs --adapter mojo mojo-app`
// ---------------------------------------------------------------------------

describe.skipIf(!INTEGRATION)(
  'Scenario: bun create barefootjs --adapter mojo <project-name>',
  () => {
    let result: RunResult
    let projectDir: string

    beforeAll(() => {
      const cwd = mktmp()
      result = runCreate(['mojo-app', '--adapter', 'mojo'], { cwd })
      projectDir = path.join(cwd, 'mojo-app')
    })

    test('satisfies the cross-adapter scaffold contract', () => {
      const app = readFileSync(path.join(projectDir, 'app.pl'), 'utf-8')
      assertScaffoldContract({
        exitCode: result.exitCode,
        stdout: result.stdout,
        projectDir,
        adapterPackageName: '@barefootjs/mojolicious',
        devReload: {
          // The `BarefootJS::DevReload` plugin registers `/_bf/reload` as
          // an SSE endpoint and exposes `bf_dev_snippet` to embed the
          // reload subscriber in the layout. The plugin self-disables when
          // `app->mode eq 'production'`, so the production gate is
          // handled at the library layer.
          subscribesBrowserInDev:
            app.includes("plugin 'BarefootJS::DevReload'") &&
            app.includes('bf_dev_snippet'),
          gatedToDev: true,
          sentinelSseEndpoint: '/_bf/reload',
        },
      } satisfies ScaffoldFacts)
    })

    // -------------------------------------------------------------------------
    // Mojo-specific: static asset routing
    // -------------------------------------------------------------------------

    describe('app.pl serves static assets', () => {
      // Mojolicious's built-in static dispatcher does not honour URL
      // prefixes. The scaffold's `barefoot.config.ts` and layout `<link>`s
      // all reference `/static/*` URLs, so `app.pl` needs explicit
      // forwarding routes — without them every stylesheet and client bundle
      // 404s in the browser even though the SSR HTML rendered correctly.
      test('forwards /static/components/* to dist/client/* (clientJsBasePath)', () => {
        const app = readFileSync(path.join(projectDir, 'app.pl'), 'utf-8')
        expect(app).toMatch(/get\s+'\/static\/components\/\*asset'/)
        expect(app).toContain("reply->static('client/'")
      })

      test('forwards /static/* to public/* (handwritten stylesheets)', () => {
        const app = readFileSync(path.join(projectDir, 'app.pl'), 'utf-8')
        expect(app).toMatch(/get\s+'\/static\/\*asset'/)
      })

      test('mounts public/ and dist/ on app->static->paths', () => {
        const app = readFileSync(path.join(projectDir, 'app.pl'), 'utf-8')
        expect(app).toContain("app->home->child('public')")
        expect(app).toContain("app->home->child('dist')")
      })
    })

    // -------------------------------------------------------------------------
    // Mojo-specific: plugin wiring and Perl deps
    // -------------------------------------------------------------------------

    describe('mojo wiring', () => {
      test('does not vendor BarefootJS .pm copies under lib/', () => {
        // The Perl modules ship on CPAN now, so the scaffold pulls them
        // via `cpanm --installdeps .` instead of vendoring copies. A
        // stray lib/ would shadow the installed dist (app.pl no longer
        // adds it to @INC anyway).
        expect(existsSync(path.join(projectDir, 'lib', 'BarefootJS.pm'))).toBe(false)
      })

      test('cpanfile declares the BarefootJS Perl deps + Mojolicious', () => {
        // `Mojolicious::Plugin::BarefootJS` (the plugin + dev-reload
        // plugin + BarefootJS::Backend::Mojo) and `BarefootJS` (core)
        // are declared so `cpanm --installdeps .` installs everything
        // `plugin 'BarefootJS'` / `plugin 'BarefootJS::DevReload'` need
        // at boot.
        const cp = readFileSync(path.join(projectDir, 'cpanfile'), 'utf-8')
        expect(cp).toMatch(/^requires 'BarefootJS'/m)
        expect(cp).toMatch(/^requires 'Mojolicious::Plugin::BarefootJS'/m)
        expect(cp).toMatch(/^requires 'Mojolicious'/m)
      })

      test('plugin auto-loads manifest — no per-route register_components_from_manifest call', () => {
        // After #1416, `Mojolicious::Plugin::BarefootJS` reads the
        // build manifest at plugin-register time and installs a
        // `before_render` hook that wires up child renderers and
        // seeds the stash automatically. The scaffold's `app.pl`
        // therefore no longer mentions either symbol directly — the
        // user can `bf add <component>` and refresh the browser
        // without touching the Perl file.
        const app = readFileSync(path.join(projectDir, 'app.pl'), 'utf-8')
        expect(app).not.toContain('register_components_from_manifest')
        expect(app).not.toContain("app->home->child('dist/templates/manifest.json')")
      })

      test('barefoot.config.ts targets the mojolicious adapter', () => {
        const cfg = readFileSync(path.join(projectDir, 'barefoot.config.ts'), 'utf-8')
        expect(cfg).toContain("from '@barefootjs/mojolicious/build'")
        expect(cfg).toContain("clientJsBasePath: '/static/components/'")
      })

      test('layout stylesheets point at /static/*.css', () => {
        // The forwarding `/static/*asset` route serves these from
        // `public/`, so the `<link href>`s in the rendered HTML must
        // match. A drift here would make every page render unstyled.
        const app = readFileSync(path.join(projectDir, 'app.pl'), 'utf-8')
        expect(app).toContain('/static/tokens.css')
        expect(app).toContain('/static/styles.css')
        expect(app).toContain('/static/uno.css')
      })
    })

    // -------------------------------------------------------------------------
    // Mojo-specific: dev-reload wiring (detailed)
    // -------------------------------------------------------------------------

    describe('dev reload wiring', () => {
      test('app.pl registers the DevReload plugin', () => {
        const app = readFileSync(path.join(projectDir, 'app.pl'), 'utf-8')
        expect(app).toContain("plugin 'BarefootJS::DevReload'")
      })

      test('layout calls bf_dev_snippet inside <body>', () => {
        // Snippet must land inside `<body>` so the inline `<script>`
        // executes after the page elements are parsed; emitting it
        // in `<head>` would race scroll-restoration against the page content.
        const app = readFileSync(path.join(projectDir, 'app.pl'), 'utf-8')
        const body = app.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? ''
        expect(body).toContain('bf_dev_snippet')
      })
    })

    // -------------------------------------------------------------------------
    // Next-step instructions
    // -------------------------------------------------------------------------

    test('the printed next-step uses the chosen target directory', () => {
      expect(result.stdout).toContain('cd mojo-app')
    })
  },
)
