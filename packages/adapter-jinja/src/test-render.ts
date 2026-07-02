/**
 * Jinja2 template test renderer
 *
 * Compiles JSX source with `JinjaAdapter` and renders the resulting `.jinja`
 * templates to HTML via `python3` + `Jinja2` driven through the bundled
 * `barefootjs` Python runtime (`packages/adapter-jinja/python/barefootjs/`:
 * `runtime.BarefootJS` + `backend_jinja.JinjaBackend`). Used by the
 * adapter-tests conformance runner (`runAdapterConformanceTests`).
 *
 * Near-mechanical port of the sibling Xslate harness
 * (`packages/adapter-xslate/src/test-render.ts`) — same `RenderOptions`
 * contract, same prop / signal / memo seeding order, same multi-component
 * child-renderer registration via the production `register_child_renderer`
 * path (so a child's `bf-s` scope id derives from `<parentScope>_<slotId>`
 * exactly as a real `bf build` page would). Only the target language of the
 * generated render script (Python, not Perl) and its literal syntax differ.
 */

import { compileJSX, extractSsrDefaults, importsSearchParams } from '@barefootjs/jsx'
import type { ComponentIR } from '@barefootjs/jsx'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const RENDER_TEMP_DIR = resolve(import.meta.dir, '../.render-temp')
// The bundled Python runtime (`barefootjs.BarefootJS` + `barefootjs.backend_jinja.JinjaBackend`)
// lives alongside this package (mirrors adapter-go-template bundling `runtime/`
// in-tree). The render script's `sys.path` must include this directory so
// `import barefootjs` resolves.
const PYTHON_DIR = resolve(import.meta.dir, '../python')

export class PythonNotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PythonNotAvailableError'
  }
}

/**
 * Recover the bare component name from a compiler-emitted template file
 * path. `templatesPerComponent` adapters write each component to
 * `<dir>/<ComponentName><adapter.extension>` (Jinja: `.jinja`), and
 * downstream pairing logic needs the raw component name back so it can
 * look up the matching IR in `irsByName`.
 *
 * Exported for testing.
 */
export function templateBaseName(path: string, extension: string): string {
  const filename = path.substring(path.lastIndexOf('/') + 1)
  return filename.endsWith(extension)
    ? filename.slice(0, -extension.length)
    : filename
}

