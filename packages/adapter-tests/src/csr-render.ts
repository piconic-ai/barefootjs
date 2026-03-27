/**
 * CSR test renderer
 *
 * Uses lower-level compiler APIs (analyzeComponent, jsxToIR, generateClientJs)
 * to produce client JS with forced CSR template generation.
 * No adapter is needed — only the client JS template function is evaluated.
 */

import {
  analyzeComponent,
  buildMetadata,
  jsxToIR,
  generateClientJs,
  analyzeClientNeeds,
  type ComponentIR,
} from '@barefootjs/jsx'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const CSR_TEMP_DIR = resolve(import.meta.dir, '../.csr-render-temp')

export interface CsrRenderOptions {
  /** JSX source code */
  source: string
  /** Props to inject (optional) */
  props?: Record<string, unknown>
  /** Additional component files (filename → source) */
  components?: Record<string, string>
}

/**
 * Compile JSX source to client JS with CSR template via lower-level APIs.
 * Forces template generation by adding the component name to usedAsChild.
 */
function throwIfErrors(ctx: { errors: Array<{ severity: string; message: string }> }, filePath: string): void {
  const errors = ctx.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors in ${filePath}:\n${errors.map(e => e.message).join('\n')}`)
  }
}

function compileToClientJs(source: string, filePath: string): string {
  const ctx = analyzeComponent(source, filePath)

  if (!ctx.jsxReturn) {
    throwIfErrors(ctx, filePath)
    return ''
  }

  const ir = jsxToIR(ctx)
  if (!ir) return ''

  throwIfErrors(ctx, filePath)

  const componentIR: ComponentIR = {
    version: '0.1',
    metadata: buildMetadata(ctx),
    root: ir,
    errors: [],
  }
  componentIR.metadata.clientAnalysis = analyzeClientNeeds(componentIR)

  return generateClientJs(componentIR)
}

export async function renderCsrComponent(options: CsrRenderOptions): Promise<string> {
  const { source, props = {}, components } = options

  // Compile child components first and collect their client JS
  const childClientJsList: string[] = []
  if (components) {
    for (const [filename, childSource] of Object.entries(components)) {
      const clientJs = compileToClientJs(childSource, filename)
      if (clientJs) childClientJsList.push(clientJs)
    }
  }

  // Compile main component
  const clientJs = compileToClientJs(source, 'component.tsx')
  if (!clientJs) throw new Error('No client JS generated')

  // Build evaluation module
  const allClientJs = [...childClientJsList, clientJs].join('\n')
  const code = buildCsrEvalModule(allClientJs, props)

  await mkdir(CSR_TEMP_DIR, { recursive: true })
  const tempFile = resolve(
    CSR_TEMP_DIR,
    `csr-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  )
  await Bun.write(tempFile, code)

  try {
    const mod = await import(tempFile)
    return mod.default ?? ''
  } finally {
    await rm(tempFile, { force: true }).catch(() => {})
  }
}

/**
 * Build a self-contained ES module that evaluates CSR template functions.
 *
 * Strategy:
 * 1. Define mock runtime functions (hydrate registers templates, renderChild renders them)
 * 2. Execute client JS code (stripped of imports) which calls hydrate() for each component
 * 3. The last component registered is the main one — evaluate its template with props
 */
function buildCsrEvalModule(clientJs: string, props: Record<string, unknown>): string {
  // Strip ES module import statements (named imports and bare side-effect imports)
  const strippedCode = clientJs
    .replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?\s*$/gm, '')
    .replace(/^import\s+['"][^'"]*['"];?\s*$/gm, '')

  return `
// --- Mock runtime ---
const __templates = new Map()
let __lastComponent = null

function hydrate(name, def) {
  if (def.template) __templates.set(name, def.template)
  __lastComponent = name
}

function renderChild(name, props, key, suffix) {
  const template = __templates.get(name)
  // Static children (with suffix): use deterministic scope ID matching SSR pattern
  // Loop children (no suffix): use component name + random hash
  const scopeId = suffix
    ? 'test_' + suffix
    : '~' + name + '_' + Math.random().toString(36).slice(2, 8)
  const keyAttr = key !== undefined ? ' data-key="' + key + '"' : ''
  if (!template) return '<div bf-s="' + scopeId + '"' + keyAttr + '>[' + name + ']</div>'
  const html = template(props).trim()
  return html.replace(/^(<\\w+)/, '$1 bf-s="' + scopeId + '"' + keyAttr)
}

// Noop stubs for init-phase functions (not needed for template evaluation)
const $ = (...args) => new Array(args.length - 1).fill(null)
const $t = (...args) => new Array(args.length - 1).fill(null)
const $c = (...args) => new Array(args.length - 1).fill(null)
const createSignal = (v) => [() => v, () => {}]
const createEffect = () => {}
const createMemo = (fn) => fn
const onMount = () => {}
const onCleanup = () => {}
const insert = () => {}
const reconcileElements = () => {}
const updateClientMarker = () => {}
const initChild = () => {}
const createComponent = () => null
const createPortal = () => {}
const applyRestAttrs = () => {}
const provideContext = () => {}
const useContext = () => undefined

// --- Execute client JS (registers templates via hydrate()) ---
${strippedCode}

// --- Evaluate main component template ---
const __templateFn = __templates.get(__lastComponent)
let __html = __templateFn ? __templateFn(${JSON.stringify(props)}) : ''
// Inject bf-s="test" on root element to match SSR scope ID convention.
// Insert before bf= marker to match SSR attribute order.
if (__html.match(/^<\\w+[^>]* bf="/)) {
  __html = __html.replace(/ bf="/, ' bf-s="test" bf="')
} else {
  __html = __html.replace(/^(<\\w+)/, '$1 bf-s="test"')
}
export default __html
`
}
