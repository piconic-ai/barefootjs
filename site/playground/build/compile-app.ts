/**
 * compileApp — the Bun-side (offline / build-time) wrapper around the
 * isomorphic `compileAppCore`.
 *
 * The core (compile-app-core.ts) is environment-agnostic: it takes the
 * barefoot.js runtime source IN and a pluggable JSX→ESM `transform`, and emits
 * only the USER-specific modules. This wrapper supplies the Bun-only pieces:
 *
 *   - `node:fs` reads (the default Counter source + the barefoot.js runtime),
 *   - esbuild's NATIVE `transform` (a Node addon — fast, but workerd-incompatible
 *     which is why the browser path uses esbuild-wasm instead),
 *
 * and then merges the FIXED vendor modules (generated/vendor-bundle.ts) +
 * the barefoot runtime module into a full Worker-Loader module map, preserving
 * the original `compileApp()` contract so the existing build scripts
 * (build-rt-counter.ts) keep working unchanged.
 *
 * Worker Loader module-resolution facts this relies on (proven empirically by
 * the `/__rt-counter` route in worker.ts under `wrangler dev`):
 *   - Multiple modules with relative imports between them resolve (incl. subdirs).
 *   - Bare specifiers resolve IFF the module is provided in OBJECT form
 *     `{ js: "..." }` keyed by the exact specifier string.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'
import {
  compileAppCore,
  STATIC_BASE,
  type CompileAppCoreResult,
} from './compile-app-core'
import { vendorModules } from './vendor-modules'
import { REGISTRY_MODULES, REGISTRY_CLIENT_JS } from '../generated/registry-bundle'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLAYGROUND = join(HERE, '..')
const REPO_ROOT = join(PLAYGROUND, '..', '..')

export interface CompileAppResult {
  modules: Record<string, string | { js: string }>
  mainModule: string
  assets: CompileAppCoreResult['assets']
}

/**
 * The fixed barefoot.js DOM runtime. In the Worker this is an embedded constant
 * (served to the browser worker at /_pg/barefoot-runtime.js); for the offline
 * build we read the prebuilt standalone client bundle (the same artifact
 * `bf build` copies to barefoot.js).
 */
export async function readBarefootRuntime(): Promise<string> {
  return readFile(
    join(REPO_ROOT, 'packages', 'client', 'dist', 'runtime', 'standalone.js'),
    'utf8',
  )
}

/** Native esbuild transform (Bun-only) matching the core's TransformFn shape. */
async function nativeTransform(
  code: string,
  loader: 'tsx',
): Promise<{ code: string }> {
  const out = await transform(code, {
    loader,
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
    legalComments: 'none',
  })
  return { code: out.code }
}

/**
 * Assemble the FULL Worker-Loader module map for an app: the user modules from
 * the core PLUS the fixed vendor bundle + bare-specifier shims + the barefoot
 * runtime served via the inline _assets.js module (already inside userModules).
 *
 * Note: the barefoot runtime is served over HTTP by the app (baked into
 * _assets.js by the core), not as a module map entry, so the module map only
 * needs the user modules + vendor.
 */
/**
 * Read the template's app files (server.tsx + every src/*.tsx) so an empty
 * `compileApp({})` builds the default multi-route app. The renderer is generated
 * by the core, so it is not read here.
 */
async function readDefaultFiles(): Promise<Record<string, string>> {
  const template = join(PLAYGROUND, 'template')
  const out: Record<string, string> = {
    'server.tsx': await readFile(join(template, 'server.tsx'), 'utf8'),
  }
  const srcDir = join(template, 'src')
  for (const name of await readdir(srcDir)) {
    if (name.endsWith('.tsx')) {
      out[`src/${name}`] = await readFile(join(srcDir, name), 'utf8')
    }
  }
  return out
}

export async function compileApp(
  files: Record<string, string>,
): Promise<CompileAppResult> {
  const barefootRuntime = await readBarefootRuntime()
  const defaultFiles = await readDefaultFiles()

  const core = await compileAppCore(files, {
    barefootRuntime,
    transform: nativeTransform,
    defaultFiles,
  })

  const modules: Record<string, string | { js: string }> = {
    ...core.userModules,
    ...vendorModules(),
    // Root-keyed plain-string ESM (`ui_<name>.js`); see build-registry.ts.
    ...REGISTRY_MODULES,
  }

  // Merge the FIXED registry client JS into the served assets so the default
  // app (which now uses <Button>) can load `<name>.client.js` via the registry
  // SSR template's script-collection tag. At request time the host merges these
  // for live sessions (worker.ts serveAsset); for the embedded default app the
  // assets are baked here.
  const assets: CompileAppCoreResult['assets'] = {
    ...core.assets,
    clientJs: { ...core.assets.clientJs, ...REGISTRY_CLIENT_JS },
  }

  return {
    modules,
    mainModule: core.mainModule,
    assets,
  }
}

export { STATIC_BASE }
