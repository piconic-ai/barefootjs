/**
 * Real-backend render harness for the Pebble adapter conformance suite.
 *
 * Bun-only (exported solely under the `"bun"` condition — see
 * `package.json`'s `./test-render` export), so it never reaches a published
 * consumer's dependency graph.
 *
 * Phase 3a (#2101): the Java runtime (`packages/adapter-pebble/java/`) now
 * exists — `renderPebble` builds its Gradle fat jar ONCE per process
 * (memoized, mirroring `adapter-rust/src/test-render.ts`'s
 * `ensureBfRenderBuilt` build-once-reuse-across-fixtures pattern) and shells
 * out `java -jar <jar> <templateDir> <entryName> <varsFile>` per render.
 *
 * Phase 3b (#2101): the Java runtime now also registers a custom `set` tag
 * handler (`java/src/main/java/dev/barefootjs/pebble/ext/`) supporting
 * `{% set NAME %}...{% endset %}` block-capture, so JSX-children/
 * named-slot/async-fallback forwarding renders correctly through this same
 * `java -jar` path — see `pebble-set-block.test.ts`.
 *
 * Phase 4 (#2101): `renderPebbleComponent` below compiles real JSX source
 * through `PebbleAdapter` (near-verbatim port of
 * `packages/adapter-rust/src/test-render.ts`'s `renderMinijinjaComponent` —
 * the closest structural sibling: minijinja/Rust is ALSO a
 * "compile-the-native-runtime-once, invoke-a-built-artifact-per-fixture"
 * harness, exactly like this package's `java -jar` invocation) and drives
 * the shared ~190-fixture conformance corpus via `runAdapterConformanceTests`
 * (`src/__tests__/pebble-conformance.test.ts`). Cross-template child
 * rendering now goes through `Bf.render_child` (implemented Phase 4) plus a
 * `_bf_manifest.json` sidecar this harness writes alongside every child
 * `.peb` file — see `buildChildManifest`'s doc comment for the wire shape
 * `Bf.render_child`/`Main.loadManifest` expect.
 */

import {
  compileJSX,
  deriveStashFromDefaults,
  extractSsrDefaults,
  importsSearchParams,
} from '@barefootjs/jsx'
import type { ComponentIR, SsrDefault } from '@barefootjs/jsx'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pebbleIdent } from './adapter/lib/pebble-naming.ts'

const RENDER_TEMP_DIR = resolve(import.meta.dir, '../.render-temp')
// The Gradle project (`barefootjs-pebble-runtime`) lives alongside this
// package (mirrors adapter-rust bundling `runtime/` in-tree). Built ONCE
// (memoized below) and re-used across every render in this process — NEVER
// rebuilt per render, per the package README's "Conformance harness:
// build-once, like adapter-rust" design decision.
const JAVA_DIR = resolve(import.meta.dir, '../java')
const FAT_JAR = resolve(JAVA_DIR, 'build/libs/barefootjs-pebble-runtime.jar')

export class JavaNotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JavaNotAvailableError'
  }
}

/** Whether a `java` toolchain is on `PATH` — mirrors the sibling adapters'
 * "skip gracefully when the toolchain is missing" harness convention
 * (`RustNotAvailableError` in `adapter-rust/src/test-render.ts`). */
export function isJavaToolchainAvailable(): boolean {
  return Bun.which('java') !== null
}

/**
 * Flags for every render JVM. The rendered HTML is read from stdout, and
 * the JVM's unified logging writes warnings to stdout by default, so a
 * warning would be prepended to the HTML. One did in CI: with several
 * render JVMs running at once, `[warning][perf,memops] Cannot use file
 * /tmp/hsperfdata_runner/<pid> because it is locked by another process`.
 * `-XX:-UsePerfData` stops the JVM from creating that per-PID file, and
 * the `-Xlog` pair moves any other JVM warning to stderr.
 */
const JVM_FLAGS = ['-XX:-UsePerfData', '-Xlog:disable', '-Xlog:all=warning:stderr']

function isGradleAvailable(): boolean {
  return Bun.which('gradle') !== null
}

