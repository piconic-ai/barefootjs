// Shared scaffold pieces for the Go web-framework adapters
// (Gin / Chi / net/http).
//
// Each Go adapter scaffolds a runnable SSR app with the BarefootJS
// runtime vendored under `./bf-runtime` (a `replace` directive in
// `go.mod` keeps imports stable). The runtime sources are inlined into
// the CLI bundle by `scripts/embed-runtimes.mjs`, so the scaffold is
// self-contained — no network fetch, no monorepo path leaks.
//
// The framework-specific files (`main.go`, `bf_render.go`, the `go.mod`
// require block) live in the per-framework adapter modules; everything
// that does NOT depend on the chosen router lives here so the three Go
// adapters can't drift apart.
//
// URL scheme (kept disjoint so every router — including Gin's
// httprouter tree, which panics on nested catch-alls — can serve both):
//   - `/client/*`  → compiled client JS (dist/client)
//   - `/static/*`  → public assets (CSS under public/)
//
// File layout, by ownership:
//   - `main.go`      — application: routes + server start (the user's
//     day-to-day workspace).
//   - `renderer.go`  — user-customizable `defaultLayout` (the Go
//     equivalent of Hono's `renderer.tsx`).
//   - `bf_render.go` — generated boilerplate (template loader + render
//     bridge + dev auto-reload). Marked DO NOT EDIT; init seeds it once.

import { execSync } from 'node:child_process'
import {
  buildGitignore,
  CSS_LINKS_BEGIN,
  CSS_LINKS_END,
  SHARED_COUNTER_TSX,
  SHARED_COUNTER_TEST_TSX,
  STYLES_CSS,
  TOKENS_CSS,
  UNOCSS_DEV_DEPENDENCIES,
  UNO_CSS_PLACEHOLDER,
  unoConfigTs,
} from './shared'
import {
  bfdevGoSource,
  bfGoSource,
  streamingGoSource,
} from './runtimes.generated'
import type { AdapterTemplate, AdapterScriptValue } from '../templates'

// We don't ship the upstream `bf-runtime/go.mod` as-is — it pins the
// Go version to whatever the monorepo developer happens to be on.
// Override with a permissive `go 1.22` floor so the scaffold runs on
// any reasonably current Go install.
const GO_BF_RUNTIME_GO_MOD = `module github.com/barefootjs/runtime/bf

go 1.22
`

export const GO_BAREFOOT_CONFIG_TS = `import { createConfig } from '@barefootjs/go-template/build'

export default createConfig({
  paths: {
    components: 'components/ui',
    tokens: 'tokens',
    meta: 'meta',
  },
  components: ['components'],
  outDir: 'dist',
  adapterOptions: {
    packageName: 'main',
    // Compiled client bundles are served from /client/ (see main.go).
    clientJsBasePath: '/client/',
    barefootJsPath: '/client/barefoot.js',
  },
  // Generated Go struct types for every component, written next to main.go.
  // Overwritten on every \`bf build\` run.
  typesOutputFile: 'components.go',
})
`

// User-customizable layout: the Go equivalent of \`renderer.tsx\` for
// Hono. Adjust the surrounding HTML, swap in additional <link> /
// <script> tags, etc. The dev auto-reload snippet is injected
// automatically by bf_render.go, so this file stays free of dev
// concerns.
export const GO_RENDERER_GO = `package main

import (
	"fmt"

	bf "github.com/barefootjs/runtime/bf"
)

// defaultLayout is the wrapping HTML the BarefootJS render pipeline
// hands every component. Edit freely — this file is yours.
func defaultLayout(ctx *bf.RenderContext) string {
	return fmt.Sprintf(\`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>%s</title>
	${CSS_LINKS_BEGIN}
	<!-- Link all three sheets so the browser fetches them in parallel —
	     chaining via styles.css @import would defer tokens/uno to a
	     second round-trip and flash unstyled DOM. tokens first so its
	     CSS variables are defined before any rule references them. -->
	<link rel="stylesheet" href="/static/tokens.css" />
	<link rel="stylesheet" href="/static/styles.css" />
	<link rel="stylesheet" href="/static/uno.css" />
	${CSS_LINKS_END}
</head>
<body>
	<main>%s</main>
	%s
	%s
</body>
</html>\`,
		ctx.Title,
		ctx.ComponentHTML,
		ctx.Portals,
		ctx.Scripts,
	)
}
`

