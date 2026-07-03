/**
 * ERB (Embedded Ruby) template test renderer
 *
 * Compiles JSX source with `ErbAdapter` and renders the resulting `.erb`
 * templates to HTML via `ruby` + Ruby stdlib `erb`, driven through
 * `BarefootJS::Context` + `BarefootJS::Backend::Erb`. Used by the
 * adapter-tests conformance runner (`runAdapterConformanceTests`).
 *
 * Mirrors the sibling Text::Xslate `test-render.ts` (same `RenderOptions`
 * contract, same prop / signal / memo seeding, same multi-component
 * child-renderer registration), but two things are ERB-specific:
 *
 *   - Props / ssrDefaults cross the JS→Ruby boundary as JSON
 *     (`JSON.parse(..., symbolize_names: true)`), never hand-built Ruby
 *     literals — the runtime's whole value domain is JSON-shaped
 *     symbol-keyed Hashes, so this is a straight `JSON.stringify` on the JS
 *     side with no per-type literal-escaping logic to keep in sync.
 *   - The Ruby runtime lives entirely inside this package (`lib/`); unlike
 *     the Perl ports there is no separate "core" package to add to the
 *     load path.
 *
 * Child components are wired through the production
 * `BarefootJS::Context#register_child_renderer` so the child's `bf-s` scope
 * id derives from `<parentScope>_<slotId>` exactly as a real `bf build`
 * page would.
 */

import { compileJSX, extractSsrDefaults, importsSearchParams } from '@barefootjs/jsx'
import type { ComponentIR, SsrDefault } from '@barefootjs/jsx'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const RENDER_TEMP_DIR = resolve(import.meta.dir, '../.render-temp')
// The Ruby runtime (BarefootJS::Context + BarefootJS::Backend::Erb) lives
// entirely under this package's `lib/` — no separate core package to add
// to the load path (unlike the Perl ports, which split a shared
// `@barefootjs/perl` core from the engine-specific backend).
const LIB_DIR = resolve(import.meta.dir, '../lib')

export class ErbNotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErbNotAvailableError'
  }
}

/**
 * Recover the bare component name from a compiler-emitted template file
 * path. `templatesPerComponent` adapters write each component to
 * `<dir>/<ComponentName><adapter.extension>` (ERB: `.erb`), and
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

/** Escape a string for a Ruby single-quoted literal: backslash first (so it
 *  doesn't double-escape the quote we add next), then the quote. Used only
 *  for the small set of values embedded directly in the generated
 *  `render.rb` script (paths, scope ids, template names) — everything
 *  prop/data-shaped crosses the boundary as JSON instead. */