let _pythonAvailable: boolean | null = null
async function isJinjaAvailable(): Promise<boolean> {
  if (_pythonAvailable !== null) return _pythonAvailable
  try {
    const proc = Bun.spawn(['python3', '-c', 'import jinja2'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    await proc.exited
    _pythonAvailable = proc.exitCode === 0
  } catch {
    _pythonAvailable = false
  }
  return _pythonAvailable
}

export interface RenderOptions {
  /** JSX source code */
  source: string
  /** Template adapter to use */
  adapter: import('@barefootjs/jsx').TemplateAdapter
  /** Props to inject (optional) */
  props?: Record<string, unknown>
  /** Additional component files (filename → source) */
  components?: Record<string, string>
  /**
   * Explicit component to render when `source` declares multiple
   * exports (e.g. `ReactiveProps.tsx` → `PropsReactivityComparison`).
   * Mirrors the Hono reference's `componentName`; omitted for
   * single-export fixtures, which fall back to the default/first export.
   */
  componentName?: string
}

export async function renderJinjaComponent(options: RenderOptions): Promise<string> {
  const { source, adapter, props, components, componentName: requestedName } = options

  // Compile child components first.
  //
  // A child SOURCE FILE may export more components than the parent actually
  // references (e.g. `../icon` exports ~30 icons + a generic `Icon`, but
  // `Checkbox` only imports `CheckIcon`). Some of those unreferenced
  // components legitimately can't lower to Jinja — the generic `Icon` spreads
  // `{...props}` onto CHILD components (`<GitHubIcon {...props}/>`), which has
  // no Jinja dict-splat form (Jinja dict literals can't splat a runtime dict
  // into named entries at a call site). Throwing on those would block a
  // fixture that never renders them. So defer the per-file error gate: collect
  // every component's template + IR up front, then (after the parent compile
  // pins the reachable set) re-generate ONLY the reachable children and throw
  // if any of THOSE error. Mirrors the Xslate harness's reachable-children
  // emission (#checkbox).
  const childTemplates: Map<string, { template: string; ir: ComponentIR }> = new Map()
  if (components) {
    for (const [filename, childSource] of Object.entries(components)) {
      const childResult = compileJSX(childSource, filename, { adapter, outputIR: true })
      const childTemplateFiles = childResult.files.filter(f => f.type === 'markedTemplate')
      if (childTemplateFiles.length === 0) throw new Error(`No marked template for ${filename}`)
      const childIrFiles = childResult.files.filter(f => f.type === 'ir')
      if (childIrFiles.length === 0) throw new Error(`No IR output for ${filename}`)
      const childIrs = childIrFiles.map(f => JSON.parse(f.content) as ComponentIR)
      if (childTemplateFiles.length === 1) {
        childTemplates.set(childIrs[0].metadata.componentName, { template: childTemplateFiles[0].content, ir: childIrs[0] })
      } else {
        // Multi-component child source: pair template ↔ IR by basename.
        const childIrsByName = new Map(childIrs.map(i => [i.metadata.componentName, i]))
        for (const tf of childTemplateFiles) {
          const baseName = templateBaseName(tf.path, adapter.extension)
          const matchedIR = childIrsByName.get(baseName) ?? childIrs[0]
          childTemplates.set(matchedIR.metadata.componentName, { template: tf.content, ir: matchedIR })
        }
      }
    }
  }

  // Compile parent source.
  const result = compileJSX(source, 'component.tsx', { adapter, outputIR: true })

  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors:\n${errors.map(e => e.message).join('\n')}`)
  }

  const templateFiles = result.files.filter(f => f.type === 'markedTemplate')
  if (templateFiles.length === 0) throw new Error('No marked template in compile output')

  const irFiles = result.files.filter(f => f.type === 'ir')
  if (irFiles.length === 0) throw new Error('No IR output (set outputIR: true)')
  const irs = irFiles.map(f => JSON.parse(f.content) as ComponentIR)
  // Explicit `componentName` wins (multi-export sources pin the render
  // target); otherwise default-export, first inline-exported, first IR.
  // Mirrors the Hono reference so multi-component fixtures render the
  // same export across adapters.
  const ir =
    (requestedName ? irs.find(i => i.metadata.componentName === requestedName) : undefined) ??
    irs.find(i => i.metadata.hasDefaultExport) ??
    irs.find(i => i.metadata.isExported) ??
    irs[0]

  let templateFile: { content: string } | undefined
  if (templateFiles.length === 1) {
    templateFile = templateFiles[0]
  } else {
    // Multi-component source: split the entry-point template from
    // siblings by pairing each template file to its IR by basename.
    const irsByName = new Map(irs.map(i => [i.metadata.componentName, i]))
    for (const tf of templateFiles) {
      const baseName = templateBaseName(tf.path, adapter.extension)
      const matchedIR = irsByName.get(baseName)
      if (matchedIR === ir) {
        templateFile = tf
      } else if (matchedIR) {
        childTemplates.set(matchedIR.metadata.componentName, { template: tf.content, ir: matchedIR })
      }
    }
  }
  if (!templateFile) throw new Error('No marked template in compile output')

  // Reachable-children error gate (#checkbox). Now that the entry-point `ir` is
  // pinned, close transitively over its cross-file component imports and verify
  // each reachable child lowers without error — re-generating the child IR
  // through a fresh adapter to attribute errors per component (the aggregate
  // compile errors aren't component-tagged). A child file may export
  // unreferenced components that legitimately can't lower (e.g. `../icon`'s
  // generic `Icon`); those are dropped silently rather than failing a fixture
  // that never renders them.
  {
    const reachable = new Set<string>()
    const queue = [...collectImportedComponentNames(ir)]
    while (queue.length > 0) {
      const name = queue.shift()!
      if (reachable.has(name)) continue
      const entry = childTemplates.get(name)
      if (!entry) continue // in-source sibling or non-compiled import
      reachable.add(name)
      queue.push(...collectImportedComponentNames(entry.ir))
    }
    for (const name of reachable) {
      const entry = childTemplates.get(name)
      if (!entry) continue
      // The child was first compiled WITHOUT `siblingTemplatesRegistered`, so
      // `entry.ir.errors` may already carry suppressible BF103s (cross-template
      // loop references the harness DOES register). Re-generate with siblings
      // registered and inspect ONLY the errors that pass appends — `generate`
      // resets its own error list and appends to `ir.errors`, so anything after
      // the pre-existing count is the authoritative siblings-registered result.
      const before = entry.ir.errors?.length ?? 0
      adapter.generate(entry.ir, { siblingTemplatesRegistered: true })
      const childErrors = (entry.ir.errors ?? [])
        .slice(before)
        .filter(e => e.severity === 'error')
      if (childErrors.length > 0) {
        throw new Error(
          `Compilation errors in reachable child ${name}:\n${childErrors.map(e => e.message).join('\n')}`,
        )
      }
    }
  }

  const componentName = ir.metadata.componentName

  // Build temp directory.
  const tempDir = resolve(
    RENDER_TEMP_DIR,
    `jinja-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tempDir, { recursive: true })

  try {
    // Write `.jinja` files (parent + children), named by snake_case so
    // the adapter's `bf.render_child('<snake>', …)` calls + the backend's
    // `render_named('<snake>', …)` resolve from the dir.
    await Bun.write(resolve(tempDir, `${toSnakeCase(componentName)}.jinja`), templateFile.content)
    for (const [childName, { template }] of childTemplates) {
      await Bun.write(resolve(tempDir, `${toSnakeCase(childName)}.jinja`), template)
    }

    // Build props dict for Python.
    const propsPy = buildPythonProps(componentName, props, ir)

    // Honour `__instanceId` from props for the root scope id so
    // shared-component fixtures (which pin `<ComponentName>_test`) match
    // cross-adapter; default to 'test' otherwise.
    const rootScopeIdRaw = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'

    // Build child-renderer registration for Python.
    const childRenderers = buildChildRenderers(childTemplates, ir)

    const renderScript = `import sys
sys.path.insert(0, ${pyStr(PYTHON_DIR)})

import uuid

from barefootjs import BarefootJS, SearchParams
from barefootjs.backend_jinja import JinjaBackend
from barefootjs.runtime import jinja_ident

# Single Jinja2 backend over the temp template dir.
backend = JinjaBackend(paths=[${pyStr(tempDir)}])
bf = BarefootJS(None, {'backend': backend})
# Honour an explicit __instanceId so shared-component fixtures match the
# scope ids Hono / Go emit; default to 'test'.
bf._scope_id(${pyStr(rootScopeIdRaw)})

props = ${propsPy}

${childRenderers}
html = backend.render_named(${pyStr(toSnakeCase(componentName))}, bf, props)
sys.stdout.write(html)
`
    await Bun.write(resolve(tempDir, 'render.py'), renderScript)

    if (!(await isJinjaAvailable())) {
      throw new PythonNotAvailableError('python3 with jinja2 not found — skipping Jinja rendering')
    }

    const proc = Bun.spawn(['python3', 'render.py'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(`python3 render failed (exit ${exitCode}):\n${stderr}`)
    }

    return stdout
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Component names a component IR imports from sibling source files — i.e.
 * non-type imports from relative (`./` / `../`) specifiers. Used to compute the
 * transitive set of child components a fixture actually references (#checkbox).
 * Mirrors the Go / Xslate harness helper of the same name.
 */
function collectImportedComponentNames(ir: ComponentIR): string[] {
  const names: string[] = []
  for (const imp of ir.metadata.imports ?? []) {
    if (imp.isTypeOnly) continue
    if (!imp.source.startsWith('.')) continue
    for (const spec of imp.specifiers ?? []) {
      if (spec.isNamespace) continue
      names.push(spec.alias ?? spec.name)
    }
  }
  return names
}

/**
 * Build Python code that registers one child-component renderer per child
 * template via the production `BarefootJS.register_child_renderer`.
 *
 * The closure mirrors the manifest-driven path in `runtime.py`
 * (`register_components_from_manifest`'s `make_renderer`): it derives the
 * child scope id from `<parentScope>_<slotId>` (the parent's
 * `bf.render_child('<name>', {…, '_bf_slot': '<slotId>'})` passes
 * `_bf_slot`), seeds signal / memo / prop defaults from the child IR's
 * `ssrDefaults`, shares the parent's script list, and renders the child
 * `.jinja` through the same backend. Loop children (no `_bf_slot`) fall back
 * to `<ComponentName>_<random>` like the Xslate harness.
 *
 * `child_props` arrives ALREADY keyword-mangled: `bf.render_child` (the
 * runtime method the compiled parent template calls) mangles every prop key
 * via `jinja_ident` before invoking the registered renderer — see
 * `runtime.BarefootJS.render_child`'s docstring. So the rest-bag routing
 * below and the `_bf_slot` / `key` / `children` pops all compare against
 * ALREADY-mangled key spellings; the `keep` set mangles the child's declared
 * param names to match.
 */
function buildChildRenderers(
  childTemplates: Map<string, { template: string; ir: ComponentIR }>,
  _parentIR: ComponentIR,
): string {
  if (childTemplates.size === 0) return ''

  const lines: string[] = []
  lines.push(`# Register child component renderers`)

  for (const [componentName, { ir: childIR }] of childTemplates) {
    const snakeName = toSnakeCase(componentName)
    const fnSuffix = snakeName.replace(/[^a-zA-Z0-9_]/g, '_')
    // Statically-derived ssrDefaults the child template's vars seed from
    // (prop defaults + signal / memo initial values), serialised to a
    // Python dict literal.
    const ssrDefaults = extractSsrDefaults(childIR.metadata) ?? {}
    const defaultsPy = ssrDefaultsToPy(ssrDefaults)
    const restPropsName = childIR.metadata.restPropsName
    const paramNames = (childIR.metadata.propsParams ?? []).map(p => p.name)

    lines.push(`def _make_child_renderer_${fnSuffix}():`)
    lines.push(`    _defaults = ${defaultsPy}`)
    lines.push(`    def _renderer(child_props, caller_bf=None):`)
    // `caller_bf` is the instance whose template invoked render_child
    // (#1897) — nested children chain their scope/slot identity off it.
    lines.push(`        host_scope = caller_bf._scope_id() if caller_bf is not None else bf._scope_id()`)
    if (restPropsName) {
      // A child that destructures a rest bag references it in its template;
      // seed it with an empty dict when the caller didn't pass one so
      // Jinja's var lookup doesn't fault. Route non-param props into the
      // rest bag, mirroring the production runtime's
      // `_derive_stash_from_defaults` isRestProps branch and JSX rest
      // semantics: a caller prop the child didn't destructure belongs in
      // the bag, not as a top-level stash var the template never reads.
      const restKeyPy = pyStr(restPropsName)
      const keepNamesPy = pyList([...new Set([...paramNames, restPropsName, 'children', 'key', '_bf_slot'])])
      lines.push(`        _rest_key = jinja_ident(${restKeyPy})`)
      lines.push(`        child_props.setdefault(_rest_key, {})`)
      lines.push(`        _keep = {jinja_ident(k) for k in ${keepNamesPy}}`)
      lines.push(`        for _k in list(child_props.keys()):`)
      lines.push(`            if _k not in _keep:`)
      lines.push(`                child_props[_rest_key][_k] = child_props.pop(_k)`)
    }
    lines.push(`        slot_id = child_props.pop('_bf_slot', None)`)
    lines.push(`        child_bf = BarefootJS(None, {'backend': backend})`)
    // JSX `key` (reserved prop) → data-key on the child scope root, for keyed
    // loop reconciliation parity with Hono.
    lines.push(`        data_key = child_props.pop('key', None)`)
    lines.push(`        if data_key is not None:`)
    lines.push(`            child_bf._data_key(data_key)`)
    // A loop child (no slot) gets a fresh `<ComponentName>_<rand>` id per
    // iteration — the PascalCase name is what `normalizeHTML` canonicalises to
    // `<ComponentName>_*`; a slotted child derives from the parent scope.
    lines.push(`        if slot_id:`)
    lines.push(`            child_bf._scope_id(host_scope + '_' + slot_id)`)
    lines.push(`        else:`)
    lines.push(`            child_bf._scope_id(${pyStr(componentName)} + '_' + uuid.uuid4().hex[:6])`)
    lines.push(`        child_bf._is_child(True)`)
    lines.push(`        if slot_id:`)
    lines.push(`            child_bf._bf_parent(host_scope)`)
    lines.push(`            child_bf._bf_mount(slot_id)`)
    // (#1897) A child template may itself call `bf.render_child(...)`
    // (AccordionTrigger renders ChevronDownIcon) — inside that template
    // `bf` is THIS fresh child instance, whose renderer registry starts
    // empty, so the nested call silently rendered ''. Share the parent's
    // registry so nested child renders resolve.
    lines.push(`        child_bf._child_renderers(bf._child_renderers())`)
    lines.push(`        child_bf._scripts(bf._scripts())`)
    lines.push(`        child_bf._script_seen(bf._script_seen())`)
    // Seed template vars: static ssrDefaults first, caller's props win.
    lines.push(`        _vars = {**_defaults, **child_props}`)
    lines.push(`        rendered = backend.render_named(${pyStr(snakeName)}, child_bf, _vars)`)
    lines.push(`        if isinstance(rendered, str) and rendered.endswith('\\n'):`)
    lines.push(`            rendered = rendered[:-1]`)
    lines.push(`        return rendered`)
    lines.push(`    return _renderer`)
    lines.push(``)
    lines.push(`bf.register_child_renderer(${pyStr(snakeName)}, _make_child_renderer_${fnSuffix}())`)
    lines.push(``)
  }

  return lines.join('\n')
}

/** Render a JSON string-array as a Python list-of-strings literal. */
function pyList(names: string[]): string {
  return `[${names.map(pyStr).join(', ')}]`
}

/** Serialise an ssrDefaults map to a Python dict literal. */
function ssrDefaultsToPy(defaults: Record<string, unknown>): string {
  const entries: string[] = []
  for (const [name, d] of Object.entries(defaults)) {
    // ssrDefaults entries are `{ value, propName?, isRestProps? }` or a
    // bare value. The child renderer's caller props win, so we only need
    // the static fallback `value` here.
    let value: unknown = d
    if (d && typeof d === 'object' && 'value' in (d as Record<string, unknown>)) {
      value = (d as Record<string, unknown>).value
    }
    entries.push(`${pyStr(name)}: ${toPyLiteral(value)}`)
  }
  return `{${entries.join(', ')}}`
}

/**
 * Convert PascalCase to snake_case for template naming (matches the
 * adapter's `toTemplateName`).
 */
function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
}

/**
 * Build a Python dict literal from props (+ signal / memo seeds).
 */
function buildPythonProps(
  _componentName: string,
  props: Record<string, unknown> | undefined,
  ir: ComponentIR,
): string {
  const entries: string[] = []

  const explicitScope = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'
  entries.push(`${pyStr('scope_id')}: ${pyStr(explicitScope)}`)

  // Prop params with defaults (before signals, so signals can reference them).
  for (const param of ir.metadata.propsParams) {
    if (props && param.name in props) continue
    if (param.defaultValue) {
      const pyValue = jsToPyValue(param.defaultValue)
      if (pyValue !== null) {
        entries.push(`${pyStr(param.name)}: ${pyValue}`)
        continue
      }
    }
    // No default + no caller value: pass `None` so Jinja's var lookup for
    // an optional prop doesn't fault before its falsy branch elides.
    entries.push(`${pyStr(param.name)}: None`)
  }

  // Route undeclared props into the rest bag (`bf.spread_attrs($<rest>)`).
  const restPropsName = ir.metadata.restPropsName
  const declaredParams = new Set(ir.metadata.propsParams.map(p => p.name))
  const restBagEntries: Array<[string, unknown]> = []
  if (restPropsName && props) {
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('__')) continue
      if (key === restPropsName || declaredParams.has(key)) continue
      restBagEntries.push([key, value])
    }
  }
  const routedKeys = new Set(restBagEntries.map(([k]) => k))

  if (restPropsName && !(props && restPropsName in props)) {
    entries.push(`${pyStr(restPropsName)}: ${toPyLiteral(Object.fromEntries(restBagEntries))}`)
  }

  // User props.
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('__')) continue
      if (routedKeys.has(key)) continue
      if (typeof value === 'string') {
        entries.push(`${pyStr(key)}: ${pyStr(value)}`)
      } else if (typeof value === 'number') {
        entries.push(`${pyStr(key)}: ${pyNumber(value)}`)
      } else if (typeof value === 'boolean') {
        entries.push(`${pyStr(key)}: ${value ? 'True' : 'False'}`)
      } else if (Array.isArray(value) || (value && typeof value === 'object')) {
        entries.push(`${pyStr(key)}: ${toPyLiteral(value)}`)
      }
    }
  }

  // Signal values evaluated from props (after user props).
  for (const signal of ir.metadata.signals) {
    // Env signals (#2057) are bound below via `SearchParams('')`, not from a
    // static initial value.
    if (signal.envReader) continue
    const value = evaluateSignalInit(signal.initialValue.trim(), props)
    if (value !== null) {
      entries.push(`${pyStr(signal.getter)}: ${toPyLiteral(value)}`)
    }
  }

  // Memo values seeded from the statically-evaluated ssrDefaults, same
  // as the production plugin's before_render hook.
  const ssrDefaults = extractSsrDefaults(ir.metadata) ?? {}
  for (const memo of ir.metadata.memos) {
    const entry = ssrDefaults[memo.name]
    const value = entry && typeof entry === 'object' && 'value' in entry ? entry.value : 0
    entries.push(`${pyStr(memo.name)}: ${toPyLiteral(value ?? 0)}`)
  }

  // (#1922) Request-scoped `searchParams()`: bind `searchParams` to an
  // empty-query reader (so the render script needn't build one from a real
  // request). The conformance harness issues no query string (the
  // production Flask integration builds this from the request's query), so
  // `.get(k)` resolves to `None` and the author's `?? default` renders. Only
  // when the component imports `searchParams`.
  if (importsSearchParams(ir.metadata)) {
    entries.push(`${pyStr('searchParams')}: SearchParams('')`)
  }

  return `{${entries.join(', ')}}`
}

