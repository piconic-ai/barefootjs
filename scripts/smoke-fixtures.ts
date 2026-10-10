/**
 * Run the fixtures whose name matches a pattern against every adapter:
 *
 *   bun run fixtures:smoke <test-name-pattern> [--only go-template,jinja]
 *
 * The pattern is passed to `bun test -t`, so a fixture id
 * (`member-seeded-nullable-signal-attr`) or a family
 * (`seeded-nullable-signal`) selects the conformance cases of every adapter
 * suite, plus the CSR conformance suite. One run takes a minute or two, so
 * use it after each change instead of an adapter's full suite. Run the full
 * suite only for the packages whose source changed, and leave the rest to
 * the per-adapter CI workflows: one push of a PR against `main` starts
 * about 40 jobs, more than the runner concurrency the repository has.
 *
 * Exits non-zero when any suite reports a failure or matches no test.
 */

import { fileURLToPath } from 'node:url'

const SUITES: ReadonlyArray<{ name: string; dir: string; file: string }> = [
  { name: 'hono', dir: 'packages/adapter-hono', file: '__tests__/hono-adapter.test.ts' },
  { name: 'blade', dir: 'packages/adapter-blade', file: 'src/__tests__/blade-adapter.test.ts' },
  { name: 'erb', dir: 'packages/adapter-erb', file: 'src/__tests__/erb-adapter.test.ts' },
  { name: 'jinja', dir: 'packages/adapter-jinja', file: 'src/__tests__/jinja-adapter.test.ts' },
  { name: 'rust', dir: 'packages/adapter-rust', file: 'src/__tests__/minijinja-adapter.test.ts' },
  { name: 'mojolicious', dir: 'packages/adapter-mojolicious', file: 'src/__tests__/mojo-adapter.test.ts' },
  { name: 'pebble', dir: 'packages/adapter-pebble', file: 'src/__tests__/pebble-conformance.test.ts' },
  { name: 'twig', dir: 'packages/adapter-twig', file: 'src/__tests__/twig-adapter.test.ts' },
  { name: 'xslate', dir: 'packages/adapter-xslate', file: 'src/__tests__/xslate-adapter.test.ts' },
  { name: 'go-template', dir: 'packages/adapter-go-template', file: 'src/__tests__/go-template-adapter.test.ts' },
  { name: 'csr', dir: 'packages/adapter-tests', file: 'src/__tests__/csr-conformance.test.ts' },
]

const args = process.argv.slice(2)
const onlyIndex = args.indexOf('--only')
const only = onlyIndex >= 0 ? new Set((args[onlyIndex + 1] ?? '').split(',').filter(Boolean)) : null
const pattern = args.find((a, i) => !a.startsWith('--') && (onlyIndex < 0 || i !== onlyIndex + 1))
if (!pattern) {
  console.error('usage: bun run fixtures:smoke <test-name-pattern> [--only go-template,jinja]')
  process.exit(2)
}

const root = fileURLToPath(new URL('..', import.meta.url))
const rows: Array<{ name: string; pass: number; fail: number; seconds: number }> = []
const failures: string[] = []

for (const suite of SUITES) {
  if (only && !only.has(suite.name)) continue
  const started = performance.now()
  const proc = Bun.spawnSync(['bun', 'test', suite.file, '-t', pattern], {
    cwd: `${root}/${suite.dir}`,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const out = `${proc.stdout.toString()}\n${proc.stderr.toString()}`
  const pass = Number(out.match(/^\s*(\d+) pass/m)?.[1] ?? 0)
  const fail = Number(out.match(/^\s*(\d+) fail/m)?.[1] ?? 0)
  const seconds = (performance.now() - started) / 1000
  rows.push({ name: suite.name, pass, fail, seconds })
  for (const line of out.split('\n')) {
    if (line.startsWith('(fail)')) failures.push(`${suite.name}: ${line}`)
  }
  if (proc.exitCode !== 0 && fail === 0) failures.push(`${suite.name}: exited ${proc.exitCode} (no test matched, or the suite did not load)`)
  console.log(`${fail > 0 || proc.exitCode !== 0 ? '✖' : '✔'} ${suite.name.padEnd(12)} ${String(pass).padStart(3)} pass ${String(fail).padStart(3)} fail  ${seconds.toFixed(0)}s`)
}

if (failures.length > 0) {
  console.error(`\n${failures.join('\n')}`)
  process.exit(1)
}
console.log(`\n✔ "${pattern}" passes on ${rows.length} suites`)