// Centralised dev/prod flag mirrored across BarefootJS scaffolds.
// We follow the Go web-app convention of APP_ENV — anything other
// than "production" enables dev affordances (template re-parse,
// /_bf/reload SSE).
export const GO_ENV_GO = `package main

import "os"

// IsDev reports whether the server is running in development mode.
// Driven by APP_ENV — \`production\` flips into prod mode; anything
// else (including unset) is dev.
func IsDev() bool {
	return os.Getenv("APP_ENV") != "production"
}
`

export const GO_TSCONFIG = `{
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
  "exclude": ["node_modules", "dist", "bf-runtime"]
}
`

// Go scaffold: `dist/` is the bf build output (templates + client JS +
// manifest). The compiled Go binary lands next to `main.go` and is
// named after the project directory — too dynamic to enumerate, so
// cover it with the wildcard pattern `go build` produces by default.
const GO_GITIGNORE = buildGitignore([
  {
    heading: 'bf build outputs (regenerated by `bf build` / `bf build --watch`)',
    entries: ['dist/'],
  },
  {
    heading: 'Compiled Go binary (`go build` writes alongside main.go)',
    entries: ['/main', '*.exe', '*.test', '*.out'],
  },
  {
    heading: 'Local environment',
    entries: ['.env', '.env.local', '.env.*.local'],
  },
])

/**
 * The render-glue shared by every Go adapter's `bf_render.go`:
 * `loadTemplates` (recursive .tmpl walk + the Slot/Tag escape-pass
 * stub) and `layoutWithDev` (wraps the user's `defaultLayout` with the
 * dev auto-reload snippet). Framework-specific files prepend their own
 * `package` clause, imports, and render bridge around this body.
 */
export const GO_RENDER_SHARED_FNS = `// loadTemplates walks dist/templates/ recursively and parses every
// .tmpl file. ParseGlob("dist/templates/*.tmpl") only catches the
// top-level directory, missing per-component subdirectories like
// dist/templates/ui/button/index.tmpl that a parent invokes via
// {{template "Button" ...}}.
//
// Also registers a no-op "Tag" template so html/template's escape pass
// (which validates references in unreachable branches too) doesn't
// crash the first call to any template that transitively includes Slot
// — the go-template adapter emits a {{template "Tag" ...}} reference
// inside Slot that's only reachable when AsChild=true.
func loadTemplates() (*template.Template, error) {
	root := template.New("").Funcs(bf.FuncMap())
	if _, err := root.New("Tag").Parse(""); err != nil {
		return nil, err
	}
	err := filepath.WalkDir("dist/templates", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || filepath.Ext(path) != ".tmpl" {
			return nil
		}
		_, parseErr := root.ParseFiles(path)
		return parseErr
	})
	return root, err
}

// layoutWithDev wraps the user's defaultLayout (renderer.go) with the
// dev auto-reload snippet, injected just before </body>. In production
// (APP_ENV=production) the snippet is empty and the layout passes
// through unchanged.
func layoutWithDev(ctx *bf.RenderContext) string {
	html := defaultLayout(ctx)
	snippet := bfdev.Snippet(bfdev.Config{Disabled: !IsDev()})
	if snippet == "" {
		return html
	}
	return strings.Replace(html, "</body>", string(snippet)+"\\n</body>", 1)
}

// mustNewRenderer loads templates once at startup and pairs them with
// layoutWithDev. On parse failure we surface the cause to stderr and
// exit non-zero, so the cause shows up before the Go panic stack trace.
func mustNewRenderer() *bf.Renderer {
	tmpl, err := loadTemplates()
	if err != nil {
		fmt.Fprintf(os.Stderr, "barefoot: failed to load templates from dist/templates: %v\\n", err)
		fmt.Fprintln(os.Stderr, "barefoot: did you run \`bf build\` first?")
		os.Exit(1)
	}
	return bf.NewRenderer(tmpl, layoutWithDev)
}

// renderToString renders a component to a full HTML page. In dev mode
// templates are re-parsed on every call so a \`bf build --watch\` update
// surfaces as soon as the browser refreshes — no Go restart needed. In
// production the parse happens once (renderer is reused).
func renderToString(renderer *bf.Renderer, name string, opts bf.RenderOptions) (string, error) {
	r := renderer
	if IsDev() {
		tmpl, err := loadTemplates()
		if err != nil {
			return "", err
		}
		r = bf.NewRenderer(tmpl, layoutWithDev)
	}
	opts.ComponentName = name
	return r.Render(opts), nil
}
`