function rubyStringLiteral(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

let _rubyAvailable: boolean | null = null
async function isErbAvailable(): Promise<boolean> {
  if (_rubyAvailable !== null) return _rubyAvailable
  try {
    const proc = Bun.spawn(['ruby', '-e', 'require "erb"'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    await proc.exited
    _rubyAvailable = proc.exitCode === 0
  } catch {
    _rubyAvailable = false
  }
  return _rubyAvailable
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

export async function renderErbComponent(options: RenderOptions): Promise<string> {
  const { source, adapter, props, components, componentName: requestedName } = options

  // Compile child components first.
  //
  // A child SOURCE FILE may export more components than the parent actually
  // references (e.g. `../icon` exports ~30 icons + a generic `Icon`, but
  // `Checkbox` only imports `CheckIcon`). Some of those unreferenced
  // components legitimately can't lower to ERB. Throwing on those would
  // block a fixture that never renders them. So defer the per-file error
  // gate: collect every component's template + IR up front, then (after the
  // parent compile pins the reachable set) re-generate ONLY the reachable
  // children and throw if any of THOSE error. Mirrors the Go harness's
  // reachable-children emission (#checkbox).
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
    `erb-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tempDir, { recursive: true })

  try {
    // Write `.erb` files (parent + children), named by snake_case so
    // the adapter's `bf.render_child('<snake>', …)` calls + the
    // backend's `render_named('<snake>', …)` resolve from the dir.
    await Bun.write(resolve(tempDir, `${toSnakeCase(componentName)}.erb`), templateFile.content)
    for (const [childName, { template }] of childTemplates) {
      await Bun.write(resolve(tempDir, `${toSnakeCase(childName)}.erb`), template)
    }

    // Build the root props Hash and write it as JSON — the runtime's
    // value domain is JSON-shaped symbol-keyed Hashes throughout, so
    // `JSON.parse(..., symbolize_names: true)` on the Ruby side is the
    // whole marshalling story; no hand-built Ruby literals.
    const { obj: rootProps, needsSearchParams } = buildRubyProps(props, ir)
    await Bun.write(resolve(tempDir, 'props.json'), JSON.stringify(rootProps))

    // Honour `__instanceId` from props for the root scope id so
    // shared-component fixtures (which pin `<ComponentName>_test`) match
    // cross-adapter; default to 'test' otherwise.
    const rootScopeIdRaw = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'
    const rootScopeId = rubyStringLiteral(rootScopeIdRaw)

    // Static ssrDefaults per child, simplified to bare values (the
    // caller's props always win — see `buildChildRenderersRuby`) and
    // written as one JSON file keyed by snake_case template name.
    const childDefaults: Record<string, Record<string, unknown>> = {}
    for (const [childName, { ir: childIR }] of childTemplates) {
      childDefaults[toSnakeCase(childName)] = simplifySsrDefaults(extractSsrDefaults(childIR.metadata) ?? {})
    }
    if (childTemplates.size > 0) {
      await Bun.write(resolve(tempDir, 'child_defaults.json'), JSON.stringify(childDefaults))
    }

    const childRenderers = buildChildRenderersRuby(childTemplates)

    const renderScript = `#!/usr/bin/env ruby
# frozen_string_literal: true

require 'barefoot_js'
require 'barefoot_js/backend/erb'
require 'json'

# Single ERB backend over the temp template dir.
backend = BarefootJS::Backend::Erb.new(path: ${rubyStringLiteral(tempDir)})
bf = BarefootJS::Context.new(backend)
# Honour an explicit __instanceId so shared-component fixtures match the
# scope ids Hono / Go emit; default to 'test'.
bf._scope_id(${rootScopeId})

props = JSON.parse(File.read(File.join(__dir__, 'props.json')), symbolize_names: true)
${needsSearchParams ? "# (#1922) Request-scoped searchParams() env signal: bind the reserved\n# `search_params` vars key to an empty-query reader. Only when the\n# component imports `searchParams`.\nprops[:search_params] = bf.search_params('')\n" : ''}
${childRenderers}
html = backend.render_named(${rubyStringLiteral(toSnakeCase(componentName))}, bf, props)
print html
`
    await Bun.write(resolve(tempDir, 'render.rb'), renderScript)

    if (!await isErbAvailable()) {
      throw new ErbNotAvailableError('ruby with erb not found — skipping ERB rendering')
    }

    const proc = Bun.spawn(['ruby', '-I', LIB_DIR, 'render.rb'], {
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
      throw new Error(`ruby render failed (exit ${exitCode}):\n${stderr}`)
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
 * Mirrors the Go harness helper of the same name.
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
 * Build Ruby code that registers one child-component renderer per child
 * template via the production `BarefootJS::Context#register_child_renderer`.
 *
 * The closure mirrors the manifest-driven path in `barefoot_js.rb`: it
 * derives the child scope id from `<parentScope>_<slotId>` (the parent's
 * `bf.render_child('<name>', { …, _bf_slot: '<slotId>' })` passes
 * `_bf_slot`), seeds signal / memo / prop defaults from the child IR's
 * `ssrDefaults` (loaded once from `child_defaults.json`, caller props win
 * via `Hash#merge`), shares the parent's script list, and renders the
 * child `.erb` through the same backend. Loop children (no `_bf_slot`)
 * fall back to `<ComponentName>_<rand>` like the Perl harnesses.
 */
function buildChildRenderersRuby(
  childTemplates: Map<string, { template: string; ir: ComponentIR }>,
): string {
  if (childTemplates.size === 0) return ''

  const lines: string[] = []
  lines.push(`child_defaults = JSON.parse(File.read(File.join(__dir__, 'child_defaults.json')), symbolize_names: true)`)
  lines.push(``)
  lines.push(`# Register child component renderers`)

  for (const [componentName, { ir: childIR }] of childTemplates) {
    const snakeName = toSnakeCase(componentName)
    const restPropsName = childIR.metadata.restPropsName

    lines.push(`defaults_${snakeName} = child_defaults[${rubySymbol(snakeName)}] || {}`)
    lines.push(`bf.register_child_renderer(${rubyStringLiteral(snakeName)}, lambda do |child_props, caller_bf|`)
    // `caller_bf` is the instance whose template invoked render_child
    // (#1897) — nested children chain their scope/slot identity off it.
    lines.push(`  host_scope = caller_bf ? caller_bf._scope_id : bf._scope_id`)
    if (restPropsName) {
      const restSym = rubySymbol(restPropsName)
      // A child that destructures a rest bag references `v[:<rest>]` in its
      // template; seed it with an empty Hash when the caller didn't pass
      // one so a symbol-key lookup on a missing key still resolves (to nil,
      // via Hash#[]) rather than a partially-shaped bag.
      lines.push(`  child_props[${restSym}] ||= {}`)
      // (#1897) Route non-param props into the rest bag, mirroring the
      // production runtime's `derive_vars_from_defaults` isRestProps
      // branch and JSX rest semantics: a caller prop the child didn't
      // destructure belongs in the bag, not as a top-level vars key the
      // template never reads.
      const paramNames = (childIR.metadata.propsParams ?? []).map(p => p.name)
      const keep = [...new Set([...paramNames, restPropsName, 'children', 'key', '_bf_slot'])]
      const keepList = keep.map(rubySymbol).join(', ')
      lines.push(`  keep = [${keepList}]`)
      lines.push(`  child_props.keys.each do |k|`)
      lines.push(`    next if keep.include?(k)`)
      lines.push(`    child_props[${restSym}][k] = child_props.delete(k)`)
      lines.push(`  end`)
    }
    lines.push(`  slot_id = child_props.delete(:_bf_slot)`)
    lines.push(`  child_bf = BarefootJS::Context.new(backend)`)
    // JSX `key` (reserved prop) → data-key on the child scope root, for keyed
    // loop reconciliation parity with Hono.
    lines.push(`  data_key = child_props.delete(:key)`)
    lines.push(`  child_bf._data_key(data_key) unless data_key.nil?`)
    // A loop child (no slot) gets a fresh `<ComponentName>_<rand>` id per
    // iteration — the PascalCase name is what `normalizeHTML` canonicalises to
    // `<ComponentName>_*`; a slotted child derives from the parent scope.
    lines.push(`  child_bf._scope_id(slot_id ? "#{host_scope}_#{slot_id}" : "${componentName}_#{rand.to_s[2, 6]}")`)
    lines.push(`  child_bf._is_child(true)`)
    lines.push(`  if slot_id`)
    lines.push(`    child_bf._bf_parent(host_scope)`)
    lines.push(`    child_bf._bf_mount(slot_id)`)
    lines.push(`  end`)
    // (#1897) A child template may itself call `bf.render_child(...)`
    // (AccordionTrigger renders ChevronDownIcon) — inside that template
    // `bf` is THIS fresh child instance, whose renderer registry starts
    // empty, so the nested call would silently render ''. Share the
    // parent's registry so nested child renders resolve.
    lines.push(`  child_bf._child_renderers(bf._child_renderers)`)
    lines.push(`  child_bf._scripts(bf._scripts)`)
    lines.push(`  child_bf._script_seen(bf._script_seen)`)
    // Seed template vars: static ssrDefaults first, caller's props win.
    lines.push(`  vars = defaults_${snakeName}.merge(child_props)`)
    lines.push(`  rendered = backend.render_named(${rubyStringLiteral(snakeName)}, child_bf, vars)`)
    lines.push(`  rendered.chomp`)
    lines.push(`end)`)
    lines.push(``)
  }

  return lines.join('\n') + '\n'
}

/** Render `name` as a Ruby symbol literal (`:name` / `:"data-slot"`) for
 *  embedding in the generated `render.rb`. Mirrors the adapter's own
 *  `rubySymbolLiteral` (kept local so the test harness doesn't reach into
 *  adapter internals for a three-line string helper). */
function rubySymbol(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*[?!]?$/.test(name) ? `:${name}` : `:"${name.replace(/"/g, '\\"')}"`
}

/**
 * Simplify an `extractSsrDefaults` map to bare values for the child
 * defaults JSON file. Each entry is either a bare value or
 * `{ value, propName?, isRestProps? }`; the child renderer always merges
 * the caller's live `child_props` OVER these defaults (`Hash#merge`), so
 * only the static fallback `value` is needed here — the `propName`-aware
 * resolution the production manifest path does is redundant with that
 * merge.
 */
function simplifySsrDefaults(defaults: Record<string, SsrDefault>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, d] of Object.entries(defaults)) {
    out[name] = d.value
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
 * Build the root props object (later JSON-serialised) + whether the
 * component imports `searchParams`.
 */
function buildRubyProps(
  props: Record<string, unknown> | undefined,
  ir: ComponentIR,
): { obj: Record<string, unknown>; needsSearchParams: boolean } {
  const obj: Record<string, unknown> = {}

  const explicitScope = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'
  obj.scope_id = explicitScope

  // Prop params with defaults (before signals, so signals can reference them).
  for (const param of ir.metadata.propsParams) {
    if (props && param.name in props) continue
    if (param.defaultValue) {
      const value = jsDefaultLiteral(param.defaultValue)
      if (value !== undefined) {
        obj[param.name] = value
        continue
      }
    }
    // No default + no caller value: seed `nil` so a bare reference to an
    // optional prop's vars-Hash key resolves (to nil) instead of the key
    // being wholly absent — matches the Perl harnesses' explicit `undef`.
    obj[param.name] = null
  }

  // Route undeclared props into the rest bag (`spread_attrs(v[:<rest>])`).
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
    obj[restPropsName] = Object.fromEntries(restBagEntries)
  }

  // User props.
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('__')) continue
      if (routedKeys.has(key)) continue
      obj[key] = value
    }
  }

  // Signal values evaluated from props (after user props).
  for (const signal of ir.metadata.signals) {
    // Env signals (#2057 / #1922) are bound below via `search_params('')`,
    // not from a static initial value.
    if (signal.envReader) continue
    const value = evaluateSignalInit(signal.initialValue.trim(), props)
    if (value !== null) {
      obj[signal.getter] = value
    }
  }

  // Memo values seeded from the statically-evaluated ssrDefaults, same
  // as the production plugin's before_render hook.
  const ssrDefaults = extractSsrDefaults(ir.metadata) ?? {}
  for (const memo of ir.metadata.memos) {
    obj[memo.name] = ssrDefaults[memo.name]?.value ?? 0
  }

  const needsSearchParams = importsSearchParams(ir.metadata)

  return { obj, needsSearchParams }
}

/**
 * Best-effort literal evaluation of a prop-destructure default's source
 * text (`{ size = 'md' }` → `'md'`), including a `props.x ?? default`
 * nullish fallback (handled generically, though destructure defaults
 * rarely reference `props`) and delegating to `parseLiteral` for
 * everything else. Returns `undefined` for a non-literal (computed)
 * default, matching the Perl harnesses' "fall through to undef" behaviour.
 */
function jsDefaultLiteral(expr: string): unknown {
  const t = expr.trim()
  const nullishMatch = t.match(/\?\?\s*(.+)$/)
  if (nullishMatch) return jsDefaultLiteral(nullishMatch[1])
  if (t.startsWith('props.')) return undefined
  const parsed = parseLiteral(t)
  return parsed === null && t !== 'null' ? undefined : parsed
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
