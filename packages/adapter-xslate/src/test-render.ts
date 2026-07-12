/**
 * Text::Xslate (Kolon) template test renderer
 *
 * Compiles JSX source with `XslateAdapter` and renders the resulting
 * `.tx` templates to HTML via `perl` + `Text::Xslate` driven through
 * `BarefootJS` + `BarefootJS::Backend::Xslate`. Used by the
 * adapter-tests conformance runner (`runAdapterConformanceTests`).
 *
 * Mirrors the sibling Mojolicious `test-render.ts` (same `RenderOptions`
 * contract, same prop / signal / memo seeding, same multi-component
 * child-renderer registration), but the render path is engine-agnostic:
 * the backend builds a plain Kolon Text::Xslate from a template dir, so
 * the harness needs no web framework. Child components are wired through
 * the production `BarefootJS::register_child_renderer` so the child's
 * `bf-s` scope id derives from `<parentScope>_<slotId>` exactly as a real
 * `bf build` page would — closer to the canonical cross-adapter shape
 * than the Mojo harness's literal `test_<sN>`.
 */

import { compileJSX, extractSsrDefaults, importsSearchParams, evaluateSignalInit, tryEvaluateSignalInit } from '@barefootjs/jsx'
import type { ComponentIR } from '@barefootjs/jsx'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const RENDER_TEMP_DIR = resolve(import.meta.dir, '../.render-temp')
// Xslate-specific lib (BarefootJS::Backend::Xslate) lives in this package; the
// engine-agnostic core (BarefootJS.pm) is in @barefootjs/perl. Both dirs must
// be on the render script's @INC so `use BarefootJS` and
// `use BarefootJS::Backend::Xslate` resolve.
const LIB_DIR = resolve(import.meta.dir, '../lib')
const PERL_CORE_LIB_DIR = resolve(import.meta.dir, '../../adapter-perl/lib')

export class XslateNotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XslateNotAvailableError'
  }
}

/**
 * Recover the bare component name from a compiler-emitted template file
 * path. `templatesPerComponent` adapters write each component to
 * `<dir>/<ComponentName><adapter.extension>` (Xslate: `.tx`), and
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

/**
 * Escape a string for safe embedding inside a Perl single-quoted
 * literal (`'…'`). Single-quoted Perl strings honour only two
 * metacharacters: `\\` and `\'`.
 */
function escapePerlSingleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

