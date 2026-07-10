/**
 * Generative divergence-probe DRIVER.
 *
 * Regenerates the probe corpus (generate-probe.ts), then replays it through
 * every backend evaluator whose language runtime is installed, and classifies
 * each mismatch:
 *
 *   NEW    — a backend disagrees with the JS reference on a case NOT in a
 *            documented-divergence family. This is a genuine bug (like the
 *            Number("5.") Ruby crash / Go "1_000" over-acceptance). FAILS.
 *   KNOWN  — a mismatch on a case the generator flagged `known` (string
 *            .length on non-ASCII, inexact-float stringification, radix-int
 *            Number()). Reported for visibility, does NOT fail.
 *   ERROR  — the backend threw. Always a failure (the evaluator must never
 *            raise on in-subset input).
 *
 * Exit code is non-zero iff any NEW divergence or ERROR was seen, so this can
 * be wired as a CI job. Backends whose runtime is absent are skipped visibly.
 *
 *   cd packages/adapter-tests && bun vectors/probe/run-probe.ts
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROBE_JSON = join(HERE, 'probe-vectors.json')
const RUNNERS = join(HERE, 'runners')
const ERB_LIB = join(HERE, '../../../adapter-erb/lib')
const JINJA_PY = join(HERE, '../../../adapter-jinja/python')

interface Backend {
  name: string
  probe: () => boolean // runtime installed?
  run: () => { stdout: string; status: number }
}

function has(cmd: string, args: string[]): boolean {
  const r = spawnSync(cmd, args, { stdio: 'ignore' })
  return r.status === 0
}

const env = { ...process.env, PROBE_VECTORS: PROBE_JSON }

const backends: Backend[] = [
  {
    name: 'go',
    probe: () => has('go', ['version']),
    run: () => {
      const r = spawnSync('go', ['run', '.'], { cwd: join(RUNNERS, 'go'), env, encoding: 'utf8' })
      return { stdout: (r.stdout || '') + (r.stderr || ''), status: r.status ?? 1 }
    },
  },
  {
    name: 'ruby',
    probe: () => has('ruby', ['--version']),
    run: () => {
      const r = spawnSync('ruby', ['-I', ERB_LIB, join(RUNNERS, 'probe.rb')], { env, encoding: 'utf8' })
      return { stdout: (r.stdout || '') + (r.stderr || ''), status: r.status ?? 1 }
    },
  },
  {
    name: 'perl',
    probe: () => has('perl', ['--version']),
    run: () => {
      const r = spawnSync('perl', [join(RUNNERS, 'probe.pl')], { env, encoding: 'utf8' })
      return { stdout: (r.stdout || '') + (r.stderr || ''), status: r.status ?? 1 }
    },
  },
  {
    name: 'python',
    probe: () => has('python3', ['--version']),
    run: () => {
      const r = spawnSync('python3', [join(RUNNERS, 'probe.py')], {
        env: { ...env, PYTHONPATH: JINJA_PY },
        encoding: 'utf8',
      })
      return { stdout: (r.stdout || '') + (r.stderr || ''), status: r.status ?? 1 }
    },
  },
  {
    name: 'php',
    probe: () => has('php', ['--version']),
    run: () => {
      const r = spawnSync('php', [join(RUNNERS, 'probe.php')], { env, encoding: 'utf8' })
      return { stdout: (r.stdout || '') + (r.stderr || ''), status: r.status ?? 1 }
    },
  },
]

// 1. Regenerate the corpus.
{
  const r = spawnSync('bun', [join(HERE, 'generate-probe.ts')], { encoding: 'utf8' })
  process.stdout.write(r.stdout || '')
  if (r.status !== 0) {
    process.stderr.write(r.stderr || '')
    process.exit(2)
  }
}

// The number of cases a runner is expected to report — used to detect a
// runner that died partway (or never started) and would otherwise look
// "clean" simply because it printed no NEW/ERROR lines.
const expectedCases: number = JSON.parse(readFileSync(PROBE_JSON, 'utf8')).cases.length

// 2. Run each installed backend and tally.
let totalNew = 0
let totalError = 0
let totalKnown = 0
let brokenRunners = 0
const skipped: string[] = []

for (const b of backends) {
  if (!b.probe()) {
    skipped.push(b.name)
    continue
  }
  const { stdout, status } = b.run()
  const lines = stdout.split('\n').filter(Boolean)
  const news = lines.filter((l) => l.startsWith('NEW\t'))
  const errors = lines.filter((l) => l.startsWith('ERROR\t'))
  const knowns = lines.filter((l) => l.startsWith('KNOWN\t'))
  const ran = lines.find((l) => l.startsWith('RAN\t'))
  const ranCount = ran ? Number(ran.split('\t')[1]) : Number.NaN

  // A runner that exited non-zero, never printed its RAN sentinel, or ran a
  // different number of cases than were generated did NOT complete — treat
  // that as a hard failure, never a silent pass. (This is the case where a
  // compile error / missing dep would otherwise be reported green.)
  if (status !== 0 || !Number.isFinite(ranCount) || ranCount !== expectedCases) {
    brokenRunners++
    console.log(
      `\n✗ ${b.name.toUpperCase()} — runner did not complete ` +
        `(exit=${status}, ran=${ran ? ranCount : 'no RAN line'}/${expectedCases})`,
    )
    const tail = stdout.trim().split('\n').slice(-6)
    for (const l of tail) console.log(`    ${l}`)
    continue
  }

  totalNew += news.length
  totalError += errors.length
  totalKnown += knowns.length

  const mark = news.length || errors.length ? '✗' : '✓'
  console.log(
    `\n${mark} ${b.name.toUpperCase()} — ${ranCount} cases, ` +
      `${news.length} NEW, ${errors.length} ERROR, ${knowns.length} known`,
  )
  for (const l of [...errors, ...news]) {
    const [kind, category, note, got, want] = l.split('\t')
    console.log(`    ${kind} [${category}] ${note}` + (want !== undefined ? `  got=${got} want=${want}` : `  ${got}`))
  }
}

console.log('\n' + '─'.repeat(60))
if (skipped.length) console.log(`skipped (runtime not installed): ${skipped.join(', ')}`)
if (brokenRunners) console.log(`${brokenRunners} runner(s) failed to complete`)
console.log(`TOTAL: ${totalNew} NEW divergences, ${totalError} ERRORS, ${totalKnown} known (tolerated)`)
if (totalNew || totalError || brokenRunners) {
  console.log('RESULT: FAIL — new divergence(s), error(s), or a runner that did not complete.')
  console.log('        Triage a NEW divergence: fix the backend + add the case to eval-cases.ts,')
  console.log('        or (if a documented limitation) flag the value `known` in generate-probe.ts.')
  process.exit(1)
}
console.log('RESULT: PASS — all backends match the JS reference outside the documented-divergence families.')
