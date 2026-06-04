/**
 * Browser compile worker — runs the playground build pipeline IN THE BROWSER.
 *
 * The host worker (workerd) can't run esbuild's native `transform` (it's a Node
 * addon), so compilation happens here, in a web worker, where esbuild-wasm runs
 * fine. This worker bundles the isomorphic `compileAppCore` + @barefootjs/jsx +
 * @barefootjs/hono/build + UnoCSS, and injects esbuild-wasm's `transform`.
 *
 * Protocol:
 *   ← postMessage({ type: 'compile', id, files })   { [path]: content }
 *   → postMessage({ type: 'result', id, ok: true, userModules, mainModule, assets, wiringIssues })
 *   → postMessage({ type: 'result', id, ok: false, errors: string[] })
 *   → postMessage({ type: 'ready' })                once esbuild-wasm is init'd
 *
 * Built with `bun build --target=browser` into generated/compile-worker.js and
 * served by the host at /_pg/compile-worker.js.
 */

import * as esbuild from 'esbuild-wasm'
import { compileAppCore } from '../build/compile-app-core'
import { WiringIssuesError } from '../build/wiring-check'

// esbuild-wasm version is pinned to match the playground's esbuild — both
// produce identical single-file transform output. Fetch the wasm from jsdelivr
// rather than embedding 12 MB into the host worker bundle.
const ESBUILD_WASM_URL =
  'https://cdn.jsdelivr.net/npm/esbuild-wasm@0.25.4/esbuild.wasm'

// The host serves the fixed barefoot.js DOM runtime here; the core needs it to
// bake the inline _assets.js module. Cached after the first fetch.
const BAREFOOT_RUNTIME_URL = '/_pg/barefoot-runtime.js'

let initPromise: Promise<void> | null = null
let barefootRuntime: string | null = null

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = esbuild.initialize({ wasmURL: ESBUILD_WASM_URL })
  }
  return initPromise
}

async function getBarefootRuntime(): Promise<string> {
  if (barefootRuntime == null) {
    const res = await fetch(BAREFOOT_RUNTIME_URL)
    if (!res.ok) {
      throw new Error(`barefoot-runtime.js responded ${res.status}`)
    }
    barefootRuntime = await res.text()
  }
  return barefootRuntime
}

// esbuild-wasm's transform matches the core's TransformFn signature.
async function wasmTransform(
  code: string,
  loader: 'tsx',
): Promise<{ code: string }> {
  const out = await esbuild.transform(code, {
    loader,
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
    legalComments: 'none',
  })
  return { code: out.code }
}

type CompileMessage = {
  type: 'compile'
  id: number
  files: Record<string, string>
}

const ctx = self as unknown as Worker

self.addEventListener('message', (event: MessageEvent<CompileMessage>) => {
  const msg = event.data
  if (!msg || msg.type !== 'compile') return
  const { id, files } = msg
  void (async () => {
    try {
      await ensureInit()
      const runtime = await getBarefootRuntime()
      const result = await compileAppCore(files, {
        barefootRuntime: runtime,
        transform: wasmTransform,
      })
      ctx.postMessage({
        type: 'result',
        id,
        ok: true,
        userModules: result.userModules,
        mainModule: result.mainModule,
        assets: result.assets,
        // Reactive-wiring issues (no-initial-value signals, …) found by the
        // same analysis `bf debug graph` uses. Empty when wiring is clean. The
        // client auto-repairs AI builds and warns on human Run edits.
        wiringIssues: result.wiringIssues,
      })
    } catch (err) {
      // A WiringIssuesError means the build failed BECAUSE of a reactive-wiring
      // bug (e.g. a no-initial-value signal whose broken SSR template would
      // otherwise throw a cryptic esbuild error). Report the structured issues
      // on the failed result so the client runs the SAME auto-repair / warn path
      // as a non-fatal wiring issue — instead of surfacing the opaque error.
      if (err instanceof WiringIssuesError) {
        ctx.postMessage({
          type: 'result',
          id,
          ok: false,
          errors: [err.message],
          wiringIssues: err.issues,
        })
        return
      }
      const message =
        err instanceof Error ? err.stack || err.message : String(err)
      ctx.postMessage({
        type: 'result',
        id,
        ok: false,
        errors: [message],
      })
    }
  })()
})

// Kick off esbuild-wasm init eagerly and announce readiness so the UI can
// surface a warming state and enable Run as soon as the first Run will be fast.
void ensureInit().then(
  () => ctx.postMessage({ type: 'ready' }),
  (err) =>
    ctx.postMessage({
      type: 'result',
      id: -1,
      ok: false,
      errors: [
        `esbuild-wasm init failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    }),
)
