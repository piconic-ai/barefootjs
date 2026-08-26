/**
 * Fixture-hydrate host page + server (#2481 oracle harness, step 1).
 *
 * Extracted from `fixture-hydrate.playwright.ts` (#1467) unchanged in
 * behavior for the `'hydrate'` mode, and widened with two more host
 * shapes the oracle suite (`oracle.playwright.ts`) needs to compare
 * against the same fixture without three copies of the server:
 *
 *   - `'hydrate'`  (default, legacy): body = `rawExpectedHtml`, plus a
 *     `<script type="module">` that imports the fixture's client JS
 *     immediately — this is what `bf build` ships (SSR HTML + inline
 *     hydration script).
 *   - `'deferred'`: body = `rawExpectedHtml`, but the module script is
 *     NOT emitted. The caller injects it later (`page.addScriptTag`)
 *     so it can capture pre-hydration DOM state first.
 *   - `'csr-mount'`: body is empty. A boot module script imports the
 *     client JS for its `hydrate()` registration side effect, then
 *     calls the real `createComponent(name, props)` from
 *     `@barefootjs/client/runtime` and appends the result to
 *     `document.body` — the same construction path a client-rendered
 *     (no SSR) mount takes in production, exercised here for real in a
 *     browser instead of the Bun-side mock runtime
 *     (`src/csr-render.ts`) `csr-conformance.test.ts` uses.
 *
 * All three shapes share one importmap (`@barefootjs/client/runtime` →
 * the prebuilt standalone runtime bundle, plus any fixture-declared
 * `externalImports`) and one `hostStyles` gate, so a fixture's host page
 * differs across modes only in body content and the presence/placement
 * of the hydration/boot script.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { JSXFixture } from '../src/types'

const HERE = dirname(fileURLToPath(import.meta.url))
export const RUNTIME_PATH = resolve(HERE, '../../client/dist/runtime/standalone.js')

export type HostMode = 'hydrate' | 'deferred' | 'csr-mount'

function externalRoute(specifier: string): string {
  return `/__external/${encodeURIComponent(specifier)}`
}

/**
 * Serialize a value for splicing into an inline `<script type="module">`
 * body. `JSON.stringify` alone leaves a literal `</script>` inside a
 * string prop free to close the tag early — escape the slash in every
 * `</` occurrence the way script-embedded JSON conventionally does.
 */
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, '<\\/')
}

/**
 * Build the `<head>` shared by every mode: importmap (runtime + any
 * fixture `externalImports`) and the gated `hostStyles` tag.
 */
function hostHead(fixture: JSXFixture): string {
  const imports: Record<string, string> = {
    '@barefootjs/client/runtime': '/__runtime.js',
  }
  for (const specifier of Object.keys(fixture.externalImports ?? {})) {
    imports[specifier] = externalRoute(specifier)
  }
  const styleTag = fixture.hostStyles ? `\n<style>${fixture.hostStyles}</style>` : ''
  return `<meta charset="utf-8">
<title>${fixture.id}</title>
<script type="importmap">
${embedJson({ imports })}
</script>${styleTag}`
}

/**
 * Host page body for the requested `mode`. Defaults to `'hydrate'` — the
 * legacy `fixture-hydrate.playwright.ts` shape — so existing callers that
 * never pass `mode` see unchanged output.
 */
export function hostPage(fixture: JSXFixture, mode: HostMode = 'hydrate'): string {
  const head = hostHead(fixture)
  if (mode === 'csr-mount') {
    if (!fixture.componentName) {
      throw new Error(
        `hostPage: fixture '${fixture.id}' has no componentName — 'csr-mount' mode needs one to call createComponent(name, props).`,
      )
    }
    // Drop internal `__`-prefixed keys (namely `__instanceId`, the
    // harness's deterministic-scope-id pin — see `sharedFixtureInstanceId`
    // in `fixtures/_helpers.ts`) before handing props to a REAL
    // `createComponent`. SSR strips the same keys before serializing
    // `bf-p`, so a real hydration init() (which reads props back off
    // `bf-p`) never sees them either — passing them through here would
    // leak a synthetic `__instanceid="…"` DOM attribute that only this
    // harness's `props` object has any reason to carry, a false
    // divergence against the other two legs rather than a real one.
    // `createComponent` doesn't need `__instanceId` for anything: with no
    // `mountAt`/derived scope it assigns its own random `Name_xxxxxx`
    // scope id (`component.ts`'s `generateId()`), which `normalizeHTML`
    // already canonicalizes like any other CSR-produced scope id.
    const csrProps = Object.fromEntries(
      Object.entries(fixture.props ?? {}).filter(([key]) => !key.startsWith('__')),
    )
    const boot = `import '/${fixture.id}/__client.js'
import { createComponent } from '@barefootjs/client/runtime'
const __el = createComponent(${embedJson(fixture.componentName)}, ${embedJson(csrProps)})
document.body.appendChild(__el)`
    // The boot script itself lives in `<head>`, NOT `<body>` — an oracle
    // captures `document.body.innerHTML` to compare against the other two
    // modes, and a `<script>` element left sitting in the body (module
    // scripts are not auto-removed after they run) would show up as a
    // spurious structural diff that has nothing to do with the fixture.
    return `<!DOCTYPE html>
<html>
<head>
${head}
<script type="module">
${boot}
</script>
</head>
<body>
</body>
</html>`
  }

  // Prefer `rawExpectedHtml`: `createFixture` whitespace-normalizes
  // `expectedHtml` for cross-adapter comparison, which would silently
  // mutate hydration inputs for any fixture whose DOM cares about
  // inter-element whitespace (e.g. `<pre>`, `<textarea>`).
  const html = fixture.rawExpectedHtml ?? fixture.expectedHtml ?? ''
  // `deferred` omits the module script entirely — the caller injects it
  // later via `page.addScriptTag` once it has captured pre-hydration
  // state.
  const scriptTag = mode === 'deferred' ? '' : `\n<script type="module" src="__client.js"></script>`
  return `<!DOCTYPE html>
<html>
<head>
${head}
</head>
<body>
${html}${scriptTag}
</body>
</html>`
}

