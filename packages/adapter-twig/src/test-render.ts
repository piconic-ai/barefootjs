/**
 * Twig template test renderer
 *
 * Compiles JSX source with `TwigAdapter` and renders the resulting `.twig`
 * templates to HTML via `php` + `twig/twig` driven through the PHP runtime:
 * `Barefoot\BarefootJS` (engine-agnostic, `packages/adapter-php/src/`) +
 * `Barefoot\TwigBackend` (`packages/adapter-twig/php/src/`), wired together
 * via the `barefootjs/runtime` path-repo dependency declared in
 * `packages/adapter-twig/php/composer.json`. Used by the adapter-tests
 * conformance runner (`runAdapterConformanceTests`).
 *
 * Near-mechanical port of the sibling Jinja harness
 * (`packages/adapter-jinja/src/test-render.ts`) — same `RenderOptions`
 * contract, same prop / signal / memo seeding order, same multi-component
 * child-renderer registration via the production `register_child_renderer`
 * path (so a child's `bf-s` scope id derives from `<parentScope>_<slotId>`
 * exactly as a real `bf build` page would). Two things differ from the
 * Jinja port:
 *
 *  1. Target language: the generated render script is PHP, not Python, and
 *     its runtime is invoked via `Barefoot\`-namespaced classes / snake_case
 *     methods (see `packages/adapter-php/src/` for the runtime,
 *     `packages/adapter-twig/php/src/` for the Twig backend).
 *  2. Prop transport: request-scoped caller PROPS (everything the harness's
 *     `RenderOptions.props` supplies, plus statically-resolved defaults/
 *     signal/memo seeds derived from them) are written to a `props.json`
 *     file and loaded via `json_decode(...)` (NO assoc — the canonical
 *     "JSON objects = stdClass, JSON arrays = PHP lists" convention), rather
 *     than serialised as inline Python source the way the Jinja port's
 *     `buildPythonProps`/`toPyLiteral` do. Two kinds of values genuinely
 *     can't round-trip through JSON and are instead emitted as literal PHP
 *     statements appended after the `json_decode` call: non-finite numbers
 *     (`NAN`/`INF`/`-INF` — signal-init values only; JSON has no way to
 *     represent them) and the `searchParams` binding (a `Barefoot\SearchParams`
 *     *object instance*, not a JSON value). Compile-time-derived STATIC data
 *     (a child template's `ssrDefaults`) stays literal PHP source (mirrors
 *     the Jinja port's `ssrDefaultsToPy`) since it never came from the
 *     caller's `props` and needs no JSON round-trip.
 */

import { compileJSX, extractSsrDefaults, importsSearchParams } from '@barefootjs/jsx'
import type { ComponentIR } from '@barefootjs/jsx'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const RENDER_TEMP_DIR = resolve(import.meta.dir, '../.render-temp')
// The bundled PHP runtime (`Barefoot\BarefootJS` + `Barefoot\TwigBackend`)
// lives alongside this package (mirrors adapter-jinja bundling `python/` /
// adapter-go-template bundling `runtime/` in-tree). The render script
// `require`s this directory's Composer autoloader so `Barefoot\...` classes
// resolve.
const PHP_DIR = resolve(import.meta.dir, '../php')

export class TwigNotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TwigNotAvailableError'
  }
}

/**
 * Recover the bare component name from a compiler-emitted template file
 * path. `templatesPerComponent` adapters write each component to
 * `<dir>/<ComponentName><adapter.extension>` (Twig: `.twig`), and
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

let _twigAvailable: boolean | null = null

/**
 * Memoized availability probe: `php` on PATH, the adapter's own Composer
 * vendor dir installed, and `Twig\Environment` resolvable from it. Uses
 * `Bun.spawnSync` (not the async `Bun.spawn` the actual render uses) per the
 * design doc — a cheap synchronous check run once per process.
 */
