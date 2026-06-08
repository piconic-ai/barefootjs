import { describe, test, expect } from 'bun:test'
import { ADAPTERS, DEFAULT_ADAPTER, CSS_LIBRARIES, DEFAULT_CSS_LIBRARY } from '../lib/templates'

describe('adapter registry', () => {
  test('default adapter is registered', () => {
    expect(ADAPTERS[DEFAULT_ADAPTER]).toBeDefined()
  })

  test('default adapter is hono', () => {
    expect(DEFAULT_ADAPTER).toBe('hono')
  })

  test.each(['hono', 'hono-node', 'echo', 'gin', 'chi', 'nethttp', 'mojo', 'xslate', 'csr'])(
    '%s adapter is registered',
    id => {
      expect(ADAPTERS[id]).toBeDefined()
    },
  )

  test.each(['gin', 'chi', 'nethttp'])(
    '%s Go adapter scaffolds the shared Go runtime + render glue',
    id => {
      const adapter = ADAPTERS[id]
      // Framework-specific entry files.
      expect(adapter.files['main.go']).toBeDefined()
      expect(adapter.files['bf_render.go']).toBeDefined()
      expect(adapter.files['go.mod']).toContain('barefoot-app')
      // Shared Go pieces every Go adapter contributes.
      expect(adapter.files['renderer.go']).toContain('func defaultLayout')
      expect(adapter.files['env.go']).toContain('func IsDev')
      // Vendored runtime, including the bfdev subpackage the dev
      // auto-reload handler lives in.
      expect(adapter.files['bf-runtime/bf.go']).toContain('package bf')
      expect(adapter.files['bf-runtime/bfdev/bfdev.go']).toContain('package bfdev')
      expect(adapter.files['go.mod']).toContain(
        'replace github.com/barefootjs/runtime/bf => ./bf-runtime',
      )
      // The render bridge wires the dev auto-reload endpoint + snippet.
      expect(adapter.files['bf_render.go']).toContain('/_bf/reload')
      expect(adapter.files['bf_render.go']).toContain('bfdev.Snippet')
      // Client JS and public assets are served from disjoint prefixes
      // (so Gin's router tree doesn't panic on nested catch-alls).
      expect(adapter.files['barefoot.config.ts']).toContain("clientJsBasePath: '/client/'")
    },
  )

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

  test('hono-node tsconfig keeps dist/components in JSX-transform scope', () => {
    // The server imports the compiled SSR templates from dist/components
    // (via the @/components/* path mapping). `tsx` applies the JSX
    // transform per-file, honouring this tsconfig's include/exclude — so
    // excluding dist/components strips `jsxImportSource` from those .tsx
    // files and SSR throws `ReferenceError: React is not defined` on the
    // first render. Pin that they stay in scope.
    const tsconfig = ADAPTERS['hono-node'].files['tsconfig.json']
    expect(tsconfig).toContain('"jsxImportSource": "@barefootjs/hono/jsx"')
    const excludeMatch = tsconfig.match(/"exclude":\s*\[([^\]]*)\]/)
    expect(excludeMatch).not.toBeNull()
    expect(excludeMatch![1]).not.toContain('dist/components')
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
      // xslate embeds the layout inline in app.psgi (a Perl heredoc).
      ['xslate', 'app.psgi', [
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

  test('mojo declares its BarefootJS Perl deps via cpanfile (not vendored lib/)', () => {
    const mojo = ADAPTERS.mojo
    // The Perl modules ship on CPAN now, so the scaffold pulls them via
    // `cpanm --installdeps .` rather than vendoring `.pm` copies under lib/.
    // `Mojolicious::Plugin::BarefootJS` ships the plugin, the dev-reload
    // plugin, and `BarefootJS::Backend::Mojo`; `BarefootJS` is the core
    // runtime. Both are declared explicitly alongside Mojolicious.
    const cpanfile = mojo.files['cpanfile']
    expect(cpanfile).toMatch(/^requires 'BarefootJS'/m)
    expect(cpanfile).toMatch(/^requires 'Mojolicious::Plugin::BarefootJS'/m)
    expect(cpanfile).toMatch(/^requires 'Mojolicious'/m)
    // Nothing vendored: the scaffold ships no .pm files, and app.pl no
    // longer prepends a local lib/ dir to @INC.
    const vendored = Object.keys(mojo.files).filter(f => f.endsWith('.pm'))
    expect(vendored).toEqual([])
    expect(mojo.files['app.pl']).not.toContain("use lib 'lib'")
  })

  test('xslate scaffolds a Plack/PSGI app rendering via Text::Xslate', () => {
    const xslate = ADAPTERS.xslate
    // Plain Plack/PSGI entry — no web framework. Renders the runtime via
    // BarefootJS::Backend::Xslate.
    expect(xslate.files['app.psgi']).toMatch(/use Plack::Builder/)
    expect(xslate.files['app.psgi']).toContain('BarefootJS::Backend::Xslate')
    // Dev-reload SSE endpoint, gated to dev, with the snippet in <body>.
    expect(xslate.files['app.psgi']).toContain('/_bf/reload')
    expect(xslate.files['app.psgi']).toContain('BarefootJS::DevReload->snippet')
    // CPAN deps declared (not vendored): the Xslate backend, Text::Xslate,
    // and Plack/Starman for serving.
    const cpanfile = xslate.files['cpanfile']
    expect(cpanfile).toMatch(/^requires 'BarefootJS::Backend::Xslate'/m)
    expect(cpanfile).toMatch(/^requires 'Text::Xslate'/m)
    expect(cpanfile).toMatch(/^requires 'Starman'/m)
    expect(Object.keys(xslate.files).filter(f => f.endsWith('.pm'))).toEqual([])
    // Config targets the xslate build factory.
    expect(xslate.files['barefoot.config.ts']).toContain("from '@barefootjs/xslate/build'")
    // Starter Counter is self-contained (native buttons, no registry fetch).
    expect(xslate.bundledRegistryComponents).toEqual([])
    expect(xslate.files['components/Counter.tsx']).toContain('<button')
  })

  test('csr scaffolds a static HTML page + node:http server (no Bun runtime)', () => {
    const csr = ADAPTERS.csr
    // Plain node:http so an npm / pnpm / yarn user isn't forced to
    // install Bun. Runs via `tsx` like the hono-node starter.
    expect(csr.files['server.ts']).toMatch(/from 'node:http'/)
    expect(csr.files['server.ts']).toMatch(/createServer\(/)
    expect(csr.files['server.ts']).not.toMatch(/\bBun\./)
    expect(csr.scripts.start).toBe('tsx server.ts')
    expect(csr.devDependencies.tsx).toBeTruthy()
    expect(csr.devDependencies['@types/bun']).toBeUndefined()
    expect(csr.files['pages/index.html']).toMatch(/<div id="app">/)
    expect(csr.files['pages/index.html']).toMatch(/@barefootjs\/client\/runtime/)
    expect(csr.files['barefoot.config.ts']).toMatch(/@barefootjs\/client\/build/)
  })

  // Recurring regression guard (this has bitten us more than once): a
  // scaffold must run under whatever package manager / runtime the user
  // already has. The Bun *global* API (`Bun.serve`, `Bun.file`, ...) and
  // Bun-only modules (`import ... from 'bun'` / `'bun:sqlite'`) only work
  // under the Bun runtime, and a bare `bun` / `bunx` token in a script
  // hard-wires the Bun binary. None of our adapters target Bun
  // specifically — they target Go, Perl, Cloudflare Workers, or
  // Node-via-tsx — so no scaffolded file or script should force Bun onto
  // a user who picked npm / pnpm / yarn. PM-aware scripts are rendered
  // here with a NON-bun PM precisely so a `bunx` that's only correct
  // when pm=bun would still trip this guard.
  describe('no adapter forces the Bun runtime on users', () => {
    const NON_BUN_PM = 'npm' as const

    // Only JS/TS scaffold files can actually execute the Bun global API —
    // the Go/Perl runtimes can't, and their doc comments legitimately
    // mention `Bun.serve` (idle-timeout trivia). Scope the content check
    // to the files where a Bun-ism would really run.
    const isJsLike = (file: string) => /\.(m|c)?[jt]sx?$/.test(file)

    test.each(Object.keys(ADAPTERS))(
      '%s JS/TS scaffold files use no Bun-only global API or module',
      (id) => {
        for (const [file, contents] of Object.entries(ADAPTERS[id].files)) {
          if (!isJsLike(file)) continue
          expect(
            contents,
            `${id}/${file} calls the Bun-only global API`,
          ).not.toMatch(/\bBun\.(serve|file|write|spawn|spawnSync|env|build|\$|connect|listen)\b/)
          expect(
            contents,
            `${id}/${file} imports a Bun-only module`,
          ).not.toMatch(/from\s+['"]bun(:[a-z]+)?['"]/)
        }
      },
    )

    test.each(Object.keys(ADAPTERS))(
      '%s scripts do not invoke the bun runtime for a non-bun PM',
      (id) => {
        for (const [name, value] of Object.entries(ADAPTERS[id].scripts)) {
          const rendered = typeof value === 'function' ? value(NON_BUN_PM) : value
          expect(
            rendered,
            `${id} script "${name}" forces the bun runtime: ${rendered}`,
          ).not.toMatch(/\bbunx?\b/)
        }
      },
    )

    // Scaffold files and prereq warnings have no package-manager context
    // to render against (unlike scripts), so a literal `bun run` /
    // `bun install` / `bunx` token there is always wrong for an
    // npm/pnpm/yarn user — it tells them to drive their project with a
    // runtime they didn't pick. Generated Go source ("did you run
    // `bf build`?") and prereq warnings ("...before starting the dev
    // server") must stay PM-neutral. The Bun *global API* is covered
    // separately above; this catches the command-string form.
    const BUN_COMMAND = /\bbunx\b|\bbun\s+(run|install|add|create|x|--watch)\b|\bbun\s+server\b/

    test.each(Object.keys(ADAPTERS))(
      '%s scaffold files hardcode no bun command',
      (id) => {
        for (const [file, contents] of Object.entries(ADAPTERS[id].files)) {
          expect(
            contents,
            `${id}/${file} hardcodes a bun command (should be PM-neutral / use \`bf\`)`,
          ).not.toMatch(BUN_COMMAND)
        }
      },
    )

    test.each(Object.keys(ADAPTERS))(
      '%s prereq warnings hardcode no bun command',
      (id) => {
        for (const warning of ADAPTERS[id].prereqWarnings()) {
          expect(
            warning,
            `${id} prereq warning hardcodes a bun command: ${warning}`,
          ).not.toMatch(BUN_COMMAND)
        }
      },
    )
  })

  // Every adapter must ship a `.gitignore` so the user's first
  // `git init && git add .` doesn't stage every generated file
  // (compiled SSR templates, regenerated uno.css, build cache,
  // dev-server scratch). `docs/core/quick-start.md` promises this
  // for the Hono target; the contract extends to every adapter
  // since each one carries its own outDir + dev-state directories.
  // See onboarding round 5 / PR #1450.
  test.each(['hono', 'hono-node', 'csr', 'mojo', 'xslate', 'echo'])(
    '%s adapter ships a .gitignore that covers the shared base',
    (id) => {
      const gitignore = ADAPTERS[id].files['.gitignore']
      expect(gitignore).toBeDefined()
      // Shared base (every adapter, via buildGitignore).
      expect(gitignore).toContain('node_modules/')
      expect(gitignore).toContain('public/uno.css')
      expect(gitignore).toContain('.DS_Store')
    },
  )

  test('hono adapter .gitignore covers public-as-outDir specifics, not whole-public', () => {
    // Hono's outDir IS `public/`, so we have to thread the needle:
    // ignore `public/components/` + `public/.buildcache.json` +
    // `public/.bfemit.json` but commit `public/styles.css` /
    // `public/tokens.css`. Other adapters use `dist/` so a single
    // line covers their build output; only Hono needs the per-file split.
    const gitignore = ADAPTERS.hono.files['.gitignore']!
    expect(gitignore).toContain('.wrangler/')
    expect(gitignore).toContain('public/components/')
    expect(gitignore).toContain('public/.buildcache.json')
    expect(gitignore).toContain('public/.bfemit.json')
    // Negative guard: hand-written starter assets must NOT be ignored.
    expect(gitignore).not.toMatch(/^public\/styles\.css/m)
    expect(gitignore).not.toMatch(/^public\/tokens\.css/m)
    // Negative guard: don't ignore `public/` wholesale — that would
    // hide the committed CSS too.
    expect(gitignore).not.toMatch(/^public\/?\s*$/m)
  })

  test.each(['hono-node', 'csr', 'mojo', 'xslate', 'echo'])(
    '%s adapter .gitignore ignores `dist/` as the build output root',
    (id) => {
      expect(ADAPTERS[id].files['.gitignore']!).toMatch(/^dist\/?\s*$/m)
    },
  )

  test('echo adapter .gitignore covers the `go build` artifacts', () => {
    // `go build` drops a binary named after the project dir in the
    // working directory by default. The pattern `/main` covers the
    // common case the scaffold ships (main.go entrypoint), and
    // `*.exe` / `*.test` / `*.out` cover the platform / test
    // variants without enumerating every project-rename case.
    const gitignore = ADAPTERS.echo.files['.gitignore']!
    expect(gitignore).toContain('/main')
    expect(gitignore).toContain('*.exe')
    expect(gitignore).toContain('*.test')
  })

  test('mojo adapter .gitignore covers Perl-side scratch (`local/`, `log/`)', () => {
    const gitignore = ADAPTERS.mojo.files['.gitignore']!
    expect(gitignore).toContain('local/')
    expect(gitignore).toContain('log/')
  })

  test('hono scaffold tsconfig + devDeps stay PM-agnostic; init.ts resolves per detected PM', () => {
    // The adapter map carries a `{{__PM_TYPES_ENTRY__}}` placeholder
    // in `tsconfig.json`'s `types` array and ships zero PM-specific
    // devDependencies. init.ts resolves both at scaffold time
    // against the user's detected PM — today only bun contributes
    // (`bun-types` + `@types/bun`); npm / pnpm / yarn collapse the
    // placeholder to an empty string and ship the adapter's base
    // devDeps unchanged. The contract pinned here is "the adapter
    // surface is PM-agnostic", so a future PM / test runner that
    // needs its own types can plug into the same slot in init.ts
    // without reshaping the adapter map. See onboarding round 5 /
    // PR #1450.
    const hono = ADAPTERS.hono
    // Adapter ships the PM-extension placeholder, not a baked-in
    // bun-types literal — and the slot prefix carries its own
    // separator so the empty case stays a valid JSON array. Match
    // against the rendered `types` array specifically so the
    // assertion isn't fooled by the comment block that mentions
    // the literal name for documentation purposes.
    expect(hono.files['tsconfig.json']).toContain('{{__PM_TYPES_ENTRY__}}')
    expect(hono.files['tsconfig.json']).toMatch(
      /"types":\s*\[\s*"@cloudflare\/workers-types",\s*"node"\{\{__PM_TYPES_ENTRY__\}\}\s*\]/,
    )
    // Static devDeps don't presume any PM. init.ts merges the
    // PM-specific entries (today: `@types/bun` when bun) onto this.
    expect(hono.devDependencies['@types/bun']).toBeUndefined()
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