/** Files every Go adapter contributes that don't depend on the router. */
export function goCommonFiles(): Record<string, string> {
  return {
    'renderer.go': GO_RENDERER_GO,
    'env.go': GO_ENV_GO,
    'bf-runtime/bf.go': bfGoSource,
    'bf-runtime/streaming.go': streamingGoSource,
    'bf-runtime/bfdev/bfdev.go': bfdevGoSource,
    'bf-runtime/go.mod': GO_BF_RUNTIME_GO_MOD,
    'barefoot.config.ts': GO_BAREFOOT_CONFIG_TS,
    'tsconfig.json': GO_TSCONFIG,
    'uno.config.ts': unoConfigTs([
      'components/**/*.tsx',
      'dist/components/**/*.tsx',
    ]),
    'components/Counter.tsx': SHARED_COUNTER_TSX,
    'components/Counter.test.tsx': SHARED_COUNTER_TEST_TSX,
    'public/styles.css': STYLES_CSS,
    'public/tokens.css': TOKENS_CSS,
    'public/uno.css': UNO_CSS_PLACEHOLDER,
    '.gitignore': GO_GITIGNORE,
  }
}

/** package.json scripts shared by every Go adapter. */
export function goScripts(): Record<string, AdapterScriptValue> {
  return {
    dev: 'go mod tidy && bf build && unocss && concurrently -k -n build,uno,server -c blue,magenta,green "bf build --watch" "unocss --watch" "go run ."',
    build: 'go mod tidy && bf build && unocss',
    start: 'go run .',
  }
}

/** package.json runtime dependencies shared by every Go adapter. */
export function goDependencies(): Record<string, string> {
  return {
    '@barefootjs/client': 'latest',
    '@barefootjs/go-template': 'latest',
    '@barefootjs/jsx': 'latest',
    '@barefootjs/shared': 'latest',
  }
}

/** package.json dev dependencies shared by every Go adapter. */
export function goDevDependencies(): Record<string, string> {
  return {
    ...UNOCSS_DEV_DEPENDENCIES,
    '@barefootjs/cli': 'latest',
    '@barefootjs/test': 'latest',
    concurrently: '^9.0.0',
    typescript: '^5.6.0',
  }
}

/** Prereq check shared by every Go adapter: Go toolchain on PATH. */
export function goPrereqs(): string[] {
  try {
    execSync('go version', { stdio: 'ignore' })
    return []
  } catch {
    return [
      'Go toolchain not found on PATH. Install Go 1.22+ (https://go.dev/dl/) before starting the dev server.',
    ]
  }
}

/**
 * Assemble a complete Go AdapterTemplate from the framework-specific
 * `main.go`, `bf_render.go`, and `go.mod`, merged with the shared
 * common files / scripts / deps.
 */
export function makeGoAdapter(opts: {
  label: string
  mainGo: string
  bfRenderGo: string
  goMod: string
}): AdapterTemplate {
  return {
    label: opts.label,
    port: 3001,
    files: {
      'main.go': opts.mainGo,
      'bf_render.go': opts.bfRenderGo,
      'go.mod': opts.goMod,
      ...goCommonFiles(),
    },
    scripts: goScripts(),
    dependencies: goDependencies(),
    devDependencies: goDevDependencies(),
    prereqWarnings: () => goPrereqs(),
  }
}
