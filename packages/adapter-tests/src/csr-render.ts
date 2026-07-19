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

  // Root scope id for the rendered tree. Shared / UI fixtures pass a
  // deterministic `__instanceId` (`<ComponentName>_test`) so the CSR
  // output's root `bf-s` canonicalises to `<ComponentName>_*` under
  // `normalizeHTML`, matching the SSR snapshot (#1467 Phase 2a). Other
  // fixtures carry no `__instanceId`; they fall back to the legacy
  // hardcoded `test`, so their output is unchanged.
  const rootScope =
    typeof props.__instanceId === 'string' && props.__instanceId
      ? props.__instanceId
      : 'test'

  return `
// --- Mock runtime ---
const __rootScope = ${JSON.stringify(rootScope)}
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
    ? __rootScope + '_' + suffix
    : '~' + name + '_' + Math.random().toString(36).slice(2, 8)
  const keyAttr = key !== undefined ? ' data-key="' + key + '"' : ''
  // Slot-relationship markers (bf-h/bf-m) — mirrors the production
  // runtime renderChild in @barefootjs/client/runtime so CSR conformance
  // output asserts the same shape SSR emits.
  //
  // Mock-only constraint: \`bf-h\` is set to the single outer
  // \`__rootScope\` because this stub doesn't carry through the real
  // \`_parentScopeId\` chain. The outer fixture root is always given
  // bf-s="\${__rootScope}", so children always get the matching bf-h.
  // Both \`normalizeHTML\` (cross-adapter) and the CSR conformance test
  // strip these attributes before comparison, so the value is invisible
  // to assertions today. If a future CSR test wants to assert on the
  // bf-h value itself, this mock needs to be rewritten to track the
  // actual parent scope at call time.
  const slotAttrs = suffix ? ' bf-h="' + __rootScope + '" bf-m="' + suffix + '"' : ''
  if (!template) return '<div bf-s="' + scopeId + '"' + slotAttrs + keyAttr + '>[' + name + ']</div>'
  // #1320: substitute the hoisted-children placeholder with the harness's
  // hardcoded outer scope (\`test\`). Mirrors the production renderChild
  // in @barefootjs/client/runtime. Anchored to the exact attribute
  // shape so user text containing the sentinel is left alone.
  const html = template(props).trim()
    .replace(/\\s+bf-s="__BF_PARENT_SCOPE__"/g, ' bf-s="' + __rootScope + '"')
  const bfsAttr = ' bf-s="' + scopeId + '"'
  const extraAttrs = slotAttrs + keyAttr
  // Dedupe bf-s only when the child template already carries one
  // (it was itself a renderChild call). slotAttrs / keyAttr still inject —
  // dropping them would regress list reconciliation. (#1320)
  const childRootHasBfs = /^<\\w+[^>]*\\sbf-s="/.test(html)
  const childAttrs = childRootHasBfs ? extraAttrs : bfsAttr + extraAttrs
  if (childRootHasBfs && !extraAttrs) return html
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
// Env signal (router v0.5): the template reads \`searchParams().get(k)\`; the
// harness has no real request, so it resolves to an empty query (matching the
// SSR conformance default).
const searchParams = () => new URLSearchParams()
const onMount = () => {}
const onCleanup = () => {}
const insert = () => {}
const reconcileElements = () => {}
const updateClientMarker = () => {}
const initChild = (name, _scope, props) => { __runInit(name, props) }
const createComponent = () => null
const createPortal = () => {}
const applyRestAttrs = () => {}
// Mirror @barefootjs/client/runtime escapeAttr: HTML-escape an
// interpolated attribute value (Hono's set: & " ' < >) so CSR template
// output matches the SSR-escaped reference. The harness strips the
// runtime import, so the template's escapeAttr(...) calls need this stub.
const escapeAttr = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
// Mirror @barefootjs/client/runtime escapeText: text-content escaping uses
// the same set as attributes (Hono escapes text identically). A nullish
// value renders as empty text (JSX/Solid semantics; #2137) — otherwise a
// bare \`{props.x}\` on an absent prop would surface literal "undefined".
const escapeText = (value) => value == null ? '' : escapeAttr(value)
// Mirror @barefootjs/client/runtime/spread-attrs.ts: format a record of
// attributes as an HTML attribute string for use inside template literals.
// The real runtime helper is imported by generated client JS, but the
// CSR harness strips imports and provides its own stubs, so this mock
// has to match the production behaviour or templates calling
// \`spreadAttrs(signal())\` will throw at template-eval time (#1317).
function spreadAttrs(obj) {
  if (!obj || typeof obj !== 'object') return ''
  const parts = []
  for (const [key, value] of Object.entries(obj)) {
    if (value == null || value === false) continue
    if (key.startsWith('on') && key.length > 2 && key[2] === key[2].toUpperCase()) continue
    if (key === 'children') continue
    if (key === 'style') {
      const css = styleToCss(value)
      if (css != null) parts.push(\`style="\${css}"\`)
      continue
    }
    const attr = key === 'className' ? 'class' : key === 'htmlFor' ? 'for'
      : key.replace(/([A-Z])/g, '-$1').toLowerCase()
    parts.push(value === true ? attr : \`\${attr}="\${value}"\`)
  }
  return parts.join(' ')
}
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
// Mirror @barefootjs/client/runtime/date.ts: the catalogued \`Date\` lowering
// (#2274/#2292) helper. \`recv\` is a real Date OR the ISO-string form a
// Date-typed prop arrives as post-hydration/JSON; a nil or unparseable
// receiver degrades to the zero value instead of throwing. The harness
// strips imports and stubs the runtime itself (like escapeAttr/spreadAttrs
// above), so \`date(...)\` calls in generated template/init code need this
// mock or every date-catalogued fixture fails with "date is not defined".
function date(recv, op) {
  const zero = op === 'toISOString' ? '' : 0
  if (recv === null || recv === undefined) return zero
  const d = recv instanceof Date ? recv : new Date(recv)
  if (Number.isNaN(d.getTime())) return zero
  return d[op]()
}
// Mirror @barefootjs/client's formatDate (#2324): the pure-function date
// formatter. Same stripped-imports reasoning as \`date\` above — the user's
// own \`import { formatDate } from '@barefootjs/client'\` is stripped with
// every other import, so the call in template/init code needs this mirror.
function formatDate(dateArg, pattern, timeZone = 'UTC') {
  // Nullish guard mirrors the client implementation: new Date(null) is
  // epoch 0, not Invalid Date, and the contract renders nil as ''.
  if (dateArg === null || dateArg === undefined) return ''
  const d = dateArg instanceof Date ? dateArg : new Date(dateArg)
  const t = d.getTime()
  if (Number.isNaN(t)) return ''
  const m = /^([+-])(\\d{2}):(\\d{2})$/.exec(timeZone)
  const offsetMinutes = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0
  const s = new Date(t + offsetMinutes * 60_000)
  const year = s.getUTCFullYear()
  const yyyy = (year < 0 ? '-' : '') + String(Math.abs(year)).padStart(4, '0')
  const month = s.getUTCMonth() + 1
  const day = s.getUTCDate()
  const pad2 = (n) => String(n).padStart(2, '0')
  return pattern.replace(/YYYY|MM|DD|M|D/g, (token) =>
    token === 'YYYY' ? yyyy
      : token === 'MM' ? pad2(month)
      : token === 'M' ? String(month)
      : token === 'DD' ? pad2(day)
      : String(day),
  )
}

// --- Execute client JS (registers templates via hydrate()) ---
${strippedCode}

// --- Run main component init (so Provider state is set, child inits cascade) ---
__runInit(__lastComponent, ${JSON.stringify(props)})

// --- Evaluate main component template ---
const __templateFn = __templates.get(__lastComponent)
let __html = __templateFn ? __templateFn(${JSON.stringify(props)}) : ''
// #1320: resolve any hoisted-children placeholder that didn't pass
// through a nested renderChild. The outer bf-s="test" injection
// below runs second, so this substitution must precede it.
__html = __html.replace(/\\s+bf-s="__BF_PARENT_SCOPE__"/g, ' bf-s="' + __rootScope + '"')
// Inject bf-s="\${__rootScope}" on the root element to match SSR scope
// ID convention — appended AFTER user-defined attributes, mirroring
// Hono renderElement (#1295). Skip when the root already carries
// bf-s from a nested renderChild call (#1320 dedup).
if (!/^<\\w+[^>]*\\sbf-s="/.test(__html)) {
if (__html.match(/^<\\w+[^>]* bf="/)) {
  __html = __html.replace(/ bf="/, ' bf-s="' + __rootScope + '" bf="')
} else if (__html.match(/^<\\w+\\s[^>]*>/)) {
  __html = __html.replace(/^(<\\w+\\s[^>]*?)(\\s*\\/?>)/, '$1 bf-s="' + __rootScope + '"$2')
} else {
  __html = __html.replace(/^(<\\w+)/, '$1 bf-s="' + __rootScope + '"')
}
}
export default __html
`
}
