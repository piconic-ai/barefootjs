/**
 * minijinja (Rust) template test renderer
 *
 * Compiles JSX source with `MinijinjaAdapter` and renders the resulting
 * `.j2` templates to HTML via the compiled `bf-render` binary
 * (`packages/adapter-rust/runtime/`: a `minijinja::Environment` wired up in
 * `backend_minijinja.rs`, driven by the payload-protocol conformance
 * renderer `src/bin/bf-render.rs`). Used by the adapter-tests conformance
 * runner (`runAdapterConformanceTests`).
 *
 * Near-verbatim port of the sibling Jinja2 harness
 * (`packages/adapter-jinja/src/test-render.ts`) — same `RenderOptions`
 * contract, same prop / signal / memo seeding order, same multi-component
 * IR pairing by basename and reachable-children error gate. The ONE
 * structural difference is how a render is invoked: adapter-jinja generates
 * a throwaway Python SCRIPT per fixture that inline-builds a props dict and
 * registers child renderers as Python closures; this harness instead
 * SERIALIZES that same information to a JSON payload (see the payload
 * protocol in the design doc) and hands it to one long-lived compiled Rust
 * binary — `bf-render` builds the child renderer closures itself from the
 * payload's `children` array (mirroring `buildChildRenderers` below, ported
 * to Rust in the runtime crate). `buildPythonProps` therefore becomes
 * `buildVars`, returning a plain JS object (the payload's `vars` field)
 * instead of a Python dict *source string* — no `pyStr`/`toPyLiteral`
 * string-building layer is needed, JSON.stringify does that job, EXCEPT for
 * non-finite numbers (`NaN`/`Infinity`/`-Infinity`), which JSON cannot
 * represent — see `encodeSpecials` below for the `__bf_special` sentinel
 * that closes that gap.
 */

import { compileJSX, extractSsrDefaults, importsSearchParams } from '@barefootjs/jsx'
import type { ComponentIR } from '@barefootjs/jsx'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const RENDER_TEMP_DIR = resolve(import.meta.dir, '../.render-temp')
// The Rust runtime crate (`barefootjs`, binary `bf-render`) lives alongside
// this package (mirrors adapter-jinja bundling `python/` in-tree). Built
// once (memoized below) and re-used across all conformance fixtures —
// NEVER built per fixture.
const RUNTIME_DIR = resolve(import.meta.dir, '../runtime')
const RUNTIME_MANIFEST = resolve(RUNTIME_DIR, 'Cargo.toml')
const BF_RENDER_BIN = resolve(RUNTIME_DIR, 'target/debug/bf-render')

export class RustNotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RustNotAvailableError'
  }
}

/**
 * Recover the bare component name from a compiler-emitted template file
 * path. `templatesPerComponent` adapters write each component to
 * `<dir>/<ComponentName><adapter.extension>` (minijinja: `.j2`), and
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

let _cargoAvailable: boolean | null = null
async function isCargoAvailable(): Promise<boolean> {
  if (_cargoAvailable !== null) return _cargoAvailable
  try {
    const proc = Bun.spawn(['cargo', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    await proc.exited
    _cargoAvailable = proc.exitCode === 0
  } catch {
    _cargoAvailable = false
  }
  return _cargoAvailable
}

/**
 * Module-scope memoized build of the `bf-render` binary. The first caller
 * triggers `cargo build`; every subsequent fixture in the same test run
 * awaits the SAME promise (or observes it already resolved) instead of
 * re-invoking cargo — cargo's own incremental `target/` cache would make a
 * repeat build cheap, but there is no reason to pay even that per fixture.
 * A build FAILURE is a real `Error` (not `RustNotAvailableError`) — a
 * present-but-broken toolchain should fail loudly, not be silently skipped
 * like a genuinely absent one.
 */
