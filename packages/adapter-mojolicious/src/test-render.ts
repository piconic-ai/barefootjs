/**
 * Mojolicious EP template test renderer
 *
 * Compiles JSX source with MojoAdapter and renders to HTML via `perl`.
 * Used by adapter-tests conformance runner.
 */

import { compileJSX, extractSsrDefaults, augmentInheritedPropAccesses, importsSearchParams } from '@barefootjs/jsx'
import type { ComponentIR } from '@barefootjs/jsx'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const RENDER_TEMP_DIR = resolve(import.meta.dir, '../.render-temp')
// Mojo-specific lib (BarefootJS::Backend::Mojo + the plugin) lives in this
// package; the engine-agnostic core (BarefootJS.pm) moved to @barefootjs/perl.
// Both dirs must be on the render script's @INC so `use BarefootJS` and
// `use BarefootJS::Backend::Mojo` resolve.
const LIB_DIR = resolve(import.meta.dir, '../lib')
const PERL_CORE_LIB_DIR = resolve(import.meta.dir, '../../adapter-perl/lib')

export class PerlNotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PerlNotAvailableError'
  }
}

/**
 * Recover the bare component name from a compiler-emitted template
 * file path. `templatesPerComponent` adapters write each component to
 * `<dir>/<ComponentName><adapter.extension>` (Mojo: `.html.ep`), and
 * downstream pairing logic needs the raw component name back so it can
 * look up the matching IR in `irsByName`.
 *
 * Stripping the *full* adapter extension matters because Mojo's
 * extension is multi-segment (`.html.ep`). A naive `\.[^.]+$/` strips
 * only the last segment, leaves `<ComponentName>.html`, misses the
 * IR map, and silently pairs every sibling template to the
 * entry-point IR — exactly the silent-gap class issue #1297 was
 * filed to surface.
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
 * metacharacters: `\\` and `\'`. Newlines, tabs, and everything else
 * pass through literally.
 *
 * Used when interpolating a user-supplied / harness-derived
 * `__instanceId` into the generated Perl render script — current
 * call sites always pass `<ComponentName>_test`, but defensive
 * escaping avoids a future fixture that injects a quote silently
 * corrupting the generated script.
 */
function escapePerlSingleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

