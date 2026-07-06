// Stock-route smoke test for the Mojo scaffold contract (#2126).
//
// The scaffold's happy path is: `npm run dev` (which starts `bf build
// --watch` and morbo *concurrently*), then open `/`. That page renders a
// component whose EP template reads props/signals as bare scalars
// (`% my $count = ($initial // 0);`), and Mojo templates compile under
// `use strict` — so every one of those scalars must be declared by the
// time the template runs. Two production bugs hid in that path:
//
//   1. The route passes no props, so the stash seeding has to come from
//      the manifest's `ssrDefaults` via the plugin's `before_render`
//      hook — including props only referenced through `props.X` reads.
//   2. The plugin used to load the manifest once at register time, so
//      booting before the first build wrote `manifest.json` disabled
//      auto-init for the server's lifetime: every render of `/` died
//      with `Global symbol "$initial" requires explicit package name`
//      (HTTP 500) until a manual restart.
//
// This test boots a real Mojolicious app whose `app.pl` mirrors the
// scaffold's (plugin + dist/templates renderer path + a `/` route that
// passes NO props) against a template + manifest produced by the real
// compiler, and asserts the page renders — in both boot orders. It is
// the in-repo equivalent of "scaffold → build → curl / expects 200".
//
// Runs only when `perl` with Mojolicious is installed (same skip policy
// as the conformance render tests). The DevReload plugin is omitted:
// it's dev-only plumbing with its own coverage in t/dev_reload.t.

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

// The starter-Counter shape: a prop read only through `props.X ?? …`
// (never passed by the stock route) feeding a signal, plus a memo.
// Exactly the pattern that dies under strict when seeding breaks.
// `props.label` is read directly in the body (no signal/memo in
// between) — that flattens to a bare `<%= $label %>` too, so it pins
// that ssrDefaults seeds every declared prop, not just the ones a
// signal initializer references.
const COUNTER_TSX = `'use client'

import { createSignal, createMemo } from '@barefootjs/client'

interface CounterProps {
  initial?: number
  label?: string
}

export function Counter(props: CounterProps) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="counter">
      <p className="counter-label">{props.label}</p>
      <p className="counter-value">count: {count()}</p>
      <p className="counter-doubled">doubled: {doubled()}</p>
      <button onClick={() => setCount(n => n + 1)}>+1</button>
    </div>
  )
}
`

// Mirrors the scaffold's app.pl essentials. The `/` route deliberately
// passes NO props — the manifest seeding alone must carry it. The
// second route pins that a caller-supplied prop still wins.
const APP_PL = `#!/usr/bin/env perl
use Mojolicious::Lite -signatures;

plugin 'BarefootJS';

app->renderer->paths->[0] = app->home->child('dist/templates');

get '/' => sub ($c) {
    $c->render(template => 'Counter', layout => 'default');
};

get '/with-prop' => sub ($c) {
    $c->render(template => 'Counter', layout => 'default', initial => 5);
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

// Test::Mojo harness. SMOKE_SCENARIO picks the boot order:
//   manifest-at-boot   — the manifest exists before the app loads
//                        (server restarted after a completed build).
//   manifest-after-boot — the app loads first, the manifest appears
//                        afterwards (the concurrent `bf build --watch`
//                        + morbo dev race on a fresh scaffold).
const SMOKE_PL = `use Mojo::Base -strict;
use Test::More;
use Test::Mojo;
use Mojo::File qw(curfile path);

my $home     = curfile->dirname;
my $scenario = $ENV{SMOKE_SCENARIO} // 'manifest-at-boot';
my $staged   = $home->child('manifest.staged.json');
my $manifest = $home->child('dist/templates/manifest.json');

unlink "$manifest";
$staged->copy_to("$manifest") if $scenario eq 'manifest-at-boot';

my $t = Test::Mojo->new($home->child('app.pl'));

$staged->copy_to("$manifest") if $scenario eq 'manifest-after-boot';

# Stock route: no props passed — manifest ssrDefaults must seed every
# bare template scalar ($initial included) or strict mode 500s.
$t->get_ok('/')->status_is(200)
  ->text_like('p.counter-value',   qr/count:\\s*0/)
  ->text_like('p.counter-doubled', qr/doubled:\\s*0/)
  ->content_like(qr/Counter\\.client\\.js/, 'auto-init registered the client bundle');

# Caller-supplied prop wins over the manifest default.
$t->get_ok('/with-prop')->status_is(200)
  ->text_like('p.counter-value',   qr/count:\\s*5/)
  ->text_like('p.counter-doubled', qr/doubled:\\s*10/);

done_testing;
`

describe.skipIf(!PERL_AVAILABLE)('Mojo scaffold stock route (#2126)', () => {
  let appDir: string

  beforeAll(() => {
    appDir = mkdtempSync(path.join(tmpdir(), 'bf-mojo-stock-route-'))
    mkdirSync(path.join(appDir, 'dist/templates'), { recursive: true })

    const result = compileJSX(COUNTER_TSX, 'Counter.tsx', { adapter: new MojoAdapter() })
    const template = result.files.find(f => f.type === 'markedTemplate')
    const ssrDefaults = result.files.find(f => f.type === 'ssrDefaults')
    if (!template || !ssrDefaults) throw new Error('compileJSX produced no template/ssrDefaults')

    writeFileSync(path.join(appDir, 'dist/templates/Counter.html.ep'), template.content)
    // Same entry shape `bf build` writes to dist/templates/manifest.json.
    writeFileSync(
      path.join(appDir, 'manifest.staged.json'),
      JSON.stringify({
        Counter: {
          markedTemplate: 'templates/Counter.html.ep',
          ssrDefaults: JSON.parse(ssrDefaults.content),
        },
      }),
    )
    writeFileSync(path.join(appDir, 'app.pl'), APP_PL)
    writeFileSync(path.join(appDir, 'smoke.pl'), SMOKE_PL)
  })

  async function runScenario(scenario: string): Promise<void> {
    const perl5lib = [MOJO_LIB_DIR, PERL_CORE_LIB_DIR, process.env.PERL5LIB]
      .filter(Boolean)
      .join(':')
    const proc = Bun.spawn(['perl', 'smoke.pl'], {
      cwd: appDir,
      env: { ...process.env, PERL5LIB: perl5lib, SMOKE_SCENARIO: scenario },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    expect(exitCode, `TAP output:\n${stdout}\n${stderr}`).toBe(0)
  }

  test('renders / with the manifest present at boot', async () => {
    await runScenario('manifest-at-boot')
  })

  test('renders / when the manifest appears after boot (concurrent dev-startup race)', async () => {
    await runScenario('manifest-after-boot')
  })
})