let _buildPromise: Promise<void> | null = null
function ensureBfRenderBuilt(): Promise<void> {
  if (!_buildPromise) {
    _buildPromise = (async () => {
      const proc = Bun.spawn(
        ['cargo', 'build', '--manifest-path', RUNTIME_MANIFEST, '--bin', 'bf-render'],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        throw new Error(`cargo build --bin bf-render failed (exit ${exitCode}):\n${stderr}\n${stdout}`)
      }
    })()
  }
  return _buildPromise
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

export async function renderMinijinjaComponent(options: RenderOptions): Promise<string> {
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
  // if any of THOSE error. Mirrors the Xslate/Jinja harness's reachable-children
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

  // Compile parent source. `siblingTemplatesRegistered: true` matches this
  // harness's real behavior — every sibling child template is registered
  // alongside the parent before rendering, so a loop-body cross-template
  // call resolves at render time (#2205).
  const result = compileJSX(source, 'component.tsx', {
    adapter,
    outputIR: true,
    siblingTemplatesRegistered: true,
  })

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

  if (!(await isCargoAvailable())) {
    throw new RustNotAvailableError('cargo not found — skipping minijinja rendering')
  }
  await ensureBfRenderBuilt()

  // Build temp directory.
  const tempDir = resolve(
    RENDER_TEMP_DIR,
    `minijinja-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tempDir, { recursive: true })

  try {
    // Write `.j2` files (parent + children), named by snake_case so the
    // adapter's `bf.render_child('<snake>', …)` calls + the runtime's
    // `render_named('<snake>', …)` resolve from the dir.
    await Bun.write(resolve(tempDir, `${toSnakeCase(componentName)}.j2`), templateFile.content)
    for (const [childName, { template }] of childTemplates) {
      await Bun.write(resolve(tempDir, `${toSnakeCase(childName)}.j2`), template)
    }

    // Honour `__instanceId` from props for the root scope id so
    // shared-component fixtures (which pin `<ComponentName>_test`) match
    // cross-adapter; default to 'test' otherwise.
    const rootScopeIdRaw = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'

    // Build the JSON payload's `vars` field (a plain JS object — the JSON
    // equivalent of `buildPythonProps`'s Python dict SOURCE, minus the
    // string-building layer JSON.stringify now does for us).
    const vars = buildVars(props, ir)

    // Build the JSON payload's `children` registration array — metadata
    // only; `bf-render` builds the actual child-renderer closures itself
    // (mirroring `buildChildRenderers`'s per-child logic, ported to Rust).
    const childrenPayload = buildChildrenPayload(childTemplates)

    const payload: Record<string, unknown> = {
      templates_dir: tempDir,
      entry: toSnakeCase(componentName),
      scope_id: rootScopeIdRaw,
      vars,
      children: childrenPayload,
    }
    // (#1922) Request-scoped `searchParams()`: bind to an empty-query
    // reader only when the component imports `searchParams`, mirroring the
    // Jinja harness's conditional `SearchParams('')` binding.
    if (importsSearchParams(ir.metadata)) {
      payload.search_params = ''
    }

    await Bun.write(resolve(tempDir, 'payload.json'), JSON.stringify(encodeSpecials(payload)))

    const proc = Bun.spawn([BF_RENDER_BIN, resolve(tempDir, 'payload.json')], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(`bf-render failed (exit ${exitCode}):\n${stderr}`)
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
 * Mirrors the Go / Xslate / Jinja harness helper of the same name.
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
 * Build the JSON payload's `children` array: one entry per child template,
 * carrying exactly the metadata `bf-render` needs to construct a child
 * renderer closure at render time (mirrors the payload protocol in the
 * design doc; see `runtime/src/backend_minijinja.rs`'s `render_child` for
 * the Rust-side closure — the near-verbatim structural counterpart of
 * adapter-jinja's `buildChildRenderers`, which instead emitted Python
 * closure SOURCE per child). `ssr_defaults` mirrors `ssrDefaultsToPy`:
 * only the static fallback `value` of each `{ value, propName?,
 * isRestProps? }` ssrDefaults entry is needed — the child renderer's
 * caller props always win over it.
 */
function buildChildrenPayload(
  childTemplates: Map<string, { template: string; ir: ComponentIR }>,
): Array<{
  name: string
  template: string
  ssr_defaults: Record<string, unknown>
  rest_props_name: string | null
  param_names: string[]
}> {
  const out: Array<{
    name: string
    template: string
    ssr_defaults: Record<string, unknown>
    rest_props_name: string | null
    param_names: string[]
  }> = []
  for (const [componentName, { ir: childIR }] of childTemplates) {
    const ssrDefaults = extractSsrDefaults(childIR.metadata) ?? {}
    out.push({
      name: componentName,
      template: toSnakeCase(componentName),
      ssr_defaults: ssrDefaultsToVars(ssrDefaults),
      rest_props_name: childIR.metadata.restPropsName ?? null,
      param_names: (childIR.metadata.propsParams ?? []).map(p => p.name),
    })
  }
  return out
}

/** Reduce an ssrDefaults map to its static fallback values (plain JS object). */
function ssrDefaultsToVars(defaults: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, d] of Object.entries(defaults)) {
    // ssrDefaults entries are `{ value, propName?, isRestProps? }` or a
    // bare value. The child renderer's caller props win, so we only need
    // the static fallback `value` here.
    out[name] =
      d && typeof d === 'object' && 'value' in (d as Record<string, unknown>)
        ? (d as Record<string, unknown>).value
        : d
  }
  return out
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
 * Build the JSON payload's `vars` object (props + signal / memo seeds), a
 * plain JS object — the direct JSON counterpart of adapter-jinja's
 * `buildPythonProps`, minus the Python-dict-SOURCE string-building it did
 * (`pyStr`/`toPyLiteral`); `JSON.stringify` (via `encodeSpecials` for the
 * non-finite-number edge case) does that job here. Unlike
 * `buildPythonProps`, this does NOT include a `scope_id` entry — the
 * payload protocol carries `scope_id` as its own top-level field (see
 * `renderMinijinjaComponent`), so threading a second copy through `vars`
 * would be redundant.
 *
 * Keys are the RAW (unmangled) prop/signal/memo names — same as
 * `buildPythonProps` — because reserved-word mangling is applied
 * backend-side, in ONE place: the Rust runtime's `render_named` (see
 * `lib/minijinja-naming.ts`'s file header, divergence 5).
 */
function buildVars(
  props: Record<string, unknown> | undefined,
  ir: ComponentIR,
): Record<string, unknown> {
  const vars: Record<string, unknown> = {}

  // Prop params with defaults (before signals, so signals can reference them).
  for (const param of ir.metadata.propsParams) {
    if (props && param.name in props) continue
    if (param.defaultValue) {
      const value = jsDefaultToVarValue(param.defaultValue)
      if (value !== null) {
        vars[param.name] = value
        continue
      }
    }
    // No default + no caller value: pass `null` (Rust's `None`/minijinja
    // Undefined) so a bare reference to an optional prop doesn't fault
    // before its falsy branch elides.
    vars[param.name] = null
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
    vars[restPropsName] = Object.fromEntries(restBagEntries)
  }

  // User props.
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('__')) continue
      if (routedKeys.has(key)) continue
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        Array.isArray(value) ||
        (value && typeof value === 'object')
      ) {
        vars[key] = value
      }
    }
  }

  // Signal values evaluated from props (after user props).
  for (const signal of ir.metadata.signals) {
    // Env signals (#2057) are bound below via `search_params`, not from a
    // static initial value.
    if (signal.envReader) continue
    const value = evaluateSignalInit(signal.initialValue.trim(), props)
    if (value !== null) {
      vars[signal.getter] = value
    }
  }

  // Memo values seeded from the statically-evaluated ssrDefaults, same
  // as the production plugin's before_render hook.
  const ssrDefaults = extractSsrDefaults(ir.metadata) ?? {}
  for (const memo of ir.metadata.memos) {
    const entry = ssrDefaults[memo.name]
    const value = entry && typeof entry === 'object' && 'value' in entry ? entry.value : 0
    vars[memo.name] = value ?? 0
  }

  return vars
}

/**
 * Convert a destructure-default's JS source text (`{ size = 'md' }`'s
 * `'md'`) to a real JS value. Near-verbatim port of `buildPythonProps`'s
 * `jsToPyValue` helper — which returned Python SOURCE text (safe to reuse
 * verbatim for a string/numeric literal, since JS and Python share that
 * literal grammar) — ported to resolve directly to the JS runtime value
 * instead, via the shared `parseLiteral` for the literal shapes both
 * versions handle identically. The match ORDER is preserved from
 * `jsToPyValue`: numeric/string/bool/`[]` are checked BEFORE the `??`
 * regex, so a string literal containing a literal `??` substring (e.g.
 * `'a??b'`) is caught by the string-literal branch first, not
 * mis-parsed as a nullish-coalescing default.
 */
function jsDefaultToVarValue(jsValue: string): unknown {
  const v = jsValue.trim()
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  const strMatch = v.match(/^(['"])(.*)\1$/s)
  if (strMatch) return unescapeJsString(strMatch[2])
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === '[]') return []
  const nullishMatch = v.match(/\?\?\s*(.+)$/)
  if (nullishMatch) return jsDefaultToVarValue(nullishMatch[1])
  if (v.startsWith('props.')) return null
  return null
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
 * Recursively replace JS's non-finite numbers (`NaN`, `Infinity`,
 * `-Infinity`) with the `{"__bf_special": "nan" | "inf" | "-inf"}` sentinel
 * — plain JSON has no way to represent them (`JSON.stringify(NaN)` silently
 * becomes `null`, losing the value). `bf-render` decodes the sentinel back
 * to the corresponding `f64` after `serde_json` parsing (see the design
 * doc's payload protocol). Applied once to the whole payload object before
 * `JSON.stringify` — covers `vars` and every child's `ssr_defaults`
 * uniformly rather than threading the transform through each builder.
 */
function encodeSpecials(value: unknown): unknown {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { __bf_special: 'nan' }
    if (value === Infinity) return { __bf_special: 'inf' }
    if (value === -Infinity) return { __bf_special: '-inf' }
    return value
  }
  if (Array.isArray(value)) return value.map(encodeSpecials)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = encodeSpecials(v)
    }
    return out
  }
  return value
}
