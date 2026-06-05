import { test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { XslateAdapter } from '../adapter'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const COUNTER_SRC = `"use client"
import { createSignal } from '@barefootjs/client'
export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = createSignal(initial)
  const doubled = () => count() * 2
  return (
    <div class="counter">
      <p>count: {count()}</p>
      <p>doubled: {doubled()}</p>
      <button onClick={() => setCount(n => n + 1)}>+1</button>
    </div>
  )
}`

const PERL_CORE_LIB = resolve(import.meta.dir, '../../../adapter-perl/lib')
const XSLATE_LIB = resolve(import.meta.dir, '../../lib')

let _perlAvailable: boolean | null = null
async function isPerlXslateAvailable(): Promise<boolean> {
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

test('Counter compiles to a Kolon .tx template', () => {
  const result = compileJSX(COUNTER_SRC, 'Counter.tsx', {
    adapter: new XslateAdapter(),
    outputIR: true,
  })
  const errors = result.errors.filter(e => e.severity === 'error')
  expect(errors).toEqual([])

  const tpl = result.files.find(f => f.type === 'markedTemplate')
  expect(tpl).toBeDefined()
  const content = tpl!.content
  // Script registration as silent Kolon line statements (bound to a throwaway
  // `my` so the call's return value isn't printed into the HTML).
  expect(content).toContain(`$bf.register_script('/static/components/barefoot.js')`)
  expect(content).toContain(`$bf.register_script('/static/components/Counter.client.js')`)
  // Hydration markers
  expect(content).toContain(`bf-s="<: $bf.scope_attr() :>"`)
  expect(content).toContain(`<: $bf.hydration_attrs() | mark_raw :>`)
  expect(content).toContain(`<: $bf.props_attr() | mark_raw :>`)
  // Text slots
  expect(content).toContain(`<: $bf.text_start("s0") | mark_raw :><: $count :><: $bf.text_end() | mark_raw :>`)
  expect(content).toContain(`<: $bf.text_start("s2") | mark_raw :><: $doubled :><: $bf.text_end() | mark_raw :>`)
  // Button stays a plain element (onClick is client-only)
  expect(content).toContain(`+1</button>`)
})

test('Counter renders through real Text::Xslate', async () => {
  if (!(await isPerlXslateAvailable())) {
    console.warn('perl with Text::Xslate not available — skipping render test')
    return
  }

  const result = compileJSX(COUNTER_SRC, 'Counter.tsx', {
    adapter: new XslateAdapter(),
    outputIR: true,
  })
  const errors = result.errors.filter(e => e.severity === 'error')
  expect(errors).toEqual([])
  const tpl = result.files.find(f => f.type === 'markedTemplate')!

  const dir = await mkdtemp(join(tmpdir(), 'xslate-counter-'))
  try {
    // Template file named `counter.tx` (snake_case of Counter).
    await writeFile(join(dir, 'counter.tx'), tpl.content)

    const renderScript = `#!/usr/bin/env perl
use strict;
use warnings;
use utf8;
use lib '${XSLATE_LIB}', '${PERL_CORE_LIB}';
use BarefootJS;
use BarefootJS::Backend::Xslate;

my $backend = BarefootJS::Backend::Xslate->new(path => ['${dir}']);
my $bf = BarefootJS->new(undef, { backend => $backend });
$bf->_scope_id('Counter_test');

binmode(STDOUT, ':utf8');
my \$html = \$backend->render_named('counter', \$bf, { count => 3, doubled => 6 });
print \$html;
# The template's register_script calls populated \$bf's script list during
# render; emit the resulting <script> tags so the test can assert them.
print "\\n";
print \$bf->scripts;
`
    const scriptPath = join(dir, 'render.pl')
    await writeFile(scriptPath, renderScript)

    const proc = Bun.spawn(['perl', scriptPath], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(`perl render failed (exit ${exitCode}):\n${stderr}\n--- template ---\n${tpl.content}`)
    }

    const html = stdout
    console.log('=== RENDERED HTML ===')
    console.log(html)

    // Scope marker
    expect(html).toContain('bf-s="Counter_test"')
    // Text slots with comment markers and values
    expect(html).toMatch(/count: <!--bf:s0-->3<!--\/-->/)
    expect(html).toMatch(/doubled: <!--bf:s2-->6<!--\/-->/)
    // Plain button (no handler at SSR)
    expect(html).toMatch(/<button[^>]*>\+1<\/button>/)
    // No leaked register_script return values before the root element.
    expect(html).toMatch(/^\s*<div class="counter"/)
    // Registered client JS surfaces as <script> tags via $bf->scripts.
    expect(html).toContain('<script type="module" src="/static/components/barefoot.js"></script>')
    expect(html).toContain('<script type="module" src="/static/components/Counter.client.js"></script>')
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})