let _perlAvailable: boolean | null = null
async function isPerlAvailable(): Promise<boolean> {
  if (_perlAvailable !== null) return _perlAvailable
  try {
    const proc = Bun.spawn(['perl', '-MMojolicious', '-e', 'print $Mojolicious::VERSION'], {
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

export async function renderMojoComponent(options: RenderOptions): Promise<string> {
  const { source, adapter, props, components, componentName: requestedName } = options

  // Compile child components first
  const childTemplates: Map<string, { template: string; ir: ComponentIR }> = new Map()
  if (components) {
    for (const [filename, childSource] of Object.entries(components)) {
      const childResult = compileJSX(childSource, filename, { adapter, outputIR: true })
      const childErrors = childResult.errors.filter(e => e.severity === 'error')
      if (childErrors.length > 0) {
        throw new Error(`Compilation errors in ${filename}:\n${childErrors.map(e => e.message).join('\n')}`)
      }
      const childTemplateFiles = childResult.files.filter(f => f.type === 'markedTemplate')
      if (childTemplateFiles.length === 0) throw new Error(`No marked template for ${filename}`)
      const childIrFiles = childResult.files.filter(f => f.type === 'ir')
      if (childIrFiles.length === 0) throw new Error(`No IR output for ${filename}`)
      const childIrs = childIrFiles.map(f => JSON.parse(f.content) as ComponentIR)
      if (childTemplateFiles.length === 1) {
        // Single-component child source: only one template + one IR.
        childTemplates.set(childIrs[0].metadata.componentName, { template: childTemplateFiles[0].content, ir: childIrs[0] })
      } else {
        // Multi-component child source: pair template ↔ IR by basename.
        // The Mojo adapter's `templatesPerComponent` emits files named
        // `<ComponentName><adapter.extension>` (e.g. `Counter.html.ep`),
        // so we strip the *full* `.html.ep` — not just the last dot
        // segment — to recover the componentName. A naive `\.[^.]+$/`
        // would leave `Counter.html`, miss the IR map, and silently
        // pair every sibling to the entry-point IR.
        const childIrsByName = new Map(childIrs.map(i => [i.metadata.componentName, i]))
        for (const tf of childTemplateFiles) {
          const baseName = templateBaseName(tf.path, adapter.extension)
          const matchedIR = childIrsByName.get(baseName) ?? childIrs[0]
          childTemplates.set(matchedIR.metadata.componentName, { template: tf.content, ir: matchedIR })
        }
      }
    }
  }

  // Compile parent source
  const result = compileJSX(source, 'component.tsx', { adapter, outputIR: true })

  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors:\n${errors.map(e => e.message).join('\n')}`)
  }

  // Collect every IR + template emitted from the parent source. Single-
  // component files yield one `markedTemplate` named after the source
  // file (e.g. `component.html.ep`); multi-component files with
  // `templatesPerComponent` yield one named after each component (e.g.
  // `Counter.html.ep`). Multi-component sources also emit one IR per
  // component (#1297) — pick the entry-point IR (default export wins;
  // else first inline-exported; else first) and route sibling
  // components through `childTemplates` so cross-component references
  // resolve at render time.
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
    // Single-component source: the one template file is the entry-point
    // template regardless of its basename (which comes from the source
    // filename, not the component name).
    templateFile = templateFiles[0]
  } else {
    // Multi-component source: templates are named by component
    // (templatesPerComponent). Match each template file to its IR by
    // basename so we can split the entry-point from siblings. See
    // `templateBaseName` for why the full `adapter.extension` is
    // stripped rather than the last dot segment alone.
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

  const componentName = ir.metadata.componentName

  // Build temp directory
  const tempDir = resolve(
    RENDER_TEMP_DIR,
    `mojo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tempDir, { recursive: true })

  try {
    // Write template files (parent + children)
    // In real Mojolicious, bf is a helper (no $ prefix).
    // For Mojo::Template standalone, convert bf-> to $bf-> so it resolves as a variable.
    const patchTemplate = (content: string) => content.replace(/\bbf->/g, '$bf->')
    await Bun.write(resolve(tempDir, `${toSnakeCase(componentName)}.html.ep`), patchTemplate(templateFile.content))
    for (const [childName, { template }] of childTemplates) {
      await Bun.write(resolve(tempDir, `${toSnakeCase(childName)}.html.ep`), patchTemplate(template))
    }

    // Build props hash for Perl
    const propsPerl = buildPerlProps(componentName, props, ir)

    // Honour `__instanceId` from props for the root scope id so
    // shared-component fixtures (which pin `<ComponentName>_test`) match
    // cross-adapter; default to 'test' otherwise. Escape for Perl
    // single-quoted embedding — `\` and `'` are the only metacharacters
    // inside `q{}` / `'…'`.
    const rootScopeIdRaw = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'
    const rootScopeId = escapePerlSingleQuoted(rootScopeIdRaw)

    // Build child template rendering functions for Perl
    const childRenderers = buildChildRenderers(childTemplates, ir, tempDir)

    // Write render script
    const renderScript = `#!/usr/bin/env perl
use strict;
use warnings;
use utf8;

use lib '${LIB_DIR}', '${PERL_CORE_LIB_DIR}';
use Mojolicious;
use Mojo::Template;
# Boolean values in spread bags arrive as Mojo::JSON::true /
# Mojo::JSON::false from the JS-side toPerlLiteral so
# BarefootJS::spread_attrs can detect them via ref() and apply
# boolean-attr semantics (#1407 follow-up, #1413 review).
use Mojo::JSON;

use BarefootJS;

my $app = Mojolicious->new;

# Read template
open my $fh, '<:utf8', '${resolve(tempDir, `${toSnakeCase(componentName)}.html.ep`)}' or die "Cannot open template: $!";
my $template_content = do { local $/; <$fh> };
close $fh;

# Set up props
my $props = ${propsPerl};

# Create BarefootJS instance with mock controller
my $c = $app->build_controller;
my $bf = BarefootJS->new($c, {});
# Honour an explicit __instanceId from props so shared-component fixtures
# (which pin <ComponentName>_test scope ids for cross-adapter normalisation)
# match what Hono renderHonoComponent emits. Default to 'test' otherwise.
$bf->_scope_id('${rootScopeId}');

${childRenderers}

# Render template inline
my $mt = Mojo::Template->new(vars => 1, auto_escape => 1);
my $output = $mt->render($template_content, {
    %$props,
    bf => $bf,
});

if (ref $output) {
    # Mojo::Template returns Mojo::Exception on error
    die $output->to_string;
}

print $output;
`
    await Bun.write(resolve(tempDir, 'render.pl'), renderScript)

    // Check if Perl + Mojolicious is available
    if (!await isPerlAvailable()) {
      throw new PerlNotAvailableError('perl with Mojolicious not found — skipping Mojo rendering')
    }

    // Run render script
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
 * Build Perl code that replaces `%= include 'child_name', ...` with inline template rendering.
 * Each child component becomes a Perl sub that renders its template with Mojo::Template.
 */
function buildChildRenderers(
  childTemplates: Map<string, { template: string; ir: ComponentIR }>,
  _parentIR: ComponentIR,
  tempDir: string,
): string {
  if (childTemplates.size === 0) return ''

  const lines: string[] = []
  lines.push(`# Register child component renderers`)

  for (const [componentName, { ir: childIR }] of childTemplates) {
    const snakeName = toSnakeCase(componentName)
    const childTemplatePath = resolve(tempDir, `${snakeName}.html.ep`)

    lines.push(`{`)
    lines.push(`  open my $child_fh, '<:utf8', '${childTemplatePath}' or die "Cannot open child template: $!";`)
    lines.push(`  my $child_tmpl = do { local $/; <$child_fh> };`)
    lines.push(`  close $child_fh;`)
    lines.push(`  my $child_mt = Mojo::Template->new(vars => 1, auto_escape => 1);`)

    lines.push(`  my $defaults_${snakeName} = ${buildChildDefaultsPerl(childIR)};`)
    lines.push(`  $bf->register_child_renderer('${snakeName}', sub {`)
    // `$caller_bf` is the instance whose template invoked render_child
    // (#1897) — nested children chain their scope identity off it.
    lines.push(`    my ($child_props, $caller_bf) = @_;`)
    lines.push(`    my $host_scope = (defined $caller_bf ? $caller_bf->_scope_id : $bf->_scope_id);`)
    // (#1652) A child that destructures a rest-spread bag
    // (`function NativeSelect({ children, ...props })`) emits a
    // template referencing `$<restPropsName>`
    // (`<%== bf->spread_attrs($props) %>`). The parent's render_child
    // call only forwards the props it explicitly passed (here just
    // `children`), so the rest bag never reaches the child stash and
    // Perl strict mode aborts with `Global symbol "$props" requires
    // explicit package name`. Seed it with an empty hashref when the
    // caller didn't supply one — mirroring the top-level harness path
    // (`buildPerlProps`) and the production runtime's
    // `_derive_stash_from_defaults` `isRestProps` branch, which plumbs
    // the equivalent of Go's `Spread_0`/`Extras` Input field.
    if (childIR.metadata.restPropsName) {
      const rest = childIR.metadata.restPropsName
      lines.push(`    $child_props->{${rest}} = {} unless defined $child_props->{${rest}};`)
      // (#1897) Route non-param props into the rest bag (JSX rest
      // semantics): a caller prop the child didn't destructure belongs
      // in the bag, not as a top-level stash var. Mirrors the Xslate
      // harness and the production isRestProps branch.
      const paramNames = (childIR.metadata.propsParams ?? []).map(p => p.name)
      const keepList = [...new Set([...paramNames, rest, 'children', 'key', '_bf_slot'])]
        .map(n => `'${n.replace(/[\\']/g, m => `\\${m}`)}'`)
        .join(', ')
      lines.push(`    {`)
      lines.push(`      my %keep = map { $_ => 1 } (${keepList});`)
      lines.push(`      for my $k (grep { !$keep{$_} } keys %$child_props) {`)
      lines.push(`        $child_props->{${rest}}{$k} = delete $child_props->{$k};`)
      lines.push(`      }`)
      lines.push(`    }`)
    }
    lines.push(`    my $child_bf = BarefootJS->new($c, {});`)
    // (#1897) Nested `render_child` calls (a child template rendering
    // another imported component) resolve against THIS instance's
    // registry — share the parent's so they don't fail.
    lines.push(`    $child_bf->_child_renderers($bf->_child_renderers);`)
    // JSX `key` (reserved prop) → data-key on the child's scope root, for
    // keyed-loop reconciliation parity with Hono.
    lines.push(`    my $data_key = delete $child_props->{key};`)
    lines.push(`    $child_bf->_data_key($data_key) if defined $data_key;`)
    // Scope id: a slotted child (`_bf_slot` passed) derives from the PARENT's
    // live scope id (`<Parent_test>_s5`); a loop child (no slot) gets a fresh
    // `<ComponentName>_<rand>` id per iteration, matching Hono — the
    // PascalCase component name is what `normalizeHTML` canonicalises to
    // `<ComponentName>_*`.
    lines.push(`    my $slot = delete $child_props->{_bf_slot};`)
    lines.push(`    if (defined $slot) {`)
    lines.push(`      $child_bf->_scope_id($host_scope . "_$slot");`)
    lines.push(`    } else {`)
    lines.push(`      $child_bf->_scope_id('${componentName}_' . substr(rand() =~ s/^0\\.//r, 0, 6));`)
    lines.push(`    }`)
    // Seed statically-derived defaults under the caller's props (#1897)
    // so undeclared optional props / signals don't abort strict vars.
    lines.push(`    my $rendered = $child_mt->render($child_tmpl, { %$defaults_${snakeName}, %$child_props, bf => $child_bf });`)
    lines.push(`    die $rendered->to_string if ref $rendered;`)
    lines.push(`    chomp $rendered;`)
    lines.push(`    return $rendered;`)
    lines.push(`  });`)
    lines.push(`}`)
    lines.push(``)
  }

  return lines.join('\n')
}

/**
 * Convert PascalCase to snake_case for Mojo template naming.
 */
function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
}

/**
 * Build a Perl hash literal from props.
 */
/**
 * Statically-derived default template vars for a CHILD component
 * (#1897): every declared prop (its JSX default or `undef`), inherited
 * `props.<x>` accesses, signal initial values, and memo ssrDefaults.
 * Without these, a child template referencing an optional prop the
 * caller didn't pass (`$id`, `$className`) or its own signal (`$open`)
 * aborts under Mojo::Template's strict vars. Caller-passed props win at
 * merge time (`{ %$defaults, %$child_props }`). Mirrors the root-side
 * seeding in `buildPerlProps` and the production plugin's
 * `ssrDefaults` consumption.
 */
function buildChildDefaultsPerl(ir: ComponentIR): string {
  // Surface inherited `props.<x>` reads hidden inside template-literal
  // attr parts / conditional branches as propsParams (idempotent; the
  // same shared pass the adapters apply — without it TabsContent's
  // `${props.className ?? ''}` class read never seeds `$className`).
  augmentInheritedPropAccesses(ir)
  const entries: string[] = []
  const declared = new Set<string>()
  for (const param of ir.metadata.propsParams) {
    declared.add(param.name)
    if (param.defaultValue) {
      const perlValue = jsToPerlValue(param.defaultValue)
      if (perlValue !== null) {
        entries.push(`${param.name} => ${perlValue}`)
        continue
      }
    }
    entries.push(`${param.name} => undef`)
  }
  if (ir.metadata.propsObjectName) {
    for (const name of collectPropsObjectAccesses(ir, ir.metadata.propsObjectName)) {
      if (declared.has(name)) continue
      declared.add(name)
      entries.push(`${name} => undef`)
    }
  }
  for (const signal of ir.metadata.signals) {
    const value = evaluateSignalInit(signal.initialValue.trim(), undefined)
    entries.push(`${signal.getter} => ${value !== null ? toPerlLiteral(value) : 'undef'}`)
  }
  const ssrDefaults = extractSsrDefaults(ir.metadata) ?? {}
  for (const memo of ir.metadata.memos) {
    const entry = ssrDefaults[memo.name]
    const value =
      entry && typeof entry === 'object' && 'value' in entry ? entry.value : undefined
    entries.push(
      `${memo.name} => ${value !== undefined && value !== null ? toPerlLiteral(value) : 'undef'}`,
    )
  }
  return `{${entries.join(', ')}}`
}

function buildPerlProps(
  _componentName: string,
  props: Record<string, unknown> | undefined,
  ir: ComponentIR,
): string {
  const entries: string[] = []

  // Add scope_id — honour an explicit `__instanceId` from props so
  // shared-component fixtures (which pin a `<ComponentName>_test` scope
  // id) match cross-adapter; default to 'test' for the rest of the
  // corpus. Escape for Perl single-quoted embedding.
  const explicitScope = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'
  entries.push(`scope_id => '${escapePerlSingleQuoted(explicitScope)}'`)

  // Add props params with defaults (before signals, so signals can reference them)
  for (const param of ir.metadata.propsParams) {
    if (props && param.name in props) continue
    if (param.defaultValue) {
      const perlValue = jsToPerlValue(param.defaultValue)
      if (perlValue !== null) {
        entries.push(`${param.name} => ${perlValue}`)
        continue
      }
    }
    // No default and no caller-supplied value: pass `undef` so the
    // Mojo::Template `vars => 1` auto-declaration fires. Without
    // this, references to an optional prop variable (`$label`,
    // `$on`) trip Perl's strict-mode "Global symbol requires
    // explicit package name" error before the template gets a
    // chance to skip the falsy branch — the same failure mode the
    // restPropsName carve-out below was added for (#1407 follow-up).
    // Surfaces with #1443: lowering `[a, b].filter(Boolean).join(' ')`
    // emits a literal `$label` reference where the BF101 path used
    // to emit `''`, exposing this latent test-harness gap.
    entries.push(`${param.name} => undef`)
  }

  // (#checkbox) SolidJS props-object pattern: `function Checkbox(props:
  // CheckboxProps)` only enumerates `CheckboxProps`'s own members in
  // `propsParams`; inherited `ButtonHTMLAttributes` members the component
  // reads as bare template vars (`$id`, `$disabled`, `$className`) are not.
  // The generated template references them, so the stash must declare them or
  // Perl strict mode aborts with `Global symbol "$id" requires explicit
  // package name`. Scan the IR for `props.<name>` accesses and seed any not
  // already declared (and not supplied by the caller below) as `undef`.
  // Mirrors the Go adapter's `augmentInheritedPropAccesses`.
  if (ir.metadata.propsObjectName) {
    const propsObj = ir.metadata.propsObjectName
    const declared = new Set(ir.metadata.propsParams.map(p => p.name))
    for (const name of collectPropsObjectAccesses(ir, propsObj)) {
      if (declared.has(name)) continue
      if (props && name in props) continue // emitted by the user-props loop
      entries.push(`${name} => undef`)
      declared.add(name)
    }
  }

  // A `{...props}` rest spread means props that aren't declared named
  // params flow through the rest bag (`bf->spread_attrs($<restPropsName>)`),
  // not their own top-level template var. Route them into the bag hashref so
  // a fixture passing e.g. `placeholder` to `Input` (whose declared params
  // are `className` / `type`) renders `placeholder="..."` via the spread
  // rather than silently dropping it into an unused `my $placeholder`. (#1467
  // Phase 2b — mirrors the Go harness fix in the sibling `test-render.ts`.)
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

  // (#1407 follow-up) Default the rest-binding identifier to an
  // empty hashref so `bf->spread_attrs($extras)` in the generated
  // Mojo template doesn't trip Perl's strict-mode "Global symbol
  // requires explicit package name" check when the caller doesn't
  // supply a bag value (the destructured-rest fixture exercises
  // the COMPILE path on Go, where the bag plumbing matters; the
  // runtime is a no-op when the caller leaves the bag unset, which
  // mirrors the empty-spread case on every adapter).
  // When the fixture supplied undeclared props, seed the bag with those
  // routed entries instead of an empty hashref.
  if (restPropsName && !(props && restPropsName in props)) {
    entries.push(`${restPropsName} => ${toPerlLiteral(Object.fromEntries(restBagEntries))}`)
  }

  // Add user props
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (routedKeys.has(key)) continue
      if (typeof value === 'string') {
        entries.push(`${key} => '${value.replace(/'/g, "\\'")}'`)
      } else if (typeof value === 'number') {
        entries.push(`${key} => ${value}`)
      } else if (typeof value === 'boolean') {
        // Mojo::JSON sentinels so BarefootJS helpers can detect
        // booleans via ref() (see toPerlLiteral / spread_attrs).
        entries.push(`${key} => ${value ? 'Mojo::JSON::true' : 'Mojo::JSON::false'}`)
      } else if (Array.isArray(value)) {
        // Array → Perl arrayref literal. Fixtures that exercise
        // array-receiver methods (`items.every(...)`, `items.some(...)`,
        // `items.join(' - ')`, etc. — #1448 method catalog) need the
        // prop value to reach the template as a real arrayref so the
        // generated `@{$items}` / `$items->[$i]` references resolve.
        // Without this branch, `Mojo::Template`'s `vars => 1` never
        // declares `my $items` (the key is absent from the vars
        // hash) and the template trips Perl's strict-mode "Global
        // symbol $items requires explicit package name" check.
        entries.push(`${key} => ${toPerlLiteral(value)}`)
      } else if (value && typeof value === 'object') {
        // Plain object → Perl hashref literal (#1407 follow-up).
        // Used by the destructured-rest / propsObject fixtures
        // (`jsx-spread-rest-prop`, `jsx-spread-props-object`) so
        // the test harness can pass through bag-shaped props that
        // weren't enumerated by the analyzer.
        entries.push(`${key} => ${toPerlLiteral(value)}`)
      }
    }
  }

  // Add signal values evaluated from props (must come after user props).
  // Seed `undef` for a null / unevaluable initial (e.g. a
  // `createSignal<SortKey>(null)` whose getter is read in a child-prop
  // ternary) rather than skipping it — an unseeded getter faults strict
  // vars with `Global symbol "$x" requires explicit package name`. Same
  // rule `buildChildDefaultsPerl` applies to child signals (#1897).
  for (const signal of ir.metadata.signals) {
    const value = evaluateSignalInit(signal.initialValue.trim(), props)
    entries.push(`${signal.getter} => ${value !== null ? toPerlLiteral(value) : 'undef'}`)
  }

  // Add memo values. The production Mojo plugin seeds these from the
  // manifest's `ssrDefaults` (see Plugin/BarefootJS.pm `before_render`
  // hook), which carries the statically-evaluated result of each memo
  // computation. Mirror that here so the test harness doesn't diverge
  // from the plugin: hard-coding `0` masked memos with non-zero
  // initial values until #1423 added a fixture that exposed the gap.
  const ssrDefaults = extractSsrDefaults(ir.metadata) ?? {}
  for (const memo of ir.metadata.memos) {
    const entry = ssrDefaults[memo.name]
    const value = entry && typeof entry === 'object' && 'value' in entry ? entry.value : 0
    entries.push(`${memo.name} => ${toPerlLiteral(value ?? 0)}`)
  }

  // (#1922) Request-scoped `searchParams()`: bind `$searchParams` to an
  // empty-query reader via the lazy-loading factory (so the render script
  // needn't `use BarefootJS::SearchParams`). The conformance harness issues no
  // query string (the production Mojo plugin builds this from
  // `$c->req->query_params`), so `.get(k)` resolves to undef and the author's
  // `?? default` renders. Only when the component imports `searchParams`.
  if (importsSearchParams(ir.metadata)) {
    entries.push(`searchParams => BarefootJS->search_params('')`)
  }

  return `{${entries.join(', ')}}`
}

/**
 * (#checkbox) Collect `<propsObj>.<name>` accesses across a component's memos,
 * signal initializers, init statements, and template attribute expressions —
 * the inherited-attribute reads (`props.className`, `props.id`, `props.disabled`)
 * a SolidJS props-object component makes but that aren't enumerated in
 * `propsParams`. Used to declare matching stash variables.
 */
function collectPropsObjectAccesses(ir: ComponentIR, propsObj: string): Set<string> {
  const out = new Set<string>()
  const re = new RegExp(`(?:^|[^\\w$.])${propsObj}\\.([A-Za-z_$][\\w$]*)`, 'g')
  const scan = (s: string | undefined): void => {
    if (!s) return
    for (const m of s.matchAll(re)) out.add(m[1])
  }
  for (const memo of ir.metadata.memos) scan(memo.computation)
  for (const sig of ir.metadata.signals) scan(sig.initialValue)
  for (const stmt of ir.metadata.initStatements ?? []) scan(stmt.body)
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const el = node as { attrs?: Array<{ value?: { kind?: string; expr?: string } }>; children?: unknown[] }
    for (const attr of el.attrs ?? []) {
      if (attr.value?.kind === 'expression') scan(attr.value.expr)
    }
    for (const child of el.children ?? []) {
      const c = child as { element?: unknown }
      walk(c.element ?? child)
    }
  }
  walk(ir.root)
  return out
}

/**
 * Evaluate a signal initializer expression using provided props.
 * Handles patterns like: props.initial ?? 0, props.value, literal values.
 */
export function evaluateSignalInit(
  expr: string,
  props?: Record<string, unknown>,
): unknown {
  // props.xxx ?? default
  const nullishMatch = expr.match(/^props\.(\w+)\s*\?\?\s*(.+)$/)
  if (nullishMatch) {
    const propName = nullishMatch[1]
    const defaultExpr = nullishMatch[2].trim()
    if (props && propName in props) {
      return props[propName]
    }
    return parseLiteral(defaultExpr)
  }

  // props.xxx (no default)
  const propsMatch = expr.match(/^props\.(\w+)$/)
  if (propsMatch) {
    if (props && propsMatch[1] in props) {
      return props[propsMatch[1]]
    }
    return null
  }

  // Literal value
  return parseLiteral(expr)
}

function parseLiteral(expr: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr)
  if (expr === 'true') return true
  if (expr === 'false') return false
  if (expr === '[]') return []

  // Non-empty array literal (`[{ id: 'a' }, { id: 'b' }]`, `['x', 'y']`).
  // Each element is parsed recursively; if any element can't be parsed
  // (identifier, call, member access, …) the whole array bails to null so
  // the harness falls back to its `undef` behaviour. Mirrors the object-
  // literal branch below. Needed so signal initial values that are inline
  // object/scalar arrays seed the Mojo SSR stash (e.g. the whole-item loop
  // conditional fixture, whose `items` is `[{ id: 'a' }, …]`).
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
  // String literal — require matching opener/closer (the previous
  // regex `^['"]…['"]$` accepted mixed quotes like `'foo"`) and
  // unescape JS-style escape sequences so `'a\\'b'` round-trips as
  // `a\'b` instead of leaking the source-level escapes into the
  // Perl literal (#1413 review).
  const stringMatch = expr.match(/^(['"])(.*)\1$/s)
  if (stringMatch) return unescapeJsString(stringMatch[2])
  // JS object literal (#1407 follow-up): `{ id: 'a', class: 'on' }`.
  // Used for spread-bag signal initial values in the `jsx-spread-*`
  // fixture family. Keys may be bare identifiers or string
  // literals; values are scalars (string / number / boolean /
  // null) or nested object literals via recursive `parseLiteral`.
  // Non-empty array values (`[1, 2]`) are NOT supported — only
  // the `[]` empty-array literal recognised by the early-return
  // above lowers. Trailing commas (`{ id: 'a', }`) are accepted
  // by skipping empty segments (#1413 review). Anything the
  // recursive call can't handle (identifiers, function calls,
  // member access, non-empty arrays) surfaces as null and bubbles
  // up so the harness falls back to its existing `undef`
  // behaviour.
  const trimmed = expr.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return {}
    const obj: Record<string, unknown> = {}
    const pairs = splitTopLevelCommas(inner)
    for (const pair of pairs) {
      // Skip empty segments — typically a trailing comma's tail
      // (#1413 review).
      if (!pair.trim()) continue
      const colonIdx = pair.indexOf(':')
      if (colonIdx < 0) return null
      let key = pair.slice(0, colonIdx).trim()
      const val = pair.slice(colonIdx + 1).trim()
      // Strip key quotes if any — require matching open/close
      // quote and unescape, same shape as the value-side string
      // literal handling above (#1413 review).
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

/**
 * Split a comma-separated literal body (object-pair list or array element
 * list) on top-level commas only — commas nested inside braces, brackets, or
 * string literals don't split. Backslash-escaped quotes inside strings are
 * honoured (an odd run of backslashes before a quote keeps the string open).
 * Shared by the object- and array-literal branches of {@link parseLiteral}.
 */
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

/**
 * Unescape a JS string-literal body (the content between the
 * matching opening and closing quotes, not the quotes themselves).
 * Handles the common single-character escapes `\\`, `\'`, `\"`,
 * `\n`, `\r`, `\t`, `\0`, and the backslash-anything fallback that
 * mirrors JS's "unknown escape is the character itself" semantics.
 * Hex / unicode / octal escapes are intentionally out of scope —
 * the spread-bag fixture corpus uses ASCII identifiers and short
 * literal values, so the harness doesn't need a full JS string
 * decoder (#1413 review).
 */
function unescapeJsString(s: string): string {
  return s.replace(/\\(.)/g, (_, c) => {
    switch (c) {
      case 'n': return '\n'
      case 'r': return '\r'
      case 't': return '\t'
      case '0': return '\0'
      // `\\`, `\'`, `\"`, and any other single-character escape
      // collapse to the literal character (matches JS semantics
      // for unrecognised escapes).
      default: return c
    }
  })
}

/**
 * Perl single-quoted string escape: `'` AND `\` need escaping.
 * Perl single quotes treat a trailing backslash as escaping the
 * closing quote (`'foo\'` is invalid), so values ending in `\`
 * must double the backslash (#1413 review).
 */
function perlSingleQuote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function toPerlLiteral(value: unknown): string {
  if (typeof value === 'string') return perlSingleQuote(value)
  if (typeof value === 'number') return String(value)
  // JS booleans → Mojo::JSON sentinel objects so `BarefootJS::spread_attrs`
  // can detect them via `ref()` and apply boolean-attr semantics
  // (true → bare attribute, false → omitted). Emitting plain Perl
  // 0/1 would conflate genuine numeric values with booleans and
  // turn `disabled: false` into `disabled="0"` (#1413 review).
  if (typeof value === 'boolean') return value ? 'Mojo::JSON::true' : 'Mojo::JSON::false'
  // Array → Perl arrayref literal, recursing so element types are
  // serialised correctly. Previously this returned the literal `[]`
  // — fine when the only caller was the spread-bag initial-value
  // path (which never carried array shapes), but loses the contents
  // for #1448's method fixtures where `items: ['a', 'b', 'c']`
  // needs to reach the template as `['a', 'b', 'c']`, not an empty
  // arrayref.
  if (Array.isArray(value)) {
    return `[${value.map(toPerlLiteral).join(', ')}]`
  }
  // Plain object → Perl hashref literal. Used by the spread-bag
  // signal initial values (#1407 follow-up). Keys are quoted as
  // Perl strings (escaped via `perlSingleQuote` so values
  // containing `\` or `'` round-trip safely); values recurse so
  // nested-but-simple shapes still work.
  if (value && typeof value === 'object') {
    const entries: string[] = []
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      entries.push(`${perlSingleQuote(key)} => ${toPerlLiteral(v)}`)
    }
    return `{${entries.join(', ')}}`
  }
  return 'undef'
}

/**
 * Convert a JS literal value to a Perl literal.
 * Handles: numbers, strings, booleans, empty arrays, props.xxx ?? default patterns.
 */
function jsToPerlValue(jsValue: string): string | null {
  const v = jsValue.trim()

  // Number
  if (/^-?\d+(\.\d+)?$/.test(v)) return v

  // String literal
  if (/^['"].*['"]$/.test(v)) return v

  // Boolean
  if (v === 'true') return '1'
  if (v === 'false') return '0'

  // Empty array
  if (v === '[]') return '[]'

  // props.xxx ?? default — extract the default value
  const nullishMatch = v.match(/\?\?\s*(.+)$/)
  if (nullishMatch) {
    return jsToPerlValue(nullishMatch[1])
  }

  // props.xxx (no default) — return undef
  if (v.startsWith('props.')) return 'undef'

  return null
}
