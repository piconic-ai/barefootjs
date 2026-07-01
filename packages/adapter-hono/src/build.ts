// Hono build config factory for barefoot.config.ts

import type { BuildOptions } from '@barefootjs/jsx'
import { registerLoweringPlugin } from '@barefootjs/jsx'
import { HonoAdapter } from './adapter/index.ts'
import type { HonoAdapterOptions } from './adapter/index.ts'

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
  // Register config-declared call-lowering plugins (#2057) in this module's
  // `@barefootjs/jsx` instance — the one the adapter reads its registry from.
  for (const plugin of options.plugins ?? []) registerLoweringPlugin(plugin)

  const useScriptCollection = options.scriptCollection ?? true

  return {
    adapter: new HonoAdapter(options.adapterOptions),
    paths: options.paths,
    components: options.components,
    outDir: options.outDir,
    minify: options.minify,
    contentHash: options.contentHash,
    externals: options.externals,
    externalsBasePath: options.externalsBasePath,
    bundleEntries: options.bundleEntries,
    localImportPrefixes: options.localImportPrefixes,
    plugins: options.plugins,
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
  //
  // The regex matches against a comment-masked copy so a docstring
  // example like `function MyNode(this: HTMLElement, props)` is NOT
  // misread as a real function declaration (#1236). The paren counter
  // still walks the ORIGINAL `restOfFile` and keeps the quote-skip
  // logic — TS parameter type annotations contain balanced strings
  // (e.g. `"data-key"?: string`) that the skip handles correctly.
  let modifiedRest = restOfFile
  const maskedRest = maskComments(restOfFile)
  const exportFuncPattern = /(?:export )?function ([A-Z]\w*)\s*\(/g
  const insertions: Array<{ index: number; text: string }> = []
  let efMatch: RegExpExecArray | null
  while ((efMatch = exportFuncPattern.exec(maskedRest)) !== null) {
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

  // Wrap each return (...) with __bfWrap((...), __bfInlineScripts).
  //
  // Intentionally NO comment/string masking here. JSX bodies routinely
  // contain unbalanced apostrophes in text content (`Hey! How's it
  // going`) which a string-aware scanner misreads as an open quote and
  // ends up blanking everything until the next stray `'`, breaking
  // paren counting. Plain `(` / `)` counting works for JSX returns
  // because JSX text cannot contain literal parens — those only appear
  // inside `{expr}` slots, which are balanced JS.
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

/**
 * Replace comment contents with spaces (preserving length and newlines
 * so indices computed against the masked text are valid in the
 * original). Used by `addScriptCollection` so its `function Foo(`
 * regex ignores JSDoc / inline comments — a docstring example like
 * `function MyNode(this: HTMLElement, props)` previously masqueraded
 * as a real function declaration (#1236).
 *
 * Handles `//` line comments and `/* ... *\/` block comments (incl.
 * JSDoc). String literals are intentionally NOT masked: JSX text
 * content routinely contains unbalanced apostrophes (`How's`) that a
 * string-aware masker would misread as an open quote, blanking the
 * rest of the file and hiding later function declarations.
 *
 * Strings inside comments are handled implicitly: the whole comment
 * (including any quotes it contains) is blanked.
 *
 * **Known limitation**: this function does NOT track string
 * boundaries, so a `//` or `/*` appearing INSIDE a string literal is
 * still treated as a comment delimiter. Example: in
 * `const u = "https://x.y" ; export function Foo() {}` the `//` in
 * `https://` is misread as a line comment and the rest of the line is
 * blanked — a `function Foo()` on that same line would be hidden from
 * the regex. SSR template output (the only caller) does not embed
 * such cases in practice. If a future caller can produce them, swap
 * in a real lexer rather than extending this helper.
 */
export function maskComments(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    const next = s[i + 1]
    if (ch === '/' && next === '*') {
      const end = s.indexOf('*/', i + 2)
      const stop = end === -1 ? s.length : end + 2
      for (let j = i; j < stop; j++) out += s[j] === '\n' ? '\n' : ' '
      i = stop
      continue
    }
    if (ch === '/' && next === '/') {
      const end = s.indexOf('\n', i + 2)
      const stop = end === -1 ? s.length : end
      for (let j = i; j < stop; j++) out += ' '
      i = stop
      continue
    }
    out += ch
    i++
  }
  return out
}
