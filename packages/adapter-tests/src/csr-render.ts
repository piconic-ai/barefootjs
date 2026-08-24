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
  decideClientOnlyElision,
  type ComponentIR,
} from '@barefootjs/jsx'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

// The CSR runtime is a JS engine, so — like Hono / any `JsxAdapter` — it runs
// an off-subset callback body (`filter`/`sort` predicate the compiler can't
// lower) verbatim. Model that capability here so the CSR harness compiles such
// a predicate instead of tripping the DSL-only BF021. See
// `spec/callback-fidelity.md`.
const csrAcceptsCallbackBody = () => true

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
    const ctx = analyzeComponent(source, filePath, undefined, undefined, csrAcceptsCallbackBody)
    if (!ctx.jsxReturn) {
      throwIfErrors(ctx, filePath)
      return ''
    }
    const ir = jsxToIR(ctx)
    if (!ir) return ''
    throwIfErrors(ctx, filePath)
    // Slot unification Step B: mirror `compiler.ts`'s call before
    // `generateClientJs` — this harness bypasses `compileJSX` entirely, so
    // without this the CSR output here would never match the elision the
    // production pipeline (and this same fixture's SSR adapter output)
    // applies, a false byte-parity divergence.
    decideClientOnlyElision(ir)
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
    const ctx = analyzeComponent(source, filePath, componentName, undefined, csrAcceptsCallbackBody)
    if (!ctx.jsxReturn) {
      throwIfErrors(ctx, filePath)
      continue
    }
    const ir = jsxToIR(ctx)
    if (!ir) continue
    throwIfErrors(ctx, filePath)
    // Slot unification Step B — see the fallback branch above for why.
    decideClientOnlyElision(ir)
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
// Mirrors production's \`ComponentDef.comment\` (@barefootjs/client/runtime,
// component.ts): \`comment: true\` marks a synthesized inline-JSX-callback
// wrapper (#1211) whose render is transparent — the wrapper's own \`bf-s\` is
// never stamped because the parsed firstChild IS the inner component's root.
// Recorded here so the root bf-s injection below can skip it the same way.
const __comments = new Map()
let __lastComponent = null