let _perlAvailable: boolean | null = null
async function isXslateAvailable(): Promise<boolean> {
  if (_perlAvailable !== null) return _perlAvailable
  try {
    const proc = Bun.spawn(['perl', '-MText::Xslate', '-e', 'print $Text::Xslate::VERSION'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    await proc.exited
    _perlAvailable = proc.exitCode === 0
  } catch {
    _perlAvailable = false
  }
  return _perlAvailable
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

export async function renderXslateComponent(options: RenderOptions): Promise<string> {
  const { source, adapter, props, components, componentName: requestedName } = options

  // Compile child components first.
  //
  // A child SOURCE FILE may export more components than the parent actually
  // references (e.g. `../icon` exports ~30 icons + a generic `Icon`, but
  // `Checkbox` only imports `CheckIcon`). Some of those unreferenced
  // components legitimately can't lower to Kolon — the generic `Icon` spreads
  // `{...props}` onto CHILD components (`<GitHubIcon {...props}/>`), which has
  // no Kolon form (`%{$props}` flatten is Perl-only; same engine divergence as
  // the `button` fixture). Throwing on those would block a fixture that never
  // renders them. So defer the per-file error gate: collect every component's
  // template + IR up front, then (after the parent compile pins the reachable
  // set) re-generate ONLY the reachable children and throw if any of THOSE
  // error. Mirrors the Go harness's reachable-children emission (#checkbox).
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

  // Compile parent source. `siblingTemplatesRegistered: Boolean(components)`
  // matches this harness's real behavior — every sibling child template is registered
  // alongside the parent before rendering, so a loop-body cross-template
  // call resolves at render time (#2205).
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
    `xslate-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tempDir, { recursive: true })

  try {
    // Write `.tx` files (parent + children), named by snake_case so
    // the adapter's `$bf.render_child('<snake>', …)` calls + the
    // backend's `render_named('<snake>', …)` resolve from the dir.
    await Bun.write(resolve(tempDir, `${toSnakeCase(componentName)}.tx`), templateFile.content)
    for (const [childName, { template }] of childTemplates) {
      await Bun.write(resolve(tempDir, `${toSnakeCase(childName)}.tx`), template)
    }

    // Build props hash for Perl.
    const propsPerl = buildPerlProps(componentName, props, ir)

    // Honour `__instanceId` from props for the root scope id so
    // shared-component fixtures (which pin `<ComponentName>_test`) match
    // cross-adapter; default to 'test' otherwise.
    const rootScopeIdRaw = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'
    const rootScopeId = escapePerlSingleQuoted(rootScopeIdRaw)

    // Build child-renderer registration for Perl.
    const childRenderers = buildChildRenderers(childTemplates, ir)

    const renderScript = `#!/usr/bin/env perl
use strict;
use warnings;
use utf8;

use lib '${LIB_DIR}', '${PERL_CORE_LIB_DIR}';
use JSON::PP ();
use BarefootJS;
use BarefootJS::Backend::Xslate;

binmode(STDOUT, ':utf8');

# Single Text::Xslate (Kolon) backend over the temp template dir. The
# default-built instance registers the grep_filter / grep_every /
# grep_some functions the adapter emits for standalone
# .filter / .every / .some lowering.
my $backend = BarefootJS::Backend::Xslate->new(path => ['${tempDir}']);
my $bf = BarefootJS->new(undef, { backend => $backend });
# Honour an explicit __instanceId so shared-component fixtures match the
# scope ids Hono / Go emit; default to 'test'.
$bf->_scope_id('${rootScopeId}');

my $props = ${propsPerl};

${childRenderers}

my \$html = \$backend->render_named('${toSnakeCase(componentName)}', \$bf, \$props);
print \$html;
`
    await Bun.write(resolve(tempDir, 'render.pl'), renderScript)

    if (!await isXslateAvailable()) {
      throw new XslateNotAvailableError('perl with Text::Xslate not found — skipping Xslate rendering')
    }

    const proc = Bun.spawn(['perl', 'render.pl'], {
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
      throw new Error(`perl render failed (exit ${exitCode}):\n${stderr}`)
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
 * Build Perl code that registers one child-component renderer per child
 * template via the production `BarefootJS::register_child_renderer`.
 *
 * The closure mirrors the manifest-driven path in `BarefootJS.pm`: it
 * derives the child scope id from `<parentScope>_<slotId>` (the parent's
 * `$bf.render_child('<name>', { …, _bf_slot => '<slotId>' })` passes
 * `_bf_slot`), seeds signal / memo / prop defaults from the child IR's
 * `ssrDefaults`, shares the parent's script list, and renders the child
 * `.tx` through the same backend. Loop children (no `_bf_slot`) fall back
 * to `<snake_name>` like the Mojo harness.
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
    // Statically-derived ssrDefaults the child template's vars seed from
    // (prop defaults + signal / memo initial values), serialised to a
    // Perl hashref literal.
    const ssrDefaults = extractSsrDefaults(childIR.metadata) ?? {}
    const defaultsPerl = ssrDefaultsToPerl(ssrDefaults)
    const restPropsName = childIR.metadata.restPropsName

    lines.push(`{`)
    lines.push(`  my $defaults = ${defaultsPerl};`)
    lines.push(`  $bf->register_child_renderer('${snakeName}', sub {`)
    // `$caller_bf` is the instance whose template invoked render_child
    // (#1897) — nested children chain their scope/slot identity off it.
    lines.push(`    my ($child_props, $caller_bf) = @_;`)
    lines.push(`    my $host_scope = (defined $caller_bf ? $caller_bf->_scope_id : $bf->_scope_id);`)
    // A child that destructures a rest bag references `$<rest>` in its
    // template; seed it with an empty hashref when the caller didn't pass
    // one so Kolon's var lookup doesn't fault.
    if (restPropsName) {
      lines.push(`    $child_props->{${restPropsName}} = {} unless defined $child_props->{${restPropsName}};`)
      // (#1897) Route non-param props into the rest bag, mirroring the
      // production runtime's `_derive_stash_from_defaults` isRestProps
      // branch and JSX rest semantics: a caller prop the child didn't
      // destructure (`href` on PaginationPrevious's `{...props}` anchor)
      // belongs in the bag, not as a top-level stash var the template
      // never reads.
      const paramNames = (childIR.metadata.propsParams ?? []).map(p => p.name)
      const keep = JSON.stringify([...new Set([...paramNames, restPropsName, 'children', 'key', '_bf_slot'])])
      lines.push(`    {`)
      lines.push(`      my %keep = map { $_ => 1 } @{ ${perlArrayLiteral(keep)} };`)
      lines.push(`      for my $k (grep { !$keep{$_} } keys %$child_props) {`)
      lines.push(`        $child_props->{${restPropsName}}{$k} = delete $child_props->{$k};`)
      lines.push(`      }`)
      lines.push(`    }`)
    }
    lines.push(`    my $slot_id = delete $child_props->{_bf_slot};`)
    lines.push(`    my $child_bf = BarefootJS->new(undef, { backend => $backend });`)
    // JSX `key` (reserved prop) → data-key on the child scope root, for keyed
    // loop reconciliation parity with Hono.
    lines.push(`    my $data_key = delete $child_props->{key};`)
    lines.push(`    $child_bf->_data_key($data_key) if defined $data_key;`)
    // A loop child (no slot) gets a fresh `<ComponentName>_<rand>` id per
    // iteration — the PascalCase name is what `normalizeHTML` canonicalises to
    // `<ComponentName>_*`; a slotted child derives from the parent scope.
    lines.push(`    $child_bf->_scope_id($slot_id ? $host_scope . '_' . $slot_id : '${componentName}_' . substr(rand() =~ s/^0\\.//r, 0, 6));`)
    lines.push(`    $child_bf->_is_child(1);`)
    lines.push(`    if ($slot_id) { $child_bf->_bf_parent($host_scope); $child_bf->_bf_mount($slot_id); }`)
    // (#1897) A child template may itself call `$bf.render_child(...)`
    // (AccordionTrigger renders ChevronDownIcon) — inside that template
    // `$bf` is THIS fresh child instance, whose renderer registry starts
    // empty, so the nested call silently rendered ''. Share the parent's
    // registry so nested child renders resolve.
    lines.push(`    $child_bf->_child_renderers($bf->_child_renderers);`)
    lines.push(`    $child_bf->_scripts($bf->_scripts);`)
    lines.push(`    $child_bf->_script_seen($bf->_script_seen);`)
    // Seed template vars: static ssrDefaults first, caller's props win.
    lines.push(`    my %vars = (%$defaults, %$child_props);`)
    lines.push(`    my $rendered = $backend->render_named('${snakeName}', $child_bf, \\%vars);`)
    lines.push(`    chomp $rendered;`)
    lines.push(`    return $rendered;`)
    lines.push(`  });`)
    lines.push(`}`)
    lines.push(``)
  }

  return lines.join('\n')
}



/** Render a JSON string-array as a Perl arrayref literal (['a','b']). */
function perlArrayLiteral(jsonArray: string): string {
  const names = JSON.parse(jsonArray) as string[]
  return `[${names.map(n => `'${n.replace(/[\\']/g, m => `\\${m}`)}'`).join(', ')}]`
}

/** Serialise an ssrDefaults map to a Perl hashref literal. */
function ssrDefaultsToPerl(defaults: Record<string, unknown>): string {
  const entries: string[] = []
  for (const [name, d] of Object.entries(defaults)) {
    // ssrDefaults entries are `{ value, propName?, isRestProps? }` or a
    // bare value. The child renderer's caller props win, so we only need
    // the static fallback `value` here.
    let value: unknown = d
    if (d && typeof d === 'object' && 'value' in (d as Record<string, unknown>)) {
      value = (d as Record<string, unknown>).value
    }
    entries.push(`${perlSingleQuote(name)} => ${toPerlLiteral(value)}`)
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
 * Build a Perl hash literal from props (+ signal / memo seeds).
 */
function buildPerlProps(
  _componentName: string,
  props: Record<string, unknown> | undefined,
  ir: ComponentIR,
): string {
  const entries: string[] = []

  const explicitScope = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'
  entries.push(`scope_id => '${escapePerlSingleQuoted(explicitScope)}'`)

  // Prop params with defaults (before signals, so signals can reference them).
  for (const param of ir.metadata.propsParams) {
    if (props && param.name in props) continue
    if (param.defaultValue) {
      const result = tryEvaluateSignalInit(param.defaultValue.trim(), props)
      if (result.ok) {
        entries.push(`${param.name} => ${toPerlLiteral(result.value)}`)
        continue
      }
    }
    // No default + no caller value: pass `undef` so Kolon's var lookup
    // for an optional prop doesn't fault before its falsy branch elides.
    entries.push(`${param.name} => undef`)
  }

  // Route undeclared props into the rest bag (`spread_attrs($<rest>)`).
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
    entries.push(`${restPropsName} => ${toPerlLiteral(Object.fromEntries(restBagEntries))}`)
  }

  // User props.
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('__')) continue
      if (routedKeys.has(key)) continue
      if (typeof value === 'string') {
        entries.push(`${key} => '${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
      } else if (typeof value === 'number') {
        entries.push(`${key} => ${value}`)
      } else if (typeof value === 'boolean') {
        // JSON::PP boolean sentinels so BarefootJS::spread_attrs can
        // detect them via `ref() eq 'JSON::PP::Boolean'`.
        entries.push(`${key} => ${value ? 'JSON::PP::true' : 'JSON::PP::false'}`)
      } else if (Array.isArray(value) || (value && typeof value === 'object')) {
        entries.push(`${key} => ${toPerlLiteral(value)}`)
      }
    }
  }

  // Signal values evaluated from props (after user props).
  for (const signal of ir.metadata.signals) {
    // Env signals (#2057) are bound below via `search_params('')`, not from a
    // static initial value.
    if (signal.envReader) continue
    const value = evaluateSignalInit(signal.initialValue.trim(), props)
    if (value !== null) {
      entries.push(`${signal.getter} => ${toPerlLiteral(value)}`)
    }
  }

  // Memo values seeded from the statically-evaluated ssrDefaults, same
  // as the production plugin's before_render hook.
  const ssrDefaults = extractSsrDefaults(ir.metadata) ?? {}
  for (const memo of ir.metadata.memos) {
    const entry = ssrDefaults[memo.name]
    const value = entry && typeof entry === 'object' && 'value' in entry ? entry.value : 0
    entries.push(`${memo.name} => ${toPerlLiteral(value ?? 0)}`)
  }

  // (#1922) Request-scoped `searchParams()`: bind `$searchParams` to an
  // empty-query reader via the lazy-loading factory (so the render script
  // needn't `use BarefootJS::SearchParams`). The conformance harness issues no
  // query string (the production Xslate integration builds this from the
  // request's query), so `.get(k)` resolves to nil and the author's
  // `?? default` renders. Only when the component imports `searchParams`.
  if (importsSearchParams(ir.metadata)) {
    entries.push(`searchParams => BarefootJS->search_params('')`)
  }

  return `{${entries.join(', ')}}`
}


/** Perl single-quoted string escape: `'` AND `\` need escaping. */
function perlSingleQuote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function toPerlLiteral(value: unknown): string {
  if (typeof value === 'string') return perlSingleQuote(value)
  if (typeof value === 'number') return String(value)
  // JS booleans → JSON::PP sentinels so `spread_attrs` can detect them
  // via `ref()` and apply boolean-attr semantics.
  if (typeof value === 'boolean') return value ? 'JSON::PP::true' : 'JSON::PP::false'
  if (Array.isArray(value)) {
    return `[${value.map(toPerlLiteral).join(', ')}]`
  }
  if (value && typeof value === 'object') {
    const entries: string[] = []
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      entries.push(`${perlSingleQuote(key)} => ${toPerlLiteral(v)}`)
    }
    return `{${entries.join(', ')}}`
  }
  return 'undef'
}

