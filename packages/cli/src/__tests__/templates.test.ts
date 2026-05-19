import { describe, test, expect } from 'bun:test'
import { ADAPTERS, DEFAULT_ADAPTER, CSS_LIBRARIES, DEFAULT_CSS_LIBRARY } from '../lib/templates'

describe('adapter registry', () => {
  test('default adapter is registered', () => {
    expect(ADAPTERS[DEFAULT_ADAPTER]).toBeDefined()
  })

  test('default adapter is hono', () => {
    expect(DEFAULT_ADAPTER).toBe('hono')
  })

  test.each(['hono', 'hono-node', 'echo', 'mojo', 'csr'])('%s adapter is registered', id => {
    expect(ADAPTERS[id]).toBeDefined()
  })

  test('hono and hono-node disambiguate via shortLabel in confirmation', () => {
    // Both have "Hono" as the root noun, so the menu confirmation
    // would collapse to the same word without an explicit shortLabel.
    expect(ADAPTERS.hono.shortLabel).toBe('Hono / Cloudflare Workers')
    expect(ADAPTERS['hono-node'].shortLabel).toBe('Hono / Node')
  })

  test('only hono (Cloudflare Workers) advertises a deploy story', () => {
    // The CW variant has a one-command deploy via wrangler; the Node
    // variant doesn't bind to a specific host so init suppresses the
    // post-scaffold Deploy section.
    expect(ADAPTERS.hono.deploy?.target).toBe('Cloudflare Workers')
    expect(ADAPTERS['hono-node'].deploy).toBeUndefined()
  })

  test('hono-node wires dev-reload through the @barefootjs/hono library', () => {
    // factory.ts owns the SSE endpoint as a single constant and mounts
    // the middleware; renderer.tsx places <BfDevReload /> which reads
    // the endpoint off the request context. No project-side snippet
    // file: the library's boot-id based middleware handles
    // reconnection cleanly across `tsx watch` server restarts (the
    // old fs-watch reloader fired its reload event before the new
    // server was ready, which left the browser one edit behind).
    const honoNode = ADAPTERS['hono-node']
    expect(honoNode.files['dev-reload.tsx']).toBeUndefined()
    expect(honoNode.files['factory.ts']).toContain('barefootDevReload')
    expect(honoNode.files['factory.ts']).toContain("DEV_RELOAD_ENDPOINT = '/_bf/reload'")
    expect(honoNode.files['renderer.tsx']).toContain('BfDevReload')
    expect(honoNode.files['renderer.tsx']).not.toContain("from './dev-reload'")
  })

  test('hono-node centralises NODE_ENV checks in env.ts', () => {
    // Generated files import `isDev` / `isProd` from env.ts instead of
    // sprinkling `process.env.NODE_ENV` calls across the project.
    const honoNode = ADAPTERS['hono-node']
    expect(honoNode.files['env.ts']).toContain('export const isProd')
    expect(honoNode.files['env.ts']).toContain('export const isDev')
    expect(honoNode.files['factory.ts']).toContain("from './env'")
    expect(honoNode.files['renderer.tsx']).toContain("from './env'")
    // @types/node provides the `process` type the env file relies on.
    expect(honoNode.devDependencies['@types/node']).toBeTruthy()
  })

  // Regression guards for the "edits don't reach the browser" class
  // of bug. Each adapter that does SSR has to invalidate *something*
  // per request in dev — otherwise the boot-time render cache buries
  // every `bf build --watch` rebuild.
  //
  // We've shipped this bug twice (hono-node held a stale build
  // manifest, echo cached the parsed templates). These tests pin the
  // contract so the next adapter that forgets to thread dev re-read
  // through fails CI loudly instead of silently in someone's hand
  // test.
  describe('dev-time re-read contract', () => {
    test('hono-node renderer reads the manifest per request in dev', () => {
      const renderer = ADAPTERS['hono-node'].files['renderer.tsx']
      // Reads the JSON from disk each time (not just a static import).
      expect(renderer).toContain("from 'node:fs'")
      expect(renderer).toMatch(/readFileSync\(.*manifest/i)
      // Behind a dev gate — prod keeps the cheap static import.
      expect(renderer).toMatch(/isDev \? .*: staticManifest/)
    })

    test('echo centralises dev/prod detection in env.go via APP_ENV', () => {
      // The Go web-app convention is APP_ENV (not BAREFOOT_DEV).
      // Centralising in env.go means a future second dev gate
      // (debug headers, verbose errors, ...) doesn't grow a parallel
      // os.Getenv read somewhere else.
      const env = ADAPTERS.echo.files['env.go']
      expect(env).toContain('func IsDev() bool')
      expect(env).toMatch(/os\.Getenv\("APP_ENV"\) != "production"/)
      // bf_render.go consults IsDev() rather than reading the env
      // var itself.
      const bfRender = ADAPTERS.echo.files['bf_render.go']
      expect(bfRender).toContain('IsDev()')
      expect(bfRender).not.toContain('BAREFOOT_DEV')
      // Dev script doesn't need to export anything — unset APP_ENV
      // = dev by default.
      expect(ADAPTERS.echo.scripts.dev).not.toContain('BAREFOOT_DEV')
      expect(ADAPTERS.echo.scripts.dev).not.toContain('APP_ENV=')
    })

    test('echo re-parses templates per request in dev', () => {
      const bfRender = ADAPTERS.echo.files['bf_render.go']
      // Render method consults a devMode flag and re-loads templates.
      expect(bfRender).toMatch(/devMode\s+bool/)
      expect(bfRender).toMatch(/if r\.devMode/)
    })

    test('echo ships SSE-based browser auto-reload (fsnotify + boot-id)', () => {
      const bfRender = ADAPTERS.echo.files['bf_render.go']
      // Server side: middleware mounts /_bf/reload SSE endpoint, a
      // dist/templates fsnotify watcher broadcasts to every live
      // SSE client on each `bf build --watch` write, and the
      // initial handshake compares Last-Event-ID against the
      // per-process bootID so a Go restart also triggers a reload.
      expect(bfRender).toContain('DevReloadMiddleware')
      expect(bfRender).toContain('/_bf/reload')
      expect(bfRender).toContain('bootID')
      expect(bfRender).toContain('Last-Event-ID')
      expect(bfRender).toContain('fsnotify')
      expect(bfRender).toContain('startTemplateWatcher')
      expect(bfRender).toContain('broadcastReload')
      // Browser side: snippet returned by DevReloadScript subscribes
      // and calls location.reload().
      expect(bfRender).toContain('DevReloadScript')
      expect(bfRender).toContain('EventSource')
      // main.go wires the middleware; renderer.go drops the snippet
      // into <body>.
      expect(ADAPTERS.echo.files['main.go']).toContain('DevReloadMiddleware()')
      expect(ADAPTERS.echo.files['renderer.go']).toContain('DevReloadScript()')
      // fsnotify must land in go.mod so `go mod tidy` picks it up.
      expect(ADAPTERS.echo.files['go.mod']).toContain('github.com/fsnotify/fsnotify')
    })

    test('mojo route handler is a one-liner — plugin auto-seeds stash', () => {
      // After #1416 the manifest carries each component's prop /
      // signal / memo defaults, and the `BarefootJS` plugin's
      // `before_render` hook stashes them automatically. The
      // route handler is left as a single `$c->render(...)` line
      // so adding a new UI component via `bf add badge` doesn't
      // require parallel edits to `app.pl`.
      const appPl = ADAPTERS.mojo.files['app.pl']
      expect(appPl).toMatch(/\$c->render\(template => 'Counter', layout => 'default'\)/)
      expect(appPl).not.toMatch(/signal_init\s*=>/)
      expect(appPl).not.toMatch(/_scope_id\(/)
    })

    test('mojo disables template cache in development mode', () => {
      // Mojolicious caches parsed templates by default. `morbo`
      // (the dev server in the `dev` npm script) sets mode to
      // 'development' automatically, so the cache flush below kicks
      // in and `bf build --watch` edits surface immediately.
      const appPl = ADAPTERS.mojo.files['app.pl']
      expect(appPl).toMatch(/app->mode eq 'development'/)
      expect(appPl).toMatch(/renderer->cache->max_keys\(0\)/)
      // dev script must launch via morbo (which auto-enables dev
      // mode). Plain `perl app.pl daemon` would default to
      // production and re-introduce the cache.
      expect(ADAPTERS.mojo.scripts.dev).toMatch(/morbo app\.pl/)
    })
  })

  // Regression guard for the "flash of unstyled content" bug.
  // styles.css used to chain tokens.css and uno.css via @import,
  // which deferred them to a second round-trip and left the DOM
  // visible without styles in between. Each adapter's HTML layout
  // must link all three sheets directly so the browser fetches them
  // in parallel.
  describe('CSS link contract (no @import FOUC)', () => {
    // shared.ts ships STYLES_CSS to every adapter. If anyone
    // re-introduces @import here it propagates to every scaffold,
    // so guard at the source.
    test('STYLES_CSS does not @import tokens.css or uno.css', () => {
      // Sample via the hono adapter (which we know uses STYLES_CSS).
      const styles = ADAPTERS.hono.files['public/styles.css']
      expect(styles).not.toMatch(/@import\s+url\(['"]\.\/tokens\.css['"]\)/)
      expect(styles).not.toMatch(/@import\s+url\(['"]\.\/uno\.css['"]\)/)
    })

    // [adapter id, file holding the <head> markup, all three href regexes]
    const layoutCases: Array<[string, string, RegExp[]]> = [
      ['hono', 'renderer.tsx', [
        /href="\/tokens\.css"/,
        /href="\/styles\.css"/,
        /href="\/uno\.css"/,
      ]],
      ['hono-node', 'renderer.tsx', [
        /href="\/static\/tokens\.css"/,
        /href="\/static\/styles\.css"/,
        /href="\/static\/uno\.css"/,
      ]],
      ['echo', 'renderer.go', [
        /href="\/static\/tokens\.css"/,
        /href="\/static\/styles\.css"/,
        /href="\/static\/uno\.css"/,
      ]],
      // mojo embeds layouts inline in app.pl (Mojolicious @@ DATA
      // section), so we check the script file rather than a separate
      // template file.
      ['mojo', 'app.pl', [
        /href="\/static\/tokens\.css"/,
        /href="\/static\/styles\.css"/,
        /href="\/static\/uno\.css"/,
      ]],
      ['csr', 'pages/index.html', [
        /href="\/static\/tokens\.css"/,
        /href="\/static\/styles\.css"/,
        /href="\/static\/uno\.css"/,
      ]],
    ]
    test.each(layoutCases)('%s/%s links tokens + styles + uno', (id, file, links) => {
      const contents = ADAPTERS[id].files[file]
      expect(contents, `${id} missing ${file}`).toBeTruthy()
      for (const link of links) {
        expect(contents).toMatch(link)
      }
    })
  })

  test('every adapter has a label, port, and barefoot.config.ts file', () => {
    for (const [id, adapter] of Object.entries(ADAPTERS)) {
      expect(adapter.label, `${id} missing label`).toBeTruthy()
      expect(adapter.port, `${id} missing port`).toBeGreaterThan(0)
      expect(adapter.files['barefoot.config.ts'], `${id} missing barefoot.config.ts`).toBeTruthy()
    }
  })

  test('every adapter contributes a Counter component', () => {
    for (const [id, adapter] of Object.entries(ADAPTERS)) {
      expect(
        adapter.files['components/Counter.tsx'],
        `${id} missing components/Counter.tsx`,
      ).toBeTruthy()
    }
  })

  test('echo bundles the vendored Go runtime', () => {
    const echo = ADAPTERS.echo
    expect(echo.files['bf-runtime/bf.go']).toMatch(/package bf/)
    expect(echo.files['bf-runtime/streaming.go']).toBeTruthy()
    expect(echo.files['bf-runtime/go.mod']).toMatch(/^module github\.com\/barefootjs\/runtime\/bf/m)
    expect(echo.files['go.mod']).toMatch(/replace github\.com\/barefootjs\/runtime\/bf => \.\/bf-runtime/)
  })

  test('mojo bundles the vendored Perl plugin', () => {
    const mojo = ADAPTERS.mojo
    expect(mojo.files['lib/BarefootJS.pm']).toMatch(/^package BarefootJS;/m)
    expect(mojo.files['lib/Mojolicious/Plugin/BarefootJS.pm']).toMatch(/^package Mojolicious::Plugin::BarefootJS;/m)
    expect(mojo.files['cpanfile']).toMatch(/^requires 'Mojolicious'/m)
  })

  test('csr scaffolds a static HTML page + Bun server', () => {
    const csr = ADAPTERS.csr
    expect(csr.files['server.ts']).toMatch(/Bun\.serve/)
    expect(csr.files['pages/index.html']).toMatch(/<div id="app">/)
    expect(csr.files['pages/index.html']).toMatch(/@barefootjs\/client\/runtime/)
    expect(csr.files['barefoot.config.ts']).toMatch(/@barefootjs\/client\/build/)
  })
})

describe('CSS library registry', () => {
  test('default CSS library is registered', () => {
    expect(CSS_LIBRARIES[DEFAULT_CSS_LIBRARY]).toBeDefined()
  })

  test('default CSS library is unocss', () => {
    expect(DEFAULT_CSS_LIBRARY).toBe('unocss')
  })

  test('every CSS library entry has a label', () => {
    for (const [id, lib] of Object.entries(CSS_LIBRARIES)) {
      expect(lib.label, `CSS library ${id} missing label`).toBeTruthy()
    }
  })
})