function hydrate(name, def) {
  if (def.template) __templates.set(name, def.template)
  if (def.init) __inits.set(name, def.init)
  __comments.set(name, !!def.comment)
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

// Tracks the scope id a nested renderChild() call should derive from —
// mirrors production's \`_parentScopeId\` (@barefootjs/client/runtime,
// component.ts). Starts at \`__rootScope\` (the fixture root).
let __parentScope = __rootScope

function renderChild(name, props, key, suffix) {
  const template = __templates.get(name)
  // Static children (with suffix): use deterministic scope ID matching SSR pattern
  // Loop children (no suffix): use component name + random hash
  const scopeId = suffix
    ? __parentScope + '_' + suffix
    : '~' + name + '_' + Math.random().toString(36).slice(2, 8)
  const keyAttr = key !== undefined ? ' data-key="' + key + '"' : ''
  // Slot-relationship markers (bf-h/bf-m) — mirrors the production
  // runtime renderChild in @barefootjs/client/runtime so CSR conformance
  // output asserts the same shape SSR emits.
  const slotAttrs = suffix ? ' bf-h="' + __parentScope + '" bf-m="' + suffix + '"' : ''
  if (!template) return '<div bf-s="' + scopeId + '"' + slotAttrs + keyAttr + '>[' + name + ']</div>'
  // Push \`__parentScope\` to this child's own derived scope while
  // \`template\` evaluates — mirrors production's renderChild
  // (@barefootjs/client/runtime, component.ts, its \`_parentScopeId\` push
  // around \`templateFn(props)\`, #2649) so a grandchild rendered inside
  // this child derives its scope from THIS scope rather than the
  // caller's, matching SSR (\`test_s0_s0\` instead of collapsing onto
  // \`test_s0\`).
  const __prevParentScope = __parentScope
  __parentScope = scopeId
  let __rawHtml
  try {
    __rawHtml = template(props)
  } finally {
    __parentScope = __prevParentScope
  }
  // #1320: substitute the hoisted-children placeholder with the CALLER's
  // scope (\`__parentScope\`, restored by the \`finally\` above before this
  // line runs). Mirrors the production renderChild in @barefootjs/client/runtime.
  // Anchored to the exact attribute shape so user text containing the
  // sentinel is left alone.
  const html = __rawHtml.trim()
    .replace(/\\s+bf-s="__BF_PARENT_SCOPE__"/g, ' bf-s="' + __parentScope + '"')
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
// Env signal (router v0.5): mirrors @barefootjs/client's \`createSearchParams\`
// import surface — production returns a \`createSignal\`-shaped
// \`[getter, setter]\` tuple (reactive.ts's \`searchParamsTuple\`), so the mock
// matches that shape. The harness has no real request, so the getter
// resolves to an empty query (matching the SSR conformance default).
//
// Deliberately NOT also providing a bare module-scope \`searchParams\`
// binding: generated client JS destructures the getter out of
// \`createSearchParams()\` inside \`init...\` only — the template lambda
// references that destructured name directly. Emitted templates now
// carry their own env-signal prelude (\`const [sp] = createSearchParams()\`,
// the #2654 fix), which resolves against this stub. A bare
// \`searchParams\` stub here would silently paper over that
// ReferenceError instead of reproducing it, which is exactly how the
// bug stayed hidden until a fixture aliased the getter to \`sp\`.
// Shared tuple constant, not a fresh pair per call: production's
// \`createSearchParams()\` returns the stable request/document-scoped
// \`searchParamsTuple\` singleton, so per-call identity must match too.
const __searchParamsTuple = [() => new URLSearchParams(), () => {}]
const createSearchParams = () => __searchParamsTuple
const onMount = () => {}
const onCleanup = () => {}
const insert = () => {}
// Claim-plan interpreter stubs (slot unification A2/A3): \`lazySlots\`/
// \`claimSlots\` are called at init time (not deferred inside \`createEffect\`),
// so — like \`$\`/\`$t\`/\`$c\` above — they must at least return a benign no-op
// writer rather than throw, even though this harness never executes an
// actual DOM claim.
const lazySlots = () => () => {}
const claimSlots = () => ({ write: () => {} })
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
// Mirror @barefootjs/client/runtime bfMarkup/isBfMarkup (#2651): the
// JSX-element-as-non-children-prop markup brand. The compiler wraps an
// assembled HTML string in \`bfMarkup(...)\` at the producer (renderChild /
// initChild props); \`escapeTextOrMarkup\`/\`escapeTextOrNode\` below unwrap
// it raw instead of escaping it. A plain string key (not a Symbol) — see
// the production docstring for why.
const bfMarkup = (html) => ({ __bfMarkup: html })
const isBfMarkup = (value) => {
  if (typeof value !== 'object' || value === null) return false
  // Plain carrier objects only — mirrors production's prototype check so a
  // host object with a \`__bfMarkup\` expando never false-positives.
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return false
  return typeof value.__bfMarkup === 'string'
}
// Mirror @barefootjs/client/runtime escapeTextOrMarkup (#2651): the STATIC/
// initial-render counterpart of escapeTextOrNode below — a claim-plan
// 'markup' slot's escape at template-build time. Branded values pass
// through raw; everything else gets the ordinary escapeText treatment.
const escapeTextOrMarkup = (value) => isBfMarkup(value) ? value.__bfMarkup : escapeText(value)
// Mirror @barefootjs/client/runtime escapeTextOrNode: a claimed 'markup'
// writer's value may be a live Node (spliced by identity), a bfMarkup()-
// branded value (#2651, unwrapped raw — same reasoning as
// escapeTextOrMarkup above), or a plain value (escaped like escapeText,
// above) — generated code calls this wrapper so a string never reaches
// \`writeMarkup\`'s \`innerHTML =\` unescaped. The harness never constructs a
// real Node, but must still mirror the branch so a template evaluating
// this call doesn't throw on a string value.
const escapeTextOrNode = (value) =>
  isBfMarkup(value) ? value.__bfMarkup :
  (typeof Node !== 'undefined' && value instanceof Node) ? value : escapeText(value)
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
function formatDate(dateArg, pattern, timeZone = 'UTC', names = []) {
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
  const weekday = s.getUTCDay()
  const pad2 = (n) => String(n).padStart(2, '0')
  const nameAt = (i) => names[i] ?? ''
  return pattern.replace(/YYYY|MMMM|MMM|MM|DD|dddd|ddd|M|D/g, (token) =>
    token === 'YYYY' ? yyyy
      : token === 'MMMM' ? nameAt(month - 1)
      : token === 'MMM' ? nameAt(12 + month - 1)
      : token === 'MM' ? pad2(month)
      : token === 'M' ? String(month)
      : token === 'DD' ? pad2(day)
      : token === 'D' ? String(day)
      : token === 'dddd' ? nameAt(24 + weekday)
      : nameAt(31 + weekday),
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
// bf-s from a nested renderChild call (#1320 dedup), AND skip when the
// main component itself is a \`comment: true\` transparent wrapper —
// mirrors production's \`createComponent\` (component.ts), which leaves
// \`scopeId === null\` for such wrappers rather than stamping their own
// bf-s over the inner component's root (#2653).
if (!__comments.get(__lastComponent) && !/^<\\w+[^>]*\\sbf-s="/.test(__html)) {
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
