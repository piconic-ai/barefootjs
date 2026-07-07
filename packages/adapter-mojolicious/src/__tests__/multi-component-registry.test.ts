// Multi-component registry modules on the Mojo plugin path (#2132).
//
// A registry module that exports several components from one file —
// `ui/toast/index.tsx` exporting ToastProvider / Toast / ToastTitle — compiles
// to one EP template PER component, and every compiled parent invokes each one
// under its snake_cased name (`bf->render_child('toast_provider')`). The
// manifest entry used to carry only the module's FIRST template, so
// `register_components_from_manifest` registered nothing for the
// sub-components and every page using Toast / Dialog / Tabs 500'd with
// "No renderer registered for child component 'toast_provider'".
//
// This is the in-repo equivalent of the issue's repro: `bf add toast` →
// render a <Toast>-using component on mojo → expect 200 with toast markup.
// It boots a real Mojolicious app with the production plugin against
// compiler-produced templates plus a manifest in the shape `bf build` now
// emits (per-component rows under `components` — pinned on the emitter side
// by packages/cli/src/__tests__/build-manifest-components.test.ts).
//
// Runs only when `perl` with Mojolicious is installed (same skip policy as
// stock-route.test.ts, which this file mirrors).

import { describe, test, expect, beforeAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { compileJSX } from '@barefootjs/jsx'
import { MojoAdapter } from '../adapter/mojo-adapter'

const MOJO_LIB_DIR = path.resolve(import.meta.dir, '../../lib')
const PERL_CORE_LIB_DIR = path.resolve(import.meta.dir, '../../../adapter-perl/lib')

function perlWithMojoAvailable(): boolean {
  try {
    const proc = Bun.spawnSync(['perl', '-MMojolicious', '-MTest::Mojo', '-e1'], {
      env: process.env,
    })
    return proc.exitCode === 0
  } catch {
    return false
  }
}

const PERL_AVAILABLE = perlWithMojoAvailable()

// The registry-toast shape: one module, several exported components, one of
// them ("Toast") snake_casing to the module's directory name — the collision
// that used to render the WRONG template even when the name resolved.
const TOAST_TSX = `'use client'

interface ToastProviderProps {
  children?: any
}

export function ToastProvider({ children }: ToastProviderProps) {
  return <div data-slot="toast-provider">{children}</div>
}

interface ToastProps {
  open?: boolean
  children?: any
}

export function Toast({ open = false, children }: ToastProps) {
  return (
    <div data-slot="toast" data-state={open ? 'open' : 'closed'}>
      {children}
    </div>
  )
}

export function ToastTitle({ children }: { children?: any }) {
  return <div data-slot="toast-title">{children}</div>
}
`

// The issue's ToastProbe: a page component driving the module's
// sub-components, with a signal feeding Toast's `open` prop.
const PROBE_TSX = `'use client'
import { createSignal } from '@barefootjs/client'
import { ToastProvider, Toast, ToastTitle } from '@/components/ui/toast'

export function ToastProbe() {
  const [open, setOpen] = createSignal(true)
  return (
    <ToastProvider>
      <Toast open={open()}>
        <ToastTitle>hi</ToastTitle>
      </Toast>
    </ToastProvider>
  )
}
`

const APP_PL = `#!/usr/bin/env perl
use Mojolicious::Lite -signatures;

plugin 'BarefootJS';

app->renderer->paths->[0] = app->home->child('dist/templates');

get '/toast-probe' => sub ($c) {
    $c->render(template => 'ToastProbe', layout => 'default');
};

app->start;

__DATA__

@@ layouts/default.html.ep
<!DOCTYPE html>
<html><body>
<main><%== content %></main>
%== $c->bf->scripts
</body></html>
`

const SMOKE_PL = `use Mojo::Base -strict;
use Test::More;
use Test::Mojo;
use Mojo::File qw(curfile);

my $t = Test::Mojo->new(curfile->dirname->child('app.pl'));

# The issue's regression bar: 200 with toast markup (was a 500 with
# "No renderer registered for child component 'toast_provider'").
$t->get_ok('/toast-probe')->status_is(200)
  ->element_exists('[data-slot="toast-provider"]', 'provider rendered')
  ->element_exists('[data-slot="toast"]',          'toast rendered')
  ->element_exists('[data-slot="toast-title"]',    'title rendered')
  ->text_like('[data-slot="toast-title"]', qr/hi/, 'children reached the title')
  ->element_exists('[data-slot="toast"][data-state="open"]',
      'parent signal reached the sub-component prop (not Toast\\'s own open=false default)');

done_testing;
`

describe.skipIf(!PERL_AVAILABLE)('Mojo multi-component registry modules (#2132)', () => {
  let appDir: string

  beforeAll(() => {
    appDir = mkdtempSync(path.join(tmpdir(), 'bf-mojo-multi-component-'))
    mkdirSync(path.join(appDir, 'dist/templates/ui/toast'), { recursive: true })

    const adapter = new MojoAdapter()

    // Compile the multi-component module: one template + ssr-defaults pair
    // per exported component, each stamped with its componentName.
    const toastResult = compileJSX(TOAST_TSX, 'components/ui/toast/index.tsx', { adapter })
    const toastErrors = toastResult.errors.filter(e => e.severity === 'error')
    if (toastErrors.length > 0) {
      throw new Error(`toast module compile failed:\n${toastErrors.map(e => e.message).join('\n')}`)
    }
    const componentRows: Record<string, { markedTemplate: string; ssrDefaults?: unknown }> = {}
    const toastTemplates = toastResult.files.filter(f => f.type === 'markedTemplate')
    for (const tpl of toastTemplates) {
      const fileName = path.basename(tpl.path)
      writeFileSync(path.join(appDir, 'dist/templates/ui/toast', fileName), tpl.content)
      const defaults = toastResult.files.find(
        f => f.type === 'ssrDefaults' && f.componentName === tpl.componentName,
      )
      componentRows[tpl.componentName!] = {
        markedTemplate: `templates/ui/toast/${fileName}`,
        ...(defaults ? { ssrDefaults: JSON.parse(defaults.content) } : {}),
      }
    }
    expect(Object.keys(componentRows).sort()).toEqual(['Toast', 'ToastProvider', 'ToastTitle'])

    // Compile the probe page.
    const probeResult = compileJSX(PROBE_TSX, 'components/ToastProbe.tsx', { adapter })
    const probeErrors = probeResult.errors.filter(e => e.severity === 'error')
    if (probeErrors.length > 0) {
      throw new Error(`probe compile failed:\n${probeErrors.map(e => e.message).join('\n')}`)
    }
    const probeTemplate = probeResult.files.find(f => f.type === 'markedTemplate')
    const probeDefaults = probeResult.files.find(f => f.type === 'ssrDefaults')
    if (!probeTemplate) throw new Error('probe compile produced no template')
    writeFileSync(path.join(appDir, 'dist/templates/ToastProbe.html.ep'), probeTemplate.content)

    // Same entry shape `bf build` writes to dist/templates/manifest.json
    // (see build-manifest-components.test.ts for the emitter pin).
    writeFileSync(
      path.join(appDir, 'dist/templates/manifest.json'),
      JSON.stringify({
        ToastProbe: {
          markedTemplate: 'templates/ToastProbe.html.ep',
          ...(probeDefaults ? { ssrDefaults: JSON.parse(probeDefaults.content) } : {}),
        },
        'ui/toast/index': {
          markedTemplate: componentRows[toastTemplates[0].componentName!].markedTemplate,
          components: componentRows,
        },
      }),
    )
    writeFileSync(path.join(appDir, 'app.pl'), APP_PL)
    writeFileSync(path.join(appDir, 'smoke.pl'), SMOKE_PL)
  })

  test('a <Toast>-using page renders 200 with toast markup', async () => {
    const perl5lib = [MOJO_LIB_DIR, PERL_CORE_LIB_DIR, process.env.PERL5LIB]
      .filter(Boolean)
      .join(':')
    const proc = Bun.spawn(['perl', 'smoke.pl'], {
      cwd: appDir,
      env: { ...process.env, PERL5LIB: perl5lib },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    expect(exitCode, `TAP output:\n${stdout}\n${stderr}`).toBe(0)
  })
})