export interface FixtureServerHandle {
  server: Server
  baseUrl: string
}

/**
 * Absolute URL for a fixture's host page under `mode`. `'hydrate'` keeps
 * the legacy no-suffix path (`/<id>/`) so a bare `fixtureUrl(base, id)`
 * call is identical to the pre-#2481 `${baseUrl}/${fixture.id}/` literal.
 */
export function fixtureUrl(baseUrl: string, fixtureId: string, mode: HostMode = 'hydrate'): string {
  return mode === 'hydrate' ? `${baseUrl}/${fixtureId}/` : `${baseUrl}/${fixtureId}/${mode}/`
}

/**
 * Spin up the shared `node:http` fixture server. Routes:
 *   - `/__runtime.js` — the prebuilt standalone runtime bundle.
 *   - `/__external/<encoded-specifier>` — third-party ESM bundles a
 *     fixture's client JS resolves at runtime (#1467 Phase 3).
 *   - `/<fixtureId>/__client.js` — the fixture's frozen client JS.
 *   - `/<fixtureId>/` and `/<fixtureId>/<mode>/` — the host page for
 *     `mode` (`hydrate` when the segment is absent, matching legacy URLs).
 */
export async function startFixtureServer(fixtures: ReadonlyArray<JSXFixture>): Promise<FixtureServerHandle> {
  if (!existsSync(RUNTIME_PATH)) {
    throw new Error(
      `Runtime bundle not found at ${RUNTIME_PATH}.\n` +
        `Run \`bun run --filter '@barefootjs/client' build\` (or \`bun run build\` at the repo root) before this suite.`,
    )
  }
  const runtimeSource = readFileSync(RUNTIME_PATH, 'utf8')
  const byId = new Map(fixtures.map(f => [f.id, f]))

  // External third-party ESM bundles (#1467 Phase 3): bare specifier →
  // absolute on-disk path, unioned across every fixture that declares
  // `externalImports`. Two fixtures may legitimately share a specifier
  // pointing at the same bundle, but a specifier mapped to two DIFFERENT
  // paths is a corpus mistake that would silently serve the wrong bundle
  // to one of them — fail loud instead.
  const externalModulePaths = new Map<string, string>()
  for (const fixture of fixtures) {
    for (const [specifier, path] of Object.entries(fixture.externalImports ?? {})) {
      const existing = externalModulePaths.get(specifier)
      if (existing !== undefined && existing !== path) {
        throw new Error(
          `Conflicting externalImports for '${specifier}': '${existing}' vs '${path}'. ` +
            `A bare specifier must resolve to one bundle across the whole corpus.`,
        )
      }
      externalModulePaths.set(specifier, path)
    }
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/__runtime.js') {
      res.writeHead(200, { 'content-type': 'application/javascript' }).end(runtimeSource)
      return
    }
    if (url.pathname.startsWith('/__external/')) {
      const specifier = decodeURIComponent(url.pathname.slice('/__external/'.length))
      const modPath = externalModulePaths.get(specifier)
      if (!modPath || !existsSync(modPath)) {
        res.writeHead(404).end('not found')
        return
      }
      res
        .writeHead(200, { 'content-type': 'application/javascript' })
        .end(readFileSync(modPath, 'utf8'))
      return
    }
    const segments = url.pathname.split('/').filter(Boolean)
    const fixture = segments[0] ? byId.get(segments[0]) : undefined
    if (!fixture) {
      res.writeHead(404).end('not found')
      return
    }
    if (segments[1] === '__client.js') {
      res
        .writeHead(200, { 'content-type': 'application/javascript' })
        .end(fixture.expectedClientJs ?? '')
      return
    }
    // Second segment (if any) selects the host mode; absent means the
    // legacy `/<id>/` hydrate shape. An unrecognized segment is 404, not
    // a silent hydrate fallback — a typoed mode in a test URL would
    // otherwise still serve a page and misattribute the oracle's diff.
    const mode: HostMode | undefined =
      segments[1] === undefined
        ? 'hydrate'
        : segments[1] === 'deferred' || segments[1] === 'csr-mount'
          ? segments[1]
          : undefined
    if (mode === undefined) {
      res.writeHead(404).end('not found')
      return
    }
    res
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(hostPage(fixture, mode))
  })
  await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
  const port = (server.address() as AddressInfo).port
  // Use the bound IPv4 literal — on hosts where `localhost` resolves to
  // `::1` first the IPv6 listener doesn't exist and the browser falls
  // through to a connection error.
  const baseUrl = `http://127.0.0.1:${port}`
  return { server, baseUrl }
}
