// Hono build config factory for barefoot.config.ts

import type { BuildOptions } from '@barefootjs/jsx'
import { HonoAdapter } from './adapter'
import type { HonoAdapterOptions } from './adapter'

export interface HonoBuildOptions extends BuildOptions {
  /** Inject Hono script collection wrapper (default: true) */
  scriptCollection?: boolean
  /** Base path for client JS script URLs (default: '/static/components/') */
  scriptBasePath?: string
  /** Adapter-specific options passed to HonoAdapter */
  adapterOptions?: HonoAdapterOptions
}

/**
 * Create a BarefootBuildConfig for Hono projects.
 *
 * Uses structural typing — does not import BarefootBuildConfig to avoid
 * circular dependency between @barefootjs/hono and @barefootjs/cli.
 */
export function createConfig(options: HonoBuildOptions = {}) {
  const useScriptCollection = options.scriptCollection ?? true

  return {
    adapter: new HonoAdapter(options.adapterOptions),
    components: options.components,
    outDir: options.outDir,
    minify: options.minify,
    contentHash: options.contentHash,
    clientOnly: options.clientOnly,
    externals: options.externals,
    externalsBasePath: options.externalsBasePath,
    bundleEntries: options.bundleEntries,
    transformMarkedTemplate: useScriptCollection
      ? (content: string, componentId: string, clientJsPath: string) =>
          addScriptCollection(content, componentId, clientJsPath, options.scriptBasePath)
      : undefined,
  }
}

/**
 * Add Hono script collection wrapper to an SSR marked template.
 * Injects imports, a helper function, and script collector into each
 * exported component function.
 */
export function addScriptCollection(content: string, componentId: string, clientJsPath: string, scriptBasePath: string = '/static/components/'): string {
  const basePath = scriptBasePath.endsWith('/') ? scriptBasePath : scriptBasePath + '/'
  const importStatement = "import { useRequestContext } from 'hono/jsx-renderer'\nimport { Fragment } from 'hono/jsx'\n"

  // Find the last import statement and add our import after it
  const importMatch = content.match(/^([\s\S]*?)((?:import[^\n]+\n)*)/m)
  if (!importMatch) {
    return content
  }

  const beforeImports = importMatch[1]
  const existingImports = importMatch[2]
  const restOfFile = content.slice(importMatch[0].length)

  // Helper function to wrap JSX with inline script tags (for Suspense streaming)
  const helperFn = `
function __bfWrap(jsx: any, scripts: string[]) {
  if (scripts.length === 0) return jsx
  return <Fragment>{jsx}{scripts.map(s => <script type="module" src={s} />)}</Fragment>
}
`

  // Script collection code to insert at the start of each component function.
  // When BfScripts has already rendered (e.g., inside Suspense boundaries),
  // scripts are output inline instead of being collected.
  const scriptCollector = `
  let __bfInlineScripts: string[] = []
  // Script collection for client JS hydration
  try {
    const __c = useRequestContext()
    const __scripts: { src: string }[] = __c.get('bfCollectedScripts') || []
    const __outputScripts: Set<string> = __c.get('bfOutputScripts') || new Set()
    const __bfRendered = __c.get('bfScriptsRendered')
    if (!__outputScripts.has('__barefoot__')) {
      __outputScripts.add('__barefoot__')
      if (__bfRendered) __bfInlineScripts.push('${basePath}barefoot.js')
      else __scripts.push({ src: '${basePath}barefoot.js' })
    }
    if (!__outputScripts.has('${componentId}')) {
      __outputScripts.add('${componentId}')
      if (__bfRendered) __bfInlineScripts.push('${basePath}${clientJsPath}')
      else __scripts.push({ src: '${basePath}${clientJsPath}' })
    }
    __c.set('bfCollectedScripts', __scripts)
    __c.set('bfOutputScripts', __outputScripts)
  } catch {}
`

  // Insert script collector at the start of each component function body.
  // Matches both exported and non-exported PascalCase components (#786).
  // Uses paren counting instead of regex to correctly handle nested
  // delimiters in destructured params (e.g. `onInput = () => {}`).
  let modifiedRest = restOfFile
  const exportFuncPattern = /(?:export )?function ([A-Z]\w*)\s*\(/g
  const insertions: Array<{ index: number; text: string }> = []
  let efMatch: RegExpExecArray | null
  while ((efMatch = exportFuncPattern.exec(restOfFile)) !== null) {
    const openParenPos = efMatch.index + efMatch[0].length - 1
    // Count parens to find matching ')'
    let depth = 1
    let i = openParenPos + 1
    while (i < restOfFile.length && depth > 0) {
      const ch = restOfFile[i]
      if (ch === "'" || ch === '"' || ch === '`') {
        i++
        while (i < restOfFile.length) {
          if (restOfFile[i] === '\\') { i += 2; continue }
          if (restOfFile[i] === ch) { i++; break }
          i++
        }
        continue
      }
      if (ch === '(') depth++
      else if (ch === ')') depth--
      i++
    }
    // i is now right after matching ')'; find the next '{' for function body
    while (i < restOfFile.length && restOfFile[i] !== '{') i++
    if (i < restOfFile.length) {
      insertions.push({ index: i + 1, text: scriptCollector })
    }
  }
  // Apply insertions from back to front to preserve indices
  for (let ii = insertions.length - 1; ii >= 0; ii--) {
    const ins = insertions[ii]
    modifiedRest = modifiedRest.slice(0, ins.index) + ins.text + modifiedRest.slice(ins.index)
  }

  // Wrap each return (...) with __bfWrap((...), __bfInlineScripts)
  // Process from back to front to preserve offsets
  const returnPattern = /return\s*\(/g
  const returnMatches: Array<{ index: number; length: number }> = []
  let m: RegExpExecArray | null
  while ((m = returnPattern.exec(modifiedRest)) !== null) {
    returnMatches.push({ index: m.index, length: m[0].length })
  }
  // Process from last to first to keep earlier offsets valid
  for (let ri = returnMatches.length - 1; ri >= 0; ri--) {
    const rm = returnMatches[ri]
    const afterOpen = rm.index + rm.length // position after 'return ('
    let depth = 1
    let ci = afterOpen
    while (ci < modifiedRest.length && depth > 0) {
      if (modifiedRest[ci] === '(') depth++
      else if (modifiedRest[ci] === ')') depth--
      ci++
    }
    // ci is right after the matching ')'; insert wrap closing there
    modifiedRest = modifiedRest.slice(0, ci) + ', __bfInlineScripts)' + modifiedRest.slice(ci)
    // Replace 'return (' with 'return __bfWrap(('
    modifiedRest = modifiedRest.slice(0, rm.index) + 'return __bfWrap((' + modifiedRest.slice(rm.index + rm.length)
  }

  return beforeImports + existingImports + importStatement + helperFn + modifiedRest
}
