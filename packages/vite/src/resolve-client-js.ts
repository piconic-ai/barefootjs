/**
 * `resolveId` shim: maps the compiler's synthesized `./foo.client.js`
 * sibling-import specifier back to the real `./foo.tsx` source file on
 * disk. There is no `.client.js` file for Vite to find — the compiler only
 * ever read `foo.tsx`.
 *
 * Scope, per the spike (spike-findings.md, R2): the `.client.js` rewrite
 * (`packages/jsx/src/ir-to-client-js/imports.ts:177`, gated by
 * `analyzer.ts`'s `scanImportedClientSignals`) only ever fires for
 * **relative** specifiers (`./`, `../`) that import a module exporting
 * client signals — alias imports (`@/components/foo`) are never rewritten
 * by the compiler, so they reach Vite as plain bare specifiers that
 * `resolve.alias` already resolves natively (proven in the spike: both
 * resolution paths converge on the same module id and Rollup dedupes them
 * into one shared chunk). Do NOT add alias handling here.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const CLIENT_JS_SUFFIX = '.client.js'

/**
 * Resolve `source` (an import specifier seen by Vite's `resolveId`) to the
 * real `.tsx` file it stands in for, or `null` if this shim doesn't apply.
 */
export function resolveClientJsSpecifier(source: string, importer: string | undefined): string | null {
  if (!source.endsWith(CLIENT_JS_SUFFIX)) return null
  if (!source.startsWith('./') && !source.startsWith('../')) return null
  if (!importer) return null

  const candidateBase = resolve(dirname(importer), source.slice(0, -CLIENT_JS_SUFFIX.length))
  const tsxPath = `${candidateBase}.tsx`
  return existsSync(tsxPath) ? tsxPath : null
}
