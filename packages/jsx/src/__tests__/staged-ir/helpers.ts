/**
 * Shared helpers for staged-IR fixture tests. Centralizes the
 * `compileJSXSync` + adapter setup and the assertions about emitted
 * artifact shapes (template body extraction, init body extraction).
 */

import { compileJSXSync } from '../../compiler'
import { TestAdapter } from '../../adapters/test-adapter'

const adapter = new TestAdapter()

export interface CompileResult {
  clientJs: string
  templateBody: string
  initBody: string
  errors: string[]
}

export function compile(source: string, fileName = 'Component.tsx'): CompileResult {
  const result = compileJSXSync(source, fileName, { adapter })
  const clientJs = result.files.find((f) => f.type === 'clientJs')?.content ?? ''
  return {
    clientJs,
    templateBody: extractTemplateBody(clientJs),
    initBody: extractInitBody(clientJs),
    errors: result.errors.map((e) => `[${e.code}] ${e.message}`),
  }
}

/** Extract the `template: (_p) => \`...\`` body. Returns '' if not present. */
export function extractTemplateBody(clientJs: string): string {
  const m = clientJs.match(/template:\s*\(_p\)\s*=>\s*`([\s\S]*?)`(?=,\s*\w|\s*\})/)
  return m ? m[1] : ''
}

/** Extract the `function init<Name>(...) { ... }` body. Returns '' if not present. */
export function extractInitBody(clientJs: string): string {
  const m = clientJs.match(/function\s+init\w+\s*\([^)]*\)\s*\{([\s\S]*?)\n\}\s*(?:\n|$)/)
  return m ? m[1] : ''
}

/** Names that, if seen bare in template scope, indicate a stage violation. */
export const TEMPLATE_FORBIDDEN_BARE = [
  // Init-scope locals that shouldn't leak into template's `(_p) => ...`
  'cachedViewport',
  'store',
  'transform',
  'flag',
  'items',
  // The unrewritten props parameter — should appear as `_p` in template scope
  '\\bprops\\b',
]

/** Assert that `body` (template scope) contains none of the listed bare names. */
export function expectNoBareNames(body: string, names: string[]): void {
  for (const name of names) {
    const re = new RegExp(name)
    if (re.test(body)) {
      throw new Error(
        `Template body contains forbidden bare name matching /${name}/. ` +
          `This indicates a stage S2 → Template scope violation. Body:\n${body}`,
      )
    }
  }
}

/**
 * Verify the client JS parses as valid JavaScript (catches ASI / syntax bugs).
 * Strips ESM-specific bits that `new Function()` rejects:
 *   - `import ... from '...'` lines (whole line)
 *   - the `export` keyword (preserve the rest of the declaration)
 */
export function expectValidJs(clientJs: string): void {
  if (!clientJs) return
  const sanitized = clientJs
    .replace(/^\s*import\b[^\n]*$/gm, '')
    .replace(/^\s*export\s+/gm, '')
  try {
    new Function(sanitized)
  } catch (e) {
    throw new Error(`Emitted client JS does not parse:\n${(e as Error).message}\n\nSource:\n${clientJs}`)
  }
}
