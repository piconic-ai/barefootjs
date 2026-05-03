// Echo (Go) adapter starter.
//
// Scaffolds a runnable Echo + Go html/template app with the BarefootJS
// runtime vendored under `./bf-runtime` (a `replace` directive in
// `go.mod` keeps imports stable). The runtime sources are inlined into
// the CLI bundle by `scripts/embed-runtimes.mjs` so the scaffold is
// self-contained — no network fetch, no monorepo path leaks.

import { execSync } from 'node:child_process'
import type { AdapterTemplate } from '../templates'
import {
  COMPONENTS_MANIFEST_SEED,
  SHARED_COUNTER_TSX,
  STYLES_CSS,
  TOKENS_CSS,
  UNOCSS_DEV_DEPENDENCIES,
  UNO_CSS_PLACEHOLDER,
  unoConfigTs,
} from './shared'
import {
  bfGoSource,
  streamingGoSource,
} from './runtimes.generated'

// We don't ship the upstream `bf-runtime/go.mod` as-is — it pins the
// Go version to whatever the monorepo developer happens to be on
// (currently 1.25). Override with a permissive `go 1.22` floor so the
// scaffold runs on any reasonably current Go install.
const ECHO_BF_RUNTIME_GO_MOD = `module github.com/barefootjs/runtime/bf

go 1.22
`

const ECHO_BAREFOOT_CONFIG_TS = `import { createConfig } from '@barefootjs/go-template/build'

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
    clientJsBasePath: '/static/components/',
    barefootJsPath: '/static/components/barefoot.js',
  },
  // Generated Go struct types for every component, written next to main.go.
  // Overwritten on every \`barefoot build\` run.
  typesOutputFile: 'components.go',
})
`

// Lean Go entry. We use an anonymous prop struct in the route handler
// so main.go compiles even before the first \`barefoot build\` writes
// \`components.go\` — which would supply the typed \`CounterProps\`.
const ECHO_MAIN_GO = `package main

import (
\t"fmt"
\t"html/template"
\t"io"
\t"net/http"
\t"os"

\tbf "github.com/barefootjs/runtime/bf"
\t"github.com/labstack/echo/v4"
\t"github.com/labstack/echo/v4/middleware"
)

type echoRenderer struct {
\tbf *bf.Renderer
}

func (r *echoRenderer) Render(w io.Writer, name string, data interface{}, c echo.Context) error {
\topts := data.(bf.RenderOptions)
\topts.ComponentName = name
\t_, err := w.Write([]byte(r.bf.Render(opts)))
\treturn err
}

func defaultLayout(ctx *bf.RenderContext) string {
\treturn fmt.Sprintf(\`<!DOCTYPE html>
<html lang="en">
<head>
\t<meta charset="utf-8" />
\t<meta name="viewport" content="width=device-width, initial-scale=1.0" />
\t<title>%s</title>
\t<link rel="stylesheet" href="/static/styles.css" />
</head>
<body>
\t<main>%s</main>
\t%s
\t%s
</body>
</html>\`,
\t\tctx.Title,
\t\tctx.ComponentHTML,
\t\tctx.Portals,
\t\tctx.Scripts,
\t)
}

func main() {
\te := echo.New()
\te.Use(middleware.Logger())
\te.Use(middleware.Recover())

\ttmpl := template.Must(template.New("").Funcs(bf.FuncMap()).ParseGlob("dist/templates/*.tmpl"))
\te.Renderer = &echoRenderer{bf: bf.NewRenderer(tmpl, defaultLayout)}

\te.Static("/static/components", "dist/components")
\te.Static("/static", "public")

\te.GET("/", func(c echo.Context) error {
\t\treturn c.Render(http.StatusOK, "Counter", bf.RenderOptions{
\t\t\tTitle: "BarefootJS app",
\t\t\tProps: &struct {
\t\t\t\tScopeID   string              \`json:"scopeID"\`
\t\t\t\tBfIsRoot  bool                \`json:"-"\`
\t\t\t\tBfIsChild bool                \`json:"-"\`
\t\t\t\tScripts   *bf.ScriptCollector \`json:"-"\`
\t\t\t\tInitial   int                 \`json:"initial"\`
\t\t\t}{Initial: 0},
\t\t})
\t})

\tport := os.Getenv("PORT")
\tif port == "" {
\t\tport = "3001"
\t}
\tfmt.Printf("  ➜ http://localhost:%s\\n", port)
\te.Logger.Fatal(e.Start(":" + port))
}
`

const ECHO_GO_MOD = `module barefoot-app

go 1.22

require (
\tgithub.com/barefootjs/runtime/bf v0.0.0
\tgithub.com/labstack/echo/v4 v4.12.0
)

// The BarefootJS Go runtime ships vendored under ./bf-runtime so this
// scaffold runs without depending on a published Go module.
replace github.com/barefootjs/runtime/bf => ./bf-runtime
`

const ECHO_TSCONFIG = `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@barefootjs/jsx",
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

export const ECHO_ADAPTER: AdapterTemplate = {
  label: 'Echo (Go, html/template SSR)',
  port: 3001,
  files: {
    'main.go': ECHO_MAIN_GO,
    'go.mod': ECHO_GO_MOD,
    'bf-runtime/bf.go': bfGoSource,
    'bf-runtime/streaming.go': streamingGoSource,
    'bf-runtime/go.mod': ECHO_BF_RUNTIME_GO_MOD,
    'barefoot.config.ts': ECHO_BAREFOOT_CONFIG_TS,
    'tsconfig.json': ECHO_TSCONFIG,
    'uno.config.ts': unoConfigTs([
      'components/**/*.tsx',
      'dist/components/**/*.tsx',
    ]),
    'components/Counter.tsx': SHARED_COUNTER_TSX,
    'public/styles.css': STYLES_CSS,
    'public/tokens.css': TOKENS_CSS,
    'public/uno.css': UNO_CSS_PLACEHOLDER,
    'dist/components/manifest.json': COMPONENTS_MANIFEST_SEED,
  },
  scripts: {
    // Build everything once (barefoot generates components.go +
    // dist/templates/*.tmpl, unocss generates uno.css), then run the
    // watchers and the Go server side-by-side. `concurrently -k` makes
    // Ctrl-C kill all three. Go has no built-in hot reload — restart
    // manually after main.go edits, or swap in `air` later.
    dev: 'barefoot build && unocss && concurrently -k -n build,uno,server -c blue,magenta,green "barefoot build --watch" "unocss --watch" "go run ."',
    build: 'barefoot build && unocss',
    start: 'go run .',
  },
  dependencies: {
    '@barefootjs/cli': 'latest',
    '@barefootjs/client': 'latest',
    '@barefootjs/go-template': 'latest',
    '@barefootjs/jsx': 'latest',
    '@barefootjs/shared': 'latest',
  },
  devDependencies: {
    ...UNOCSS_DEV_DEPENDENCIES,
    concurrently: '^9.0.0',
    typescript: '^5.6.0',
  },
  prereqWarnings: () => goPrereqs(),
}

function goPrereqs(): string[] {
  try {
    execSync('go version', { stdio: 'ignore' })
    return []
  } catch {
    return [
      'Go toolchain not found on PATH. Install Go 1.22+ (https://go.dev/dl/) before `bun run dev`.',
    ]
  }
}
