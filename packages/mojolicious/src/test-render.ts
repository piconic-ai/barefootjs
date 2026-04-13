/**
 * Mojolicious EP template test renderer
 *
 * Compiles JSX source with MojoAdapter and renders to HTML via `perl`.
 * Used by adapter-tests conformance runner.
 */

import { compileJSXSync } from '@barefootjs/jsx'
import type { ComponentIR } from '@barefootjs/jsx'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const RENDER_TEMP_DIR = resolve(import.meta.dir, '../.render-temp')
const LIB_DIR = resolve(import.meta.dir, '../lib')

export class PerlNotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PerlNotAvailableError'
  }
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
}

export async function renderMojoComponent(options: RenderOptions): Promise<string> {
  const { source, adapter, props, components } = options

  // Compile child components first
  const childTemplates: Map<string, { template: string; ir: ComponentIR }> = new Map()
  if (components) {
    for (const [filename, childSource] of Object.entries(components)) {
      const childResult = compileJSXSync(childSource, filename, { adapter, outputIR: true })
      const childErrors = childResult.errors.filter(e => e.severity === 'error')
      if (childErrors.length > 0) {
        throw new Error(`Compilation errors in ${filename}:\n${childErrors.map(e => e.message).join('\n')}`)
      }
      const childTemplate = childResult.files.find(f => f.type === 'markedTemplate')
      if (!childTemplate) throw new Error(`No marked template for ${filename}`)
      const childIrFile = childResult.files.find(f => f.type === 'ir')
      if (!childIrFile) throw new Error(`No IR output for ${filename}`)
      const childIR = JSON.parse(childIrFile.content) as ComponentIR
      childTemplates.set(childIR.metadata.componentName, { template: childTemplate.content, ir: childIR })
    }
  }

  // Compile parent source
  const result = compileJSXSync(source, 'component.tsx', { adapter, outputIR: true })

  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors:\n${errors.map(e => e.message).join('\n')}`)
  }

  const templateFile = result.files.find(f => f.type === 'markedTemplate')
  if (!templateFile) throw new Error('No marked template in compile output')

  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output (set outputIR: true)')
  const ir = JSON.parse(irFile.content) as ComponentIR

  const componentName = ir.metadata.componentName

  // Build temp directory
  const tempDir = resolve(
    RENDER_TEMP_DIR,
    `mojo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tempDir, { recursive: true })

  try {
    // Write template files (parent + children)
    await Bun.write(resolve(tempDir, `${toSnakeCase(componentName)}.html.ep`), templateFile.content)
    for (const [childName, { template }] of childTemplates) {
      await Bun.write(resolve(tempDir, `${toSnakeCase(childName)}.html.ep`), template)
    }

    // Build props hash for Perl
    const propsPerl = buildPerlProps(componentName, props, ir)

    // Build child template rendering functions for Perl
    const childRenderers = buildChildRenderers(childTemplates, ir, tempDir)

    // Write render script
    const renderScript = `#!/usr/bin/env perl
use strict;
use warnings;
use utf8;

use lib '${LIB_DIR}';
use Mojolicious;
use Mojo::Template;

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
$bf->_scope_id('test');

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
  parentIR: ComponentIR,
  tempDir: string,
): string {
  if (childTemplates.size === 0) return ''

  const lines: string[] = []
  lines.push(`# Register child component renderers`)

  for (const [componentName] of childTemplates) {
    const snakeName = toSnakeCase(componentName)
    const childTemplatePath = resolve(tempDir, `${snakeName}.html.ep`)

    // Compute child scope ID from parent IR
    const childSlotIds = findChildSlotIds(parentIR, componentName)

    lines.push(`{`)
    lines.push(`  open my $child_fh, '<:utf8', '${childTemplatePath}' or die "Cannot open child template: $!";`)
    lines.push(`  my $child_tmpl = do { local $/; <$child_fh> };`)
    lines.push(`  close $child_fh;`)
    lines.push(`  my $child_mt = Mojo::Template->new(vars => 1, auto_escape => 1);`)

    // Track instance counter for multiple-instances support
    lines.push(`  my $instance_idx = 0;`)
    const slotIdsPerl = childSlotIds.length > 0
      ? `my @slot_ids = (${childSlotIds.map(id => `'${id}'`).join(', ')}); my $sid = $slot_ids[$instance_idx] // $slot_ids[-1]; $instance_idx++;`
      : `my $sid = '${snakeName}';`

    lines.push(`  $bf->register_child_renderer('${snakeName}', sub {`)
    lines.push(`    my ($child_props) = @_;`)
    lines.push(`    ${slotIdsPerl}`)
    lines.push(`    my $child_bf = BarefootJS->new($c, {});`)
    lines.push(`    $child_bf->_scope_id("test_$sid");`)
    lines.push(`    my $rendered = $child_mt->render($child_tmpl, { %$child_props, bf => $child_bf });`)
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
 * Find slot IDs assigned to a child component in the parent IR.
 */
function findChildSlotIds(parentIR: ComponentIR, childName: string): string[] {
  const ids: string[] = []
  function walk(node: import('@barefootjs/jsx').IRNode): void {
    if (node.type === 'component' && node.name === childName && node.slotId) {
      ids.push(node.slotId)
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) walk(child)
    }
    if (node.type === 'conditional') {
      walk(node.whenTrue)
      walk(node.whenFalse)
    }
  }
  walk(parentIR.root)
  return ids
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
function buildPerlProps(
  _componentName: string,
  props: Record<string, unknown> | undefined,
  ir: ComponentIR,
): string {
  const entries: string[] = []

  // Add scope_id
  entries.push("scope_id => 'test'")

  // Add props params with defaults (before signals, so signals can reference them)
  for (const param of ir.metadata.propsParams) {
    if (props && param.name in props) continue
    if (param.defaultValue) {
      const perlValue = jsToPerlValue(param.defaultValue)
      if (perlValue !== null) {
        entries.push(`${param.name} => ${perlValue}`)
      }
    }
  }

  // Add user props
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string') {
        entries.push(`${key} => '${value}'`)
      } else if (typeof value === 'number') {
        entries.push(`${key} => ${value}`)
      } else if (typeof value === 'boolean') {
        entries.push(`${key} => ${value ? 1 : 0}`)
      }
    }
  }

  // Add signal values evaluated from props (must come after user props)
  for (const signal of ir.metadata.signals) {
    const value = evaluateSignalInit(signal.initialValue.trim(), props)
    if (value !== null) {
      entries.push(`${signal.getter} => ${toPerlLiteral(value)}`)
    }
  }

  // Add memo values — simple pass-through for SSR
  for (const memo of ir.metadata.memos) {
    // Try to evaluate simple memo computations
    const computation = memo.computation.trim()
    // count() * 2 → look up count in entries
    entries.push(`${memo.name} => 0`)
  }

  return `{${entries.join(', ')}}`
}

/**
 * Evaluate a signal initializer expression using provided props.
 * Handles patterns like: props.initial ?? 0, props.value, literal values.
 */
function evaluateSignalInit(
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
  if (/^['"](.*)['"]$/.test(expr)) return expr.slice(1, -1)
  return null
}

function toPerlLiteral(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (Array.isArray(value)) return '[]'
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
