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
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROBE_JSON = join(HERE, 'probe-vectors.json')
const RUNNERS = join(HERE, 'runners')
const GO_RUNTIME = join(HERE, '../../../adapter-go-template/runtime')
const ERB_LIB = join(HERE, '../../../adapter-erb/lib')
const JINJA_PY = join(HERE, '../../../adapter-jinja/python')

interface Backend {
  name: string
  probe: () => boolean // runtime installed?
  run: () => { stdout: string }
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
      return { stdout: (r.stdout || '') + (r.stderr || '') }
    },
  },
  {
    name: 'ruby',
    probe: () => has('ruby', ['--version']),
    run: () => {
      const r = spawnSync('ruby', ['-I', ERB_LIB, join(RUNNERS, 'probe.rb')], { env, encoding: 'utf8' })
      return { stdout: (r.stdout || '') + (r.stderr || '') }
    },
  },
  {
    name: 'perl',
    probe: () => has('perl', ['--version']),
    run: () => {
      const r = spawnSync('perl', [join(RUNNERS, 'probe.pl')], { env, encoding: 'utf8' })
      return { stdout: (r.stdout || '') + (r.stderr || '') }
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
      return { stdout: (r.stdout || '') + (r.stderr || '') }
    },
  },
  {
    name: 'php',
    probe: () => has('php', ['--version']),
    run: () => {
      const r = spawnSync('php', [join(RUNNERS, 'probe.php')], { env, encoding: 'utf8' })
      return { stdout: (r.stdout || '') + (r.stderr || '') }
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

// 2. Run each installed backend and tally.
let totalNew = 0
let totalError = 0
let totalKnown = 0
const skipped: string[] = []

for (const b of backends) {
  if (!b.probe()) {
    skipped.push(b.name)
    continue
  }
  const { stdout } = b.run()
  const lines = stdout.split('\n').filter(Boolean)
  const news = lines.filter((l) => l.startsWith('NEW\t'))
  const errors = lines.filter((l) => l.startsWith('ERROR\t'))
  const knowns = lines.filter((l) => l.startsWith('KNOWN\t'))
  const ran = lines.find((l) => l.startsWith('RAN\t'))
  totalNew += news.length
  totalError += errors.length
  totalKnown += knowns.length

  const status = news.length || errors.length ? '✗' : '✓'
  console.log(
    `\n${status} ${b.name.toUpperCase()} — ${ran ? ran.split('\t')[1] : '?'} cases, ` +
      `${news.length} NEW, ${errors.length} ERROR, ${knowns.length} known`,
  )
  for (const l of [...errors, ...news]) {
    const [kind, category, note, got, want] = l.split('\t')
    console.log(`    ${kind} [${category}] ${note}` + (want !== undefined ? `  got=${got} want=${want}` : `  ${got}`))
  }
}

console.log('\n' + '─'.repeat(60))
if (skipped.length) console.log(`skipped (runtime not installed): ${skipped.join(', ')}`)
console.log(`TOTAL: ${totalNew} NEW divergences, ${totalError} ERRORS, ${totalKnown} known (tolerated)`)
if (totalNew || totalError) {
  console.log('RESULT: FAIL — new divergence(s) found. Triage: fix the backend + add the case to eval-cases.ts,')
  console.log('        or (if a documented limitation) flag the value `known` in generate-probe.ts.')
  process.exit(1)
}
console.log('RESULT: PASS — all backends match the JS reference outside the documented-divergence families.')