/**
 * Evaluate a signal initializer expression using provided props.
 * Handles: props.initial ?? 0, props.value, literal values.
 */
export function evaluateSignalInit(
  expr: string,
  props?: Record<string, unknown>,
): unknown {
  const nullishMatch = expr.match(/^props\.(\w+)\s*\?\?\s*(.+)$/)
  if (nullishMatch) {
    const propName = nullishMatch[1]
    const defaultExpr = nullishMatch[2].trim()
    if (props && propName in props) return props[propName]
    return parseLiteral(defaultExpr)
  }

  const propsMatch = expr.match(/^props\.(\w+)$/)
  if (propsMatch) {
    if (props && propsMatch[1] in props) return props[propsMatch[1]]
    return null
  }

  return parseLiteral(expr)
}

function parseLiteral(expr: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr)
  if (expr === 'true') return true
  if (expr === 'false') return false
  if (expr === '[]') return []

  {
    const t = expr.trim()
    if (t.startsWith('[') && t.endsWith(']')) {
      const inner = t.slice(1, -1).trim()
      if (!inner) return []
      const out: unknown[] = []
      for (const seg of splitTopLevelCommas(inner)) {
        if (!seg.trim()) continue
        const parsed = parseLiteral(seg.trim())
        if (parsed === null && seg.trim() !== 'null') return null
        out.push(parsed)
      }
      return out
    }
  }

  const stringMatch = expr.match(/^(['"])(.*)\1$/s)
  if (stringMatch) return unescapeJsString(stringMatch[2])

  const trimmed = expr.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return {}
    const obj: Record<string, unknown> = {}
    for (const pair of splitTopLevelCommas(inner)) {
      if (!pair.trim()) continue
      const colonIdx = pair.indexOf(':')
      if (colonIdx < 0) return null
      let key = pair.slice(0, colonIdx).trim()
      const val = pair.slice(colonIdx + 1).trim()
      const keyMatch = key.match(/^(['"])(.*)\1$/s)
      if (keyMatch) key = unescapeJsString(keyMatch[2])
      const parsedVal = parseLiteral(val)
      if (parsedVal === null && val !== 'null') return null
      obj[key] = parsedVal
    }
    return obj
  }
  return null
}

function splitTopLevelCommas(inner: string): string[] {
  const segments: string[] = []
  let depth = 0
  let start = 0
  let quote: string | null = null
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (quote) {
      if (c === quote) {
        let backslashes = 0
        for (let j = i - 1; j >= 0 && inner[j] === '\\'; j--) backslashes++
        if (backslashes % 2 === 0) quote = null
      }
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      segments.push(inner.slice(start, i))
      start = i + 1
    }
  }
  segments.push(inner.slice(start))
  return segments
}

function unescapeJsString(s: string): string {
  return s.replace(/\\(.)/g, (_, c) => {
    switch (c) {
      case 'n': return '\n'
      case 'r': return '\r'
      case 't': return '\t'
      case '0': return '\0'
      default: return c
    }
  })
}

/**
 * Python string literal for arbitrary text, via `JSON.stringify`. JSON's
 * string grammar (`\\`, `\"`, `\n`, `\r`, `\t`, `\b`, `\f`, `\uXXXX`) is a
 * faithful subset of Python's double-quoted string-literal escapes, so this
 * is exact — simpler and more robust than a hand-rolled escaper (no
 * character can slip through unescaped).
 */
function pyStr(s: string): string {
  return JSON.stringify(s)
}

/** Python numeric literal, with JS's NaN/±Infinity mapped to `float(...)` calls. */
function pyNumber(n: number): string {
  if (Number.isNaN(n)) return "float('nan')"
  if (n === Infinity) return "float('inf')"
  if (n === -Infinity) return "float('-inf')"
  return String(n)
}

function toPyLiteral(value: unknown): string {
  if (typeof value === 'string') return pyStr(value)
  if (typeof value === 'number') return pyNumber(value)
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (Array.isArray(value)) {
    return `[${value.map(toPyLiteral).join(', ')}]`
  }
  if (value && typeof value === 'object') {
    const entries: string[] = []
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      entries.push(`${pyStr(key)}: ${toPyLiteral(v)}`)
    }
    return `{${entries.join(', ')}}`
  }
  return 'None'
}

/**
 * Convert a JS literal value to a Python literal.
 * Handles: numbers, strings, booleans, empty arrays, props.xxx ?? default.
 */
function jsToPyValue(jsValue: string): string | null {
  const v = jsValue.trim()

  if (/^-?\d+(\.\d+)?$/.test(v)) return v
  // A JS string literal (single- or double-quoted) is, character-for-character,
  // ALSO a valid Python string literal for the common escape sequences both
  // languages share — pass it through verbatim rather than re-quoting.
  if (/^['"].*['"]$/.test(v)) return v
  if (v === 'true') return 'True'
  if (v === 'false') return 'False'
  if (v === '[]') return '[]'

  const nullishMatch = v.match(/\?\?\s*(.+)$/)
  if (nullishMatch) return jsToPyValue(nullishMatch[1])

  if (v.startsWith('props.')) return 'None'

  return null
}