function isTwigAvailable(): boolean {
  if (_twigAvailable !== null) return _twigAvailable
  try {
    const autoloadPath = resolve(PHP_DIR, 'vendor/autoload.php')
    const probe = `require ${phpStr(autoloadPath)}; exit(class_exists('\\Twig\\Environment') ? 0 : 1);`
    const proc = Bun.spawnSync(['php', '-r', probe], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
    _twigAvailable = proc.exitCode === 0
  } catch {
    _twigAvailable = false
  }
  return _twigAvailable
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

export async function renderTwigComponent(options: RenderOptions): Promise<string> {
  const { source, adapter, props, components, componentName: requestedName } = options

  // Compile child components first.
  //
  // A child SOURCE FILE may export more components than the parent actually
  // references (e.g. `../icon` exports ~30 icons + a generic `Icon`, but
  // `Checkbox` only imports `CheckIcon`). Some of those unreferenced
  // components legitimately can't lower to Twig — the generic `Icon` spreads
  // `{...props}` onto CHILD components (`<GitHubIcon {...props}/>`), which has
  // no Twig hash-splat form (Twig hash literals can't splat a runtime dict
  // into named entries at a call site). Throwing on those would block a
  // fixture that never renders them. So defer the per-file error gate: collect
  // every component's template + IR up front, then (after the parent compile
  // pins the reachable set) re-generate ONLY the reachable children and throw
  // if any of THOSE error. Mirrors the Jinja harness's reachable-children
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

  // Build temp directory.
  const tempDir = resolve(
    RENDER_TEMP_DIR,
    `twig-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tempDir, { recursive: true })

  try {
    // Write `.twig` files (parent + children), named by snake_case so
    // the adapter's `bf.render_child('<snake>', …)` calls + the backend's
    // `render_named('<snake>', …)` resolve from the dir.
    await Bun.write(resolve(tempDir, `${toSnakeCase(componentName)}.twig`), templateFile.content)
    for (const [childName, { template }] of childTemplates) {
      await Bun.write(resolve(tempDir, `${toSnakeCase(childName)}.twig`), template)
    }

    // Honour `__instanceId` from props for the root scope id so
    // shared-component fixtures (which pin `<ComponentName>_test`) match
    // cross-adapter; default to 'test' otherwise.
    const rootScopeIdRaw = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'

    // Build the JSON-transportable props payload + any literal PHP
    // assignments for values JSON can't carry (non-finite numbers, the
    // `searchParams` object binding).
    const { data: propsData, literalAssignments } = buildTwigProps(props, ir)
    await Bun.write(resolve(tempDir, 'props.json'), JSON.stringify(propsData))

    // Build child-renderer registration PHP.
    const childRenderers = buildChildRenderersPhp(childTemplates)

    const autoloadPath = resolve(PHP_DIR, 'vendor/autoload.php')

    const renderScript = `<?php
require ${phpStr(autoloadPath)};

// Single Twig backend over the temp template dir.
$backend = new \\Barefoot\\TwigBackend(['paths' => [${phpStr(tempDir)}]]);
$bf = new \\Barefoot\\BarefootJS(null, ['backend' => $backend]);
// Honour an explicit __instanceId so shared-component fixtures match the
// scope ids Hono / Go / Jinja emit; default to 'test'.
$bf->_scope_id(${phpStr(rootScopeIdRaw)});

$vars = (array) json_decode(file_get_contents('props.json'));
${literalAssignments.join('\n')}

${childRenderers}
$html = $backend->render_named(${phpStr(toSnakeCase(componentName))}, $bf, $vars);
echo $html;
`
    await Bun.write(resolve(tempDir, 'render.php'), renderScript)

    if (!isTwigAvailable()) {
      throw new TwigNotAvailableError(
        'php with twig/twig not found (run: composer install --working-dir packages/adapter-twig/php) — skipping Twig rendering',
      )
    }

    const proc = Bun.spawn(['php', 'render.php'], {
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
      throw new Error(`php render failed (exit ${exitCode}):\n${stderr}`)
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
 * Mirrors the Go / Jinja / Xslate harness helper of the same name.
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
 * Build PHP code that registers one child-component renderer per child
 * template via the production `BarefootJS::register_child_renderer`.
 *
 * The closure mirrors the manifest-driven path in the PHP runtime (ports
 * `runtime.py`'s `register_components_from_manifest`'s `make_renderer`,
 * see the Jinja harness's `buildChildRenderers` docstring for the full
 * rationale): it derives the child scope id from `<parentScope>_<slotId>`
 * (the parent's `bf.render_child('<name>', {…, '_bf_slot': '<slotId>'})`
 * passes `_bf_slot`), seeds signal / memo / prop defaults from the child
 * IR's `ssrDefaults`, shares the parent's script list, and renders the
 * child `.twig` through the same backend. Loop children (no `_bf_slot`)
 * fall back to `<ComponentName>_<random>` like the Jinja/Xslate harnesses.
 *
 * Unlike the Jinja port's Python closures, this does NOT need a
 * `_make_child_renderer_<name>()` factory-function wrapper: PHP's
 * `function (...) use ($x)` captures `$x` BY VALUE at the point the closure
 * literal is evaluated (unless written `use (&$x)`), so there is no
 * Python-style late-binding-loop-closure hazard to guard against — each
 * `register_child_renderer` call's closure gets its own `$_defaults`
 * (computed as a literal PHP expression evaluated fresh, per closure) and
 * captures only `$backend` / `$bf` (deliberately BY VALUE — this test
 * harness never reassigns those top-level bindings after the closures are
 * defined, so a value capture is equivalent to and simpler than a reference
 * capture here).
 *
 * `child_props` arrives from Twig's compiled hash-literal at the
 * `bf.render_child(...)` call site — Twig hash/array literals both compile
 * to plain PHP arrays (Twig has no separate "hash" runtime type), so the
 * renderer closure receives a fresh, mutation-safe PHP array per call. Every
 * key is ALREADY keyword-mangled: `bf.render_child` (the runtime method the
 * compiled parent template calls) mangles every prop key via `twig_ident`
 * before invoking the registered renderer (mirrors the Jinja/Python
 * runtime's `render_child` contract) — so the rest-bag routing below and the
 * `_bf_slot` / `key` / `children` pops all compare against ALREADY-mangled
 * key spellings; the `keep` set mangles the child's declared param names to
 * match.
 */
function buildChildRenderersPhp(
  childTemplates: Map<string, { template: string; ir: ComponentIR }>,
): string {
  if (childTemplates.size === 0) return ''

  const lines: string[] = []
  lines.push(`// Register child component renderers`)

  for (const [componentName, { ir: childIR }] of childTemplates) {
    const snakeName = toSnakeCase(componentName)
    const ssrDefaults = extractSsrDefaults(childIR.metadata) ?? {}
    const defaultsPhp = ssrDefaultsToPhp(ssrDefaults)
    const restPropsName = childIR.metadata.restPropsName
    const paramNames = (childIR.metadata.propsParams ?? []).map(p => p.name)

    lines.push(
      `$bf->register_child_renderer(${phpStr(snakeName)}, function ($child_props, $caller_bf = null) use ($backend, $bf) {`,
    )
    lines.push(`    $_defaults = ${defaultsPhp};`)
    // `caller_bf` is the instance whose template invoked render_child
    // (#1897) — nested children chain their scope/slot identity off it.
    lines.push(`    $host_scope = $caller_bf !== null ? $caller_bf->_scope_id() : $bf->_scope_id();`)
    if (restPropsName) {
      // A child that destructures a rest bag references it in its template;
      // seed it with an empty array when the caller didn't pass one so the
      // Twig var lookup doesn't fault. Route non-param props into the rest
      // bag, mirroring the production runtime's `_derive_stash_from_defaults`
      // isRestProps branch and JSX rest semantics: a caller prop the child
      // didn't destructure belongs in the bag, not as a top-level stash var
      // the template never reads. A plain PHP assoc array (not stdClass) is
      // used for the rest bag — the "canonical value convention" documents
      // assoc arrays as an accepted "object" shape for runtime helpers
      // (`spread_attrs`, the Evaluator) alongside stdClass.
      const restKeyPhp = phpStr(restPropsName)
      const keepNames = [...new Set([...paramNames, restPropsName, 'children', 'key', '_bf_slot'])]
      const keepNamesPhp = `[${keepNames.map(phpStr).join(', ')}]`
      lines.push(`    $_rest_key = \\Barefoot\\twig_ident(${restKeyPhp});`)
      lines.push(`    if (!array_key_exists($_rest_key, $child_props)) { $child_props[$_rest_key] = []; }`)
      lines.push(`    $_keep = array_map(fn($k) => \\Barefoot\\twig_ident($k), ${keepNamesPhp});`)
      lines.push(`    foreach (array_keys($child_props) as $_k) {`)
      lines.push(`        if (!in_array($_k, $_keep, true)) {`)
      lines.push(`            $child_props[$_rest_key][$_k] = $child_props[$_k];`)
      lines.push(`            unset($child_props[$_k]);`)
      lines.push(`        }`)
      lines.push(`    }`)
    }
    lines.push(`    $slot_id = $child_props['_bf_slot'] ?? null;`)
    lines.push(`    unset($child_props['_bf_slot']);`)
    lines.push(`    $child_bf = new \\Barefoot\\BarefootJS(null, ['backend' => $backend]);`)
    // JSX `key` (reserved prop) → data-key on the child scope root, for keyed
    // loop reconciliation parity with Hono.
    lines.push(`    $data_key = $child_props['key'] ?? null;`)
    lines.push(`    unset($child_props['key']);`)
    lines.push(`    if ($data_key !== null) { $child_bf->_data_key($data_key); }`)
    // A loop child (no slot) gets a fresh `<ComponentName>_<rand>` id per
    // iteration — the PascalCase name is what `normalizeHTML` canonicalises
    // to `<ComponentName>_*`; a slotted child derives from the parent scope.
    lines.push(`    if ($slot_id) {`)
    lines.push(`        $child_bf->_scope_id($host_scope . '_' . $slot_id);`)
    lines.push(`    } else {`)
    lines.push(`        $child_bf->_scope_id(${phpStr(componentName)} . '_' . bin2hex(random_bytes(3)));`)
    lines.push(`    }`)
    lines.push(`    $child_bf->_is_child(true);`)
    lines.push(`    if ($slot_id) {`)
    lines.push(`        $child_bf->_bf_parent($host_scope);`)
    lines.push(`        $child_bf->_bf_mount($slot_id);`)
    lines.push(`    }`)
    // (#1897) A child template may itself call `bf.render_child(...)`
    // (AccordionTrigger renders ChevronDownIcon) — inside that template
    // `bf` is THIS fresh child instance, whose renderer registry starts
    // empty, so the nested call silently rendered ''. Share the parent's
    // registry so nested child renders resolve.
    lines.push(`    $child_bf->_child_renderers($bf->_child_renderers());`)
    lines.push(`    $child_bf->_scripts($bf->_scripts());`)
    lines.push(`    $child_bf->_script_seen($bf->_script_seen());`)
    // Seed template vars: static ssrDefaults first, caller's props win.
    lines.push(`    $_vars = array_merge($_defaults, $child_props);`)
    lines.push(`    $rendered = $backend->render_named(${phpStr(snakeName)}, $child_bf, $_vars);`)
    lines.push(`    if (is_string($rendered) && substr($rendered, -1) === "\\n") { $rendered = substr($rendered, 0, -1); }`)
    lines.push(`    return $rendered;`)
    lines.push(`});`)
    lines.push(``)
  }

  return lines.join('\n')
}

/**
 * Build the JSON-transportable props payload (`data`) plus any literal PHP
 * `$vars[...] = ...;` statements (`literalAssignments`) for values JSON
 * can't carry: non-finite numbers (only reachable via a signal's evaluated
 * initial value, or a caller-supplied numeric prop) and the `searchParams`
 * binding (a `Barefoot\SearchParams` object instance, not a JSON value).
 *
 * Mirrors the Jinja harness's `buildPythonProps`, except every ordinary
 * value stays a genuine JS value here (destined for `JSON.stringify`)
 * rather than being pre-rendered to Python source text — `render_named`
 * (the PHP backend) applies `twig_ident` key-mangling once, at render time,
 * exactly like the Jinja backend's `render_named` does for `jinja_ident`, so
 * this harness doesn't need to mangle keys itself either.
 */
function buildTwigProps(
  props: Record<string, unknown> | undefined,
  ir: ComponentIR,
): { data: Record<string, unknown>; literalAssignments: string[] } {
  const data: Record<string, unknown> = {}
  const literalAssignments: string[] = []

  function setEntry(name: string, value: unknown): void {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      literalAssignments.push(`$vars[${phpStr(name)}] = ${phpNumberLiteral(value)};`)
      return
    }
    data[name] = value
  }

  const explicitScope = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'
  setEntry('scope_id', explicitScope)

  // Prop params with defaults (before signals, so signals can reference them).
  for (const param of ir.metadata.propsParams) {
    if (props && param.name in props) continue
    if (param.defaultValue) {
      const value = evaluateSignalInit(param.defaultValue.trim(), props)
      if (value !== null) {
        setEntry(param.name, value)
        continue
      }
    }
    // No default + no caller value: pass `null` so Twig's var lookup for
    // an optional prop doesn't fault before its falsy branch elides.
    setEntry(param.name, null)
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
    setEntry(restPropsName, Object.fromEntries(restBagEntries))
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
        setEntry(key, value)
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
      setEntry(signal.getter, value)
    }
  }

  // Memo values seeded from the statically-evaluated ssrDefaults, same
  // as the production plugin's before_render hook.
  const ssrDefaults = extractSsrDefaults(ir.metadata) ?? {}
  for (const memo of ir.metadata.memos) {
    const entry = ssrDefaults[memo.name]
    const value =
      entry && typeof entry === 'object' && 'value' in (entry as Record<string, unknown>)
        ? (entry as Record<string, unknown>).value
        : 0
    setEntry(memo.name, value ?? 0)
  }

  // (#1922) Request-scoped `searchParams()`: bind `searchParams` to an
  // empty-query reader (so the render script needn't build one from a real
  // request). The conformance harness issues no query string (the
  // production Flask/PHP integration builds this from the request's query),
  // so `.get(k)` resolves to `null` and the author's `?? default` renders.
  // Only when the component imports `searchParams`. A `SearchParams`
  // instance isn't a JSON value, so it's a literal PHP assignment, not a
  // `props.json` entry.
  if (importsSearchParams(ir.metadata)) {
    literalAssignments.push(`$vars['searchParams'] = new \\Barefoot\\SearchParams('');`)
  }

  return { data, literalAssignments }
}

/**
 * Evaluate a signal initializer expression using provided props.
 * Handles: props.initial ?? 0, props.value, literal values.
 *
 * Language-agnostic (returns a real JS value, not source text) — shared
 * verbatim with the Jinja harness's helper of the same name.
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
 * PHP single-quoted string literal for arbitrary text. PHP single-quoted
 * strings support exactly two escapes (`\\` and `\'`) and pass everything
 * else through as raw bytes — since this file is written with `Bun.write`
 * (UTF-8), embedding non-ASCII text directly is safe and simpler than a
 * JSON-based escaper. Mirrors `escapeTwigSingleQuoted` /
 * `escapeJinjaSingleQuoted` / `escapeKolonSingleQuoted`'s escaping rule.
 */
function phpStr(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** PHP numeric literal, with JS's NaN/±Infinity mapped to PHP's real constants. */
function phpNumberLiteral(n: number): string {
  if (Number.isNaN(n)) return 'NAN'
  if (n === Infinity) return 'INF'
  if (n === -Infinity) return '-INF'
  return String(n)
}

/**
 * Serialise a static (compiler-derived) value to PHP source. Used ONLY for
 * `ssrDefaults` (never for caller-supplied `props`, which route through
 * `props.json` — see `buildTwigProps`) since those values never need a JSON
 * round-trip. Follows the "canonical value convention": a JS array becomes a
 * PHP list (`[...]`); a JS object becomes a `stdClass` (`(object) [...]`,
 * PHP's only object-literal spelling) so it round-trips through the same
 * runtime "object vs list" distinction a `props.json`-sourced value would.
 */
function toPhpLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return phpStr(value)
  if (typeof value === 'number') return phpNumberLiteral(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) {
    return `[${value.map(toPhpLiteral).join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${phpStr(k)} => ${toPhpLiteral(v)}`)
      .join(', ')
    return `(object) [${entries}]`
  }
  return 'null'
}

/**
 * Serialise an ssrDefaults map to a PHP assoc-array literal (the `$_defaults`
 * var a child renderer merges caller props over). This top-level container
 * is the "vars bag" domain (like `$vars` elsewhere in this file), not a JS
 * VALUE flowing into a template — so, unlike a nested object VALUE inside
 * one of its entries, it stays a plain PHP array rather than `(object) [...]`.
 */
function ssrDefaultsToPhp(defaults: Record<string, unknown>): string {
  const entries: string[] = []
  for (const [name, d] of Object.entries(defaults)) {
    // ssrDefaults entries are `{ value, propName?, isRestProps? }` or a
    // bare value. The child renderer's caller props win, so we only need
    // the static fallback `value` here.
    let value: unknown = d
    if (d && typeof d === 'object' && 'value' in (d as Record<string, unknown>)) {
      value = (d as Record<string, unknown>).value
    }
    entries.push(`${phpStr(name)} => ${toPhpLiteral(value)}`)
  }
  return `[${entries.join(', ')}]`
}
