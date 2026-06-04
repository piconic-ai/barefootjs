/**
 * Assemble the FIXED vendor Worker-Loader modules (object form) from the
 * pre-bundled framework (generated/vendor-bundle.ts).
 *
 * The vendor bundle never changes between Runs, so the host worker holds it and
 * merges it with each session's user modules. Object-form `{ js }` values let
 * the Worker Loader resolve the bare specifiers (hono, @barefootjs/hono/*, …)
 * the compiled component / renderer / server import — keyed by the exact
 * specifier string, all re-exporting from the single shared `vendor.js`.
 *
 * Shared by compile-app.ts (offline build) and worker.ts (request-time session
 * loading) so both produce the identical vendor map.
 */

import { VENDOR_JS, VENDOR_SHIMS } from '../generated/vendor-bundle'

export function vendorModules(): Record<string, { js: string }> {
  const modules: Record<string, { js: string }> = {
    'vendor.js': { js: VENDOR_JS },
  }
  for (const [specifier, shim] of Object.entries(VENDOR_SHIMS)) {
    modules[specifier] = { js: shim }
  }
  return modules
}
