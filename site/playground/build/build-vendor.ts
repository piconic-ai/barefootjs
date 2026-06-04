/**
 * Offline pre-bundle of the FIXED playground framework into a Worker-Loader
 * module set (Path A — see compile-app.ts).
 *
 * The per-app build (`compileApp`) must run with NO bundler at request time.
 * The framework parts that never change between apps — hono, the
 * `@barefootjs/hono` SSR runtime, the renderer shell — are therefore bundled
 * ONCE here, ahead of time, into a single self-contained ESM string (`vendor.js`)
 * plus a set of thin re-export shim strings keyed by the exact bare specifiers
 * the compiled component / renderer / server import.
 *
 * Why a single vendor + re-export shims (not one bundle per specifier):
 * `hono/jsx-renderer` (used by the renderer) and `hono/jsx` (used by the
 * compiled SSR template via `useRequestContext`) MUST share ONE hono module
 * instance, or the request-context lookup the template relies on returns a
 * different store and script collection breaks. Bundling each specifier
 * standalone would duplicate hono and split that instance. Re-export shims that
 * all point into the one `vendor.js` keep a single shared instance.
 *
 * The Worker Loader resolves bare specifiers (e.g. `@barefootjs/hono/utils`)
 * when the module is provided in object form (`{ js: "..." }`) keyed by the
 * exact specifier — proven empirically by the `/__multimod` probe in worker.ts.
 *
 * Run: `bun run site/playground/build/build-vendor.ts`
 * Bun.build is allowed HERE because this is an OFFLINE step over fixed code;
 * the per-request path (compile-app.ts) uses no bundler.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLAYGROUND = join(HERE, '..')
const GENERATED = join(PLAYGROUND, 'generated')

// Bare specifiers the generated SSR template + renderer + server import.
// Each maps to a named-export list re-exported from the single vendor bundle.
const VENDOR_EXPORTS = {
  hono: ['Hono'],
  'hono/jsx-renderer': ['jsxRenderer', 'useRequestContext'],
  'hono/jsx': ['Fragment', 'jsx', 'createContext', 'useContext'],
  // esbuild's automatic JSX runtime emits imports from `hono/jsx/jsx-runtime`.
  'hono/jsx/jsx-runtime': ['jsx', 'jsxs', 'Fragment'],
  'hono/html': ['raw', 'html'],
  // bfComment is emitted by SSR templates that use conditional / list
  // reconciliation (e.g. {items.map(...)} or {cond && <X/>}); bfText/bfTextEnd
  // wrap reactive text slots. All three must be exported or those templates
  // fail to load with "does not provide an export named 'bfComment'".
  '@barefootjs/hono/utils': ['bfComment', 'bfText', 'bfTextEnd'],
  '@barefootjs/hono/client-shim': ['createSignal', 'createMemo', 'createEffect', 'provideContextSSR'],
  '@barefootjs/hono/scripts': ['BfScripts'],
} as const

// A synthetic entry that re-exports everything the playground needs from the
// real packages, so Bun bundles ONE shared graph (single hono instance).
const VENDOR_ENTRY = `
export { Hono } from 'hono'
export { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
export { createContext, useContext } from 'hono/jsx'
// jsx / jsxs / Fragment come from the JSX runtime entry (canonical source used
// by both the hono/jsx and hono/jsx/jsx-runtime shims).
export { jsx, jsxs, Fragment } from 'hono/jsx/jsx-runtime'
export { raw, html } from 'hono/html'
export { bfComment, bfText, bfTextEnd } from '@barefootjs/hono/utils'
export { createSignal, createMemo, createEffect, provideContextSSR } from '@barefootjs/hono/client-shim'
export { BfScripts } from '@barefootjs/hono/scripts'
`

async function main() {
  // Write the synthetic entry to a temp file inside the template dir so its
  // bare imports resolve against the playground node_modules.
  const entryPath = join(PLAYGROUND, 'template', '_vendor-entry.generated.tsx')
  await writeFile(entryPath, VENDOR_ENTRY)

  const result = await Bun.build({
    entrypoints: [entryPath],
    target: 'browser',
    format: 'esm',
    minify: true,
    jsx: {
      runtime: 'automatic',
      importSource: 'hono/jsx',
    } as unknown as undefined,
  })
  if (!result.success) {
    for (const m of result.logs) console.error(m)
    throw new Error('vendor Bun.build failed')
  }
  const vendorJs = await result.outputs[0].text()
  console.log(`vendor.js: ${vendorJs.length} bytes`)

  // Build the re-export shims keyed by each bare specifier.
  //
  // The Worker Loader resolves a relative specifier against the IMPORTING
  // module's key treated as a path. A shim keyed `hono/jsx/jsx-runtime` that
  // imports `./vendor.js` therefore resolves to `hono/jsx/vendor.js` — wrong.
  // So the import path must climb out of the key's directory with one `../`
  // per slash segment in the key, landing back at the root `vendor.js`.
  const shims: Record<string, string> = {}
  for (const [specifier, names] of Object.entries(VENDOR_EXPORTS)) {
    const depth = specifier.split('/').length - 1 // segments before the basename
    const prefix = depth === 0 ? './' : '../'.repeat(depth)
    shims[specifier] = `export { ${names.join(', ')} } from '${prefix}vendor.js'`
  }

  await mkdir(GENERATED, { recursive: true })
  const module = `// Generated by build/build-vendor.ts — do not edit by hand.
// Pre-bundled fixed framework for the playground Dynamic Worker (Path A).
// VENDOR_JS is the single shared framework bundle; VENDOR_SHIMS maps each bare
// specifier the compiled component / renderer / server imports to a thin
// re-export shim so the Worker Loader resolves them to ONE shared instance.
export const VENDOR_JS = ${JSON.stringify(vendorJs)}
export const VENDOR_SHIMS: Record<string, string> = ${JSON.stringify(shims, null, 2)}
`
  await writeFile(join(GENERATED, 'vendor-bundle.ts'), module)
  console.log(`Wrote generated/vendor-bundle.ts (${Object.keys(shims).length} shims)`)
}

await main()
