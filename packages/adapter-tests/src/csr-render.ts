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
  listComponentFunctions,
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
  // Compile every component declared in the source file, mirroring the
  // production `compileMultipleComponents` flow (`packages/jsx/src/compiler.ts`).
  // A single-component compile would miss sibling components defined in the
  // same file — including module-scope declarations such as
  // `const Ctx = createContext(...)` that only the Provider-owning sibling
  // emits at module level. The CSR harness needs the full set so the
  // template lambdas can resolve cross-component module references (#1295).
  const componentNames = listComponentFunctions(source, filePath)
  if (componentNames.length === 0) {
    // Fall back to default-export resolution (preserves prior behaviour for
    // sources where `listComponentFunctions` returns nothing).
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

  const outputs: string[] = []
  for (const componentName of componentNames) {
    const ctx = analyzeComponent(source, filePath, componentName)
    if (!ctx.jsxReturn) {
      throwIfErrors(ctx, filePath)
      continue
    }
    const ir = jsxToIR(ctx)
    if (!ir) continue
    throwIfErrors(ctx, filePath)
    const componentIR: ComponentIR = {
      version: '0.1',
      metadata: buildMetadata(ctx),
      root: ir,
      errors: [],
    }
    componentIR.metadata.clientAnalysis = analyzeClientNeeds(componentIR)
    const js = generateClientJs(componentIR, componentNames)
    if (js) outputs.push(js)
  }
  return outputs.join('\n')
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
const __inits = new Map()
let __lastComponent = null

function hydrate(name, def) {
  if (def.template) __templates.set(name, def.template)
  if (def.init) __inits.set(name, def.init)
  __lastComponent = name
}

// Minimal stub scope so init bodies that read \`__scope.getAttribute\`
// don't throw. Real CSR runs init against the live DOM root; this mock
// substitutes a no-op object since template-eval doesn't depend on the
// scope's identity, only on what init writes to module-level state
// (e.g. provideContext for context-provider fixtures).
const __stubScope = { getAttribute: () => 'test', querySelectorAll: () => [], children: [] }
function __runInit(name, props) {
  const init = __inits.get(name)
  if (init) {
    try { init(__stubScope, props ?? {}) } catch {}
  }
}

function renderChild(name, props, key, suffix) {
  const template = __templates.get(name)
  // Static children (with suffix): use deterministic scope ID matching SSR pattern
  // Loop children (no suffix): use component name + random hash
  const scopeId = suffix
    ? 'test_' + suffix
    : '~' + name + '_' + Math.random().toString(36).slice(2, 8)
  const keyAttr = key !== undefined ? ' data-key="' + key + '"' : ''
  // Slot-relationship markers (bf-h/bf-m) — mirrors the production
  // runtime renderChild in @barefootjs/client/runtime so CSR conformance
  // output asserts the same shape SSR emits.
  //
  // Mock-only constraint: \`bf-h="test"\` is hardcoded because this
  // stub doesn't carry through the real \`_parentScopeId\` chain. The
  // outer fixture root is always given bf-s="test", so children always
  // get bf-h="test". Both \`normalizeHTML\` (cross-adapter) and the
  // CSR conformance test strip these attributes before comparison, so
  // the hardcoded value is invisible to assertions today. If a future
  // CSR test wants to assert on the bf-h value itself, this mock
  // needs to be rewritten to track the actual parent scope at call time.
  const slotAttrs = suffix ? ' bf-h="test" bf-m="' + suffix + '"' : ''
  if (!template) return '<div bf-s="' + scopeId + '"' + slotAttrs + keyAttr + '>[' + name + ']</div>'
  const html = template(props).trim()
  // Same attribute-ordering rule as the root-injection block below: when
  // the child root has user attributes (\`class\`, \`id\`, …) but no
  // \`bf="..."\` to anchor on, append \`bf-s\` at the end of the opening
  // tag so static attributes precede it — matching SSR's attribute
  // order (#1295 / Hono renderElement).
  const childAttrs = ' bf-s="' + scopeId + '"' + slotAttrs + keyAttr
  if (html.match(/^<\\w+[^>]* bf="/)) {
    return html.replace(/ bf="/, childAttrs + ' bf="')
  }
  if (html.match(/^<\\w+\\s[^>]*>/)) {
    return html.replace(/^(<\\w+\\s[^>]*?)(\\s*\\/?>)/, '$1' + childAttrs + '$2')
  }
  return html.replace(/^(<\\w+)/, '$1' + childAttrs)
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
const initChild = (name, _scope, props) => { __runInit(name, props) }
const createComponent = () => null
const createPortal = () => {}
const applyRestAttrs = () => {}
// Minimal Context model so fixtures with \`createContext\`/\`Provider\`
// (e.g. \`context-provider\`) can resolve \`useContext(ctx)\` during
// template eval. Real \`@barefootjs/client/runtime\` walks the DOM scope
// chain; the harness collapses that to a single global Map keyed by
// context identity since CSR conformance only renders one component tree
// at a time. (#1295)
const __ctxStore = new Map()
const createContext = (defaultValue) => ({ __bfCtxId: Symbol(), defaultValue })
const provideContext = (ctx, value) => { __ctxStore.set(ctx.__bfCtxId, value) }
const useContext = (ctx) => __ctxStore.has(ctx.__bfCtxId) ? __ctxStore.get(ctx.__bfCtxId) : ctx?.defaultValue
function styleToCss(value) {
  if (value == null) return null
  if (typeof value !== 'object') return String(value)
  const parts = []
  for (const [k, v] of Object.entries(value)) {
    if (v == null) continue
    const prop = k.replace(/[A-Z]/g, (m) => \`-\${m.toLowerCase()}\`)
    parts.push(\`\${prop}:\${v}\`)
  }
  return parts.join(';') || null
}

// --- Execute client JS (registers templates via hydrate()) ---
${strippedCode}

// --- Run main component init (so Provider state is set, child inits cascade) ---
__runInit(__lastComponent, ${JSON.stringify(props)})

// --- Evaluate main component template ---
const __templateFn = __templates.get(__lastComponent)
let __html = __templateFn ? __templateFn(${JSON.stringify(props)}) : ''
// Inject bf-s="test" on root element to match SSR scope ID convention.
// SSR (Hono renderElement) appends bf-s AFTER user-defined attributes,
// so for stateful roots the order is \`class="..." bf-s="..." bf="..."\`.
// Insert before \`bf="..."\` when present (preserves bf-s adjacency to the
// reactive marker); otherwise append at the end of the opening tag so
// existing static attributes (e.g. \`class\`) come first. Falls back to
// the tag-name-only case for tags with no attributes.
if (__html.match(/^<\\w+[^>]* bf="/)) {
  __html = __html.replace(/ bf="/, ' bf-s="test" bf="')
} else if (__html.match(/^<\\w+\\s[^>]*>/)) {
  __html = __html.replace(/^(<\\w+\\s[^>]*?)(\\s*\\/?>)/, '$1 bf-s="test"$2')
} else {
  __html = __html.replace(/^(<\\w+)/, '$1 bf-s="test"')
}
export default __html
`
}