/**
 * Module-scope memoized build of the fat jar via `gradle shadowJar`. The
 * first caller triggers the build; every subsequent render in the same
 * process awaits the SAME promise (or observes it already resolved). A
 * build FAILURE is a real `Error` (not `JavaNotAvailableError`) — a
 * present-but-broken toolchain should fail loudly, not be silently skipped
 * like a genuinely absent one. No Gradle wrapper is committed for this
 * package (unlike some native-runtime adapters) — the environment this
 * harness runs in provisions a matching `gradle` on `PATH` directly (see
 * the package README's "Gradle project layout" note); a plain `gradle
 * shadowJar` invocation is used rather than `./gradlew`.
 */
let _buildPromise: Promise<void> | null = null
function ensureFatJarBuilt(): Promise<void> {
  if (!_buildPromise) {
    _buildPromise = (async () => {
      if (!isGradleAvailable()) {
        throw new Error('gradle not found on PATH — cannot build the Pebble Java runtime fat jar')
      }
      const proc = Bun.spawn(['gradle', 'shadowJar', '--console=plain'], {
        cwd: JAVA_DIR,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        throw new Error(`gradle shadowJar failed (exit ${exitCode}):\n${stderr}\n${stdout}`)
      }
    })()
  }
  return _buildPromise
}

export interface RenderPebbleTemplateOptions {
  /** Raw `.peb` template text for the entry template. */
  template: string
  /** Render context (props/signals/memos) — a plain JSON-serializable object. */
  vars?: Record<string, unknown>
  /** Additional `.peb` templates (basename without extension -> content). */
  siblingTemplates?: Record<string, string>
  /** `bf.scope_attr()`'s value for this render. Defaults to `'test'`. */
  scopeId?: string
}

/**
 * Render a hand-written `.peb` template (+ optional sibling templates and
 * vars) through the real Java/Pebble runtime. Builds the fat jar once
 * (memoized), writes the template(s) + vars to a scratch directory, shells
 * out `java -jar`, and returns the rendered HTML.
 */
export async function renderPebbleTemplate(options: RenderPebbleTemplateOptions): Promise<string> {
  if (!isJavaToolchainAvailable()) {
    throw new JavaNotAvailableError('java not found on PATH — skipping Pebble rendering')
  }
  await ensureFatJarBuilt()

  const tempDir = resolve(RENDER_TEMP_DIR, `pebble-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(tempDir, { recursive: true })

  try {
    const entryName = 'entry'
    await Bun.write(resolve(tempDir, `${entryName}.peb`), options.template)
    for (const [name, content] of Object.entries(options.siblingTemplates ?? {})) {
      await Bun.write(resolve(tempDir, `${name}.peb`), content)
    }
    const varsPath = resolve(tempDir, 'vars.json')
    await Bun.write(varsPath, JSON.stringify(options.vars ?? {}))

    const args = [FAT_JAR, tempDir, entryName, varsPath]
    if (options.scopeId) {
      args.push(options.scopeId)
    }
    const proc = Bun.spawn(['java', ...JVM_FLAGS, '-jar', ...args], { stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(`java -jar barefootjs-pebble-runtime.jar failed (exit ${exitCode}):\n${stderr}`)
    }
    return stdout
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Render a single hand-written `.peb` template string against a props
 * object. Thin convenience wrapper over {@link renderPebbleTemplate} for
 * the common single-template case (`packages/adapter-pebble/src/__tests__/`
 * smoke tests) — matches this file's original (Phase 1) stub signature.
 */
export async function renderPebble(template: string, props: Record<string, unknown>): Promise<string> {
  return renderPebbleTemplate({ template, vars: props })
}

// ===========================================================================
// Phase 4: JSX-compiling conformance harness (`renderPebbleComponent`)
// ===========================================================================

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
   * Explicit component to render when `source` declares multiple exports.
   * Mirrors the Hono reference's `componentName`; omitted for single-export
   * fixtures, which fall back to the default/first export.
   */
  componentName?: string
}

/**
 * Recover the bare component name from a compiler-emitted template file
 * path. `templatesPerComponent` adapters write each component to
 * `<dir>/<ComponentName><adapter.extension>`, and downstream pairing logic
 * needs the raw component name back to look up the matching IR in
 * `irsByName`. Exported for testing. Identical to
 * `packages/adapter-rust/src/test-render.ts`'s helper of the same name.
 */
export function templateBaseName(path: string, extension: string): string {
  const filename = path.substring(path.lastIndexOf('/') + 1)
  return filename.endsWith(extension) ? filename.slice(0, -extension.length) : filename
}

/**
 * Component names a component IR imports from sibling source files — the
 * transitive set of child components a fixture actually references (#checkbox).
 * Mirrors the Go/Xslate/Jinja/Rust harness helper of the same name.
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
 * Convert PascalCase to snake_case for template naming — matches the
 * adapter's own (private) `toTemplateName`/`pebble-naming.ts` convention
 * exactly (same regex as `packages/adapter-rust/src/test-render.ts`'s
 * `toSnakeCase`).
 */
function toSnakeCase(name: string): string {
  return name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}

/**
 * Build the `_bf_manifest.json` sidecar `Bf.render_child`/`Main.loadManifest`
 * read (see their own doc comments for the full design rationale): one entry
 * per child template, keyed by its snake_case template name (exactly what
 * `bf.render_child('<name>', ...)` calls resolve against), carrying:
 *
 *   - `componentName` — the ORIGINAL PascalCase name, used for the
 *     no-`_bf_slot` random scope-id prefix (`<ComponentName>_<rand6>`).
 *   - `ssrDefaults` — `extractSsrDefaults(childIR.metadata)` output, sent
 *     VERBATIM (per-entry `{value, propName?, isRestProps?}` shape intact)
 *     so `DeriveStashFromDefaults` can resolve an aliased destructured
 *     prop's CALLER-facing key onto its local template var.
 *   - `restPropsName` / `paramNames` — the rest-bag routing inputs, computed
 *     exactly like `packages/adapter-rust/src/test-render.ts`'s
 *     `buildChildrenPayload` (`param_names`/`rest_props_name` fields).
 *
 * The ENTRY component itself also gets a manifest entry (keyed by its own
 * snake_case name) in case a reachable child recursively invokes it back —
 * `renderPebbleComponent` passes `ir` alongside `childTemplates` here.
 */
function buildManifest(
  allComponents: Map<string, { ir: ComponentIR }>,
): Record<string, { componentName: string; ssrDefaults: Record<string, SsrDefault>; restPropsName: string | null; paramNames: string[] }> {
  const out: Record<
    string,
    { componentName: string; ssrDefaults: Record<string, SsrDefault>; restPropsName: string | null; paramNames: string[] }
  > = {}
  for (const [componentName, { ir: childIR }] of allComponents) {
    out[toSnakeCase(componentName)] = {
      componentName,
      ssrDefaults: extractSsrDefaults(childIR.metadata) ?? {},
      restPropsName: childIR.metadata.restPropsName ?? null,
      paramNames: (childIR.metadata.propsParams ?? []).map(p => p.sourceName ?? p.name),
    }
  }
  return out
}

/**
 * Build the render context's `vars` object (props + signal/memo seeds) — a
 * plain JS object written to `vars.json` and read verbatim into the root
 * Pebble render context (`Main.render`: `context.putAll(vars)`, no
 * mangling pass on that side). UNLIKE `renderMinijinjaComponent`'s
 * `buildVars` (whose Rust runtime mangles reserved-word keys itself, inside
 * `render_named`), every key here is written through {@link pebbleIdent}
 * up front — the compiled ROOT template references each prop/signal/memo
 * through that IDENTICAL mangling (see `pebble-naming.ts`'s file header),
 * and nothing downstream of `vars.json` mangles keys again.
 *
 * Otherwise a near-verbatim port of `renderMinijinjaComponent`'s
 * `buildVars`: seeds prop defaults through `deriveStashFromDefaults`
 * (`propName`-present-and-non-null-wins-over-default), routes undeclared
 * props into the rest bag, then signals/memos/leftover-derived-defaults —
 * see that function's own comments for the full rationale of each step.
 */
function buildVars(props: Record<string, unknown> | undefined, ir: ComponentIR): Record<string, unknown> {
  const vars: Record<string, unknown> = {}

  const rootSsrDefaults = extractSsrDefaults(ir.metadata) ?? {}
  const derivedProps = deriveStashFromDefaults(rootSsrDefaults, props ?? {})
  for (const param of ir.metadata.propsParams) {
    if (param.isRest) continue
    vars[pebbleIdent(param.name)] = derivedProps[param.name] ?? null
  }

  const restPropsName = ir.metadata.restPropsName
  const declaredParams = new Set(ir.metadata.propsParams.map(p => p.sourceName ?? p.name))
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
    vars[pebbleIdent(restPropsName)] = Object.fromEntries(restBagEntries)
  }

  const localParamNames = new Set(ir.metadata.propsParams.map(p => p.name))
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('__')) continue
      if (routedKeys.has(key)) continue
      if (localParamNames.has(key)) continue
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        Array.isArray(value) ||
        (value && typeof value === 'object')
      ) {
        vars[pebbleIdent(key)] = value
      }
    }
  }

  for (const signal of ir.metadata.signals) {
    if (signal.envReader) continue
    if (Object.prototype.hasOwnProperty.call(derivedProps, signal.getter)) {
      vars[pebbleIdent(signal.getter)] = derivedProps[signal.getter]
    }
  }

  for (const memo of ir.metadata.memos) {
    if (Object.prototype.hasOwnProperty.call(derivedProps, memo.name)) {
      vars[pebbleIdent(memo.name)] = derivedProps[memo.name]
    }
  }

  for (const [name, value] of Object.entries(derivedProps)) {
    const mangled = pebbleIdent(name)
    if (Object.prototype.hasOwnProperty.call(vars, mangled)) continue
    vars[mangled] = value
  }

  return vars
}

/**
 * Recursively replace JS's non-finite numbers (`NaN`, `Infinity`,
 * `-Infinity`) with the shared `{"$num": "NaN" | "Infinity" | "-Infinity"}`
 * sentinel (`spec/template-helpers.md`, already decoded by this package's
 * own `HelperVectorsTest`/`EvalVectorsTest` — reused here, per the
 * `add-adapter` Phase 4 task, rather than inventing a second convention
 * like the Rust harness's `__bf_special`) — plain JSON has no way to
 * represent them (`JSON.stringify(NaN)` silently becomes `null`). Decoded
 * back by `JsonDecode.materialize` (`Main`'s `vars.json`/manifest readers).
 * A `Date` prop crosses as its ISO-8601 string — `Bf.date`'s `toInstant`
 * accepts a plain ISO string.
 */
function encodeSpecials(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { $num: 'NaN' }
    if (value === Infinity) return { $num: 'Infinity' }
    if (value === -Infinity) return { $num: '-Infinity' }
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

/**
 * Render a JSX component through `PebbleAdapter` end-to-end against the
 * real Java/Pebble runtime: compiles `source` (+ any `components`) to `.peb`
 * templates, writes the parent + every reachable child into one temp dir
 * alongside a `_bf_manifest.json` sidecar, then shells out `java -jar` via
 * the SAME fat-jar-build-once/spawn machinery {@link renderPebbleTemplate}
 * uses. Near-verbatim port of `renderMinijinjaComponent`'s JSX-compiling
 * front half — see this file's header for why minijinja/Rust is the closest
 * structural sibling.
 */
export async function renderPebbleComponent(options: RenderOptions): Promise<string> {
  const { source, adapter, props, components, componentName: requestedName } = options

  // Compile child components first — see `renderMinijinjaComponent`'s own
  // comment for the reachable-children error-gate rationale (a child
  // source file may export components the parent never actually renders,
  // some of which may legitimately fail to lower).
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
        childTemplates.set(childIrs[0].metadata.componentName, {
          template: childTemplateFiles[0].content,
          ir: childIrs[0],
        })
      } else {
        const childIrsByName = new Map(childIrs.map(i => [i.metadata.componentName, i]))
        for (const tf of childTemplateFiles) {
          const baseName = templateBaseName(tf.path, adapter.extension)
          const matchedIR = childIrsByName.get(baseName) ?? childIrs[0]
          childTemplates.set(matchedIR.metadata.componentName, { template: tf.content, ir: matchedIR })
        }
      }
    }
  }

  const result = compileJSX(source, 'component.tsx', {
    adapter,
    outputIR: true,
    siblingTemplatesRegistered: Boolean(components),
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
  const ir =
    (requestedName ? irs.find(i => i.metadata.componentName === requestedName) : undefined) ??
    irs.find(i => i.metadata.hasDefaultExport) ??
    irs.find(i => i.metadata.isExported) ??
    irs[0]

  let templateFile: { content: string } | undefined
  if (templateFiles.length === 1) {
    templateFile = templateFiles[0]
  } else {
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

  // Reachable-children error gate — see `renderMinijinjaComponent`'s own
  // comment.
  {
    const reachable = new Set<string>()
    const queue = [...collectImportedComponentNames(ir)]
    while (queue.length > 0) {
      const name = queue.shift() as string
      if (reachable.has(name)) continue
      const entry = childTemplates.get(name)
      if (!entry) continue
      reachable.add(name)
      queue.push(...collectImportedComponentNames(entry.ir))
    }
    for (const name of reachable) {
      const entry = childTemplates.get(name)
      if (!entry) continue
      const before = entry.ir.errors?.length ?? 0
      adapter.generate(entry.ir, { siblingTemplatesRegistered: true })
      const childErrors = (entry.ir.errors ?? []).slice(before).filter(e => e.severity === 'error')
      if (childErrors.length > 0) {
        throw new Error(`Compilation errors in reachable child ${name}:\n${childErrors.map(e => e.message).join('\n')}`)
      }
    }
  }

  const componentName = ir.metadata.componentName

  if (!isJavaToolchainAvailable()) {
    throw new JavaNotAvailableError('java not found on PATH — skipping Pebble rendering')
  }
  await ensureFatJarBuilt()

  const tempDir = resolve(
    RENDER_TEMP_DIR,
    `pebble-component-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tempDir, { recursive: true })

  try {
    await Bun.write(resolve(tempDir, `${toSnakeCase(componentName)}.peb`), templateFile.content)
    for (const [childName, { template }] of childTemplates) {
      await Bun.write(resolve(tempDir, `${toSnakeCase(childName)}.peb`), template)
    }

    // `_bf_manifest.json` — carries metadata for every template written
    // above (entry included, in case a reachable child calls back into it).
    const allComponents = new Map<string, { ir: ComponentIR }>(childTemplates)
    allComponents.set(componentName, { ir })
    const manifest = buildManifest(allComponents)
    if (Object.keys(manifest).length > 0) {
      await Bun.write(resolve(tempDir, '_bf_manifest.json'), JSON.stringify(encodeSpecials(manifest)))
    }

    // Honour `__instanceId` from props for the root scope id (shared-component
    // fixtures pin `<ComponentName>_test`); default to 'test' otherwise.
    const rootScopeIdRaw = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'

    const vars = buildVars(props, ir)
    // (#1922) Request-scoped `searchParams()`: bind to an empty-query reader
    // only when the component imports `searchParams` — mirrors the Jinja/Rust
    // harnesses' conditional `SearchParams('')`/`payload.search_params` binding.
    if (importsSearchParams(ir.metadata)) {
      vars.__bf_search_params = ''
    }
    // bf-p hydration payload: mirrors `integrations/spring`'s
    // `Render.renderRoot` handing its route's `props` to the root `Bf`
    // verbatim — the caller's raw props, unmodified (no defaults, no
    // signal/memo seeding, no rest-bag nesting, no `pebbleIdent` mangling:
    // the client reads bf-p by JS prop name). Excludes internal harness-only
    // keys (`__instanceId` etc.), which are never a real caller-facing prop.
    // `Main.render` pops this reserved key off the context into the root
    // `Bf`'s `rootProps`, so it never becomes a template var.
    const userProps: Record<string, unknown> = {}
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (key.startsWith('__')) continue
        userProps[key] = value
      }
    }
    vars.__bf_root_props = userProps

    const varsPath = resolve(tempDir, 'vars.json')
    await Bun.write(varsPath, JSON.stringify(encodeSpecials(vars)))

    const args = [FAT_JAR, tempDir, toSnakeCase(componentName), varsPath, rootScopeIdRaw]
    const proc = Bun.spawn(['java', ...JVM_FLAGS, '-jar', ...args], { stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(`java -jar barefootjs-pebble-runtime.jar failed (exit ${exitCode}):\n${stderr}`)
    }
    return stdout
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
