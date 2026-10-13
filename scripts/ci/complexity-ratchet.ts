#!/usr/bin/env bun
/**
 * The cognitive-complexity ratchet (#3427). Logic and rationale:
 * `scripts/lib/complexity-ratchet.ts`; measurement config: `cccc.toml`.
 *
 *   bun scripts/ci/complexity-ratchet.ts            # check the tree against cccc-baseline.json
 *   bun scripts/ci/complexity-ratchet.ts --update   # regenerate cccc-baseline.json
 *   bun scripts/ci/complexity-ratchet.ts --update --force
 *     # also when a file's above-threshold sum went up, or the installed cccc
 *     # differs from the baseline's: both are refused without --force so a
 *     # regeneration can't quietly accept growth or a scorer change
 *
 * Needs `cccc` on PATH (a GitHub release binary, `cargo install cccc-cli`,
 * or moznion/cccc-action in CI). Runs from the repository root whatever the
 * current directory, so paths in the baseline are root-relative.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BASELINE_FILE,
  DEFAULT_THRESHOLD,
  REGENERATE_COMMAND,
  type CcccReport,
  type ComplexityBaseline,
  baselineGrowth,
  buildBaseline,
  compareToBaseline,
  formatVerdict,
  parseCcccVersion,
  serializeBaseline,
} from '../lib/complexity-ratchet'

const root = fileURLToPath(new URL('../..', import.meta.url))
const baselinePath = resolve(root, BASELINE_FILE)
const update = process.argv.includes('--update')
const force = process.argv.includes('--force')

/** The shipping sources: the `src` directory of every package (cccc.toml excludes the tests under them). */
function sourceDirs(): string[] {
  return readdirSync(resolve(root, 'packages'))
    .map((name) => `packages/${name}/src`)
    .filter((dir) => existsSync(resolve(root, dir)) && statSync(resolve(root, dir)).isDirectory())
    .sort()
}

function run(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(['cccc', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  return { stdout: proc.stdout.toString(), stderr: proc.stderr.toString(), exitCode: proc.exitCode }
}

let versionOutput: ReturnType<typeof run>
try {
  versionOutput = run(['--version'])
} catch {
  console.error('cccc is not installed. See AGENTS.md "Complexity" for how to install it.')
  process.exit(2)
}
const version = parseCcccVersion(versionOutput.stdout)
if (!version) {
  console.error(`could not read the cccc version from: ${versionOutput.stdout}${versionOutput.stderr}`)
  process.exit(2)
}

// `cccc.toml` is discovered from `root` (the cwd); it carries the language,
// extension and exclude settings, so the only arguments are the scope.
const measured = run(sourceDirs())
if (measured.exitCode !== 0) {
  console.error(measured.stderr || measured.stdout)
  process.exit(2)
}
const report = JSON.parse(measured.stdout) as CcccReport
if (report.summary.parse_error_count > 0) {
  console.error(
    `cccc reported ${report.summary.parse_error_count} parse error(s) in: ${(report.summary.parse_error_files ?? []).join(', ')}`,
  )
  process.exit(2)
}

if (update) {
  const previous = existsSync(baselinePath)
    ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as ComplexityBaseline)
    : null
  const baseline = buildBaseline(report, previous?.threshold ?? DEFAULT_THRESHOLD, version)
  if (previous) {
    const refusals: string[] = []
    if (previous.cccc !== version) {
      refusals.push(
        `the committed baseline was generated with cccc ${previous.cccc}, but cccc ${version} is installed; ` +
          `install ${previous.cccc}, or bump the pin in ci-complexity.yml and AGENTS.md and pass --force`,
      )
    }
    const growth = baselineGrowth(previous, baseline)
    if (growth.length > 0) {
      refusals.push(
        'the above-threshold complexity of these files went UP — a regenerated baseline would accept it. ' +
          'Lower the functions instead, or pass --force and say why in the PR:',
        ...growth.map((g) => `  ${g.path}: ${g.from} -> ${g.to}`),
      )
    }
    if (refusals.length > 0 && !force) {
      console.error(`${BASELINE_FILE} not written:\n${refusals.join('\n')}`)
      process.exit(1)
    }
    if (refusals.length > 0) console.error(`--force: ${refusals.join('\n')}`)
  }
  writeFileSync(baselinePath, serializeBaseline(baseline))
  const count = Object.values(baseline.files).reduce(
    (n, byName) => n + Object.values(byName).reduce((m, values) => m + values.length, 0),
    0,
  )
  console.log(`${BASELINE_FILE}: ${count} functions above cognitive ${baseline.threshold} (cccc ${version})`)
  process.exit(0)
}

if (!existsSync(baselinePath)) {
  console.error(`${BASELINE_FILE} is missing — run \`${REGENERATE_COMMAND}\` and commit it.`)
  process.exit(1)
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as ComplexityBaseline
if (baseline.cccc !== version) {
  console.error(
    `${BASELINE_FILE} was generated with cccc ${baseline.cccc}, but cccc ${version} is installed. ` +
      `Install ${baseline.cccc}, or bump the pin everywhere (the CI workflow, AGENTS.md) and run \`${REGENERATE_COMMAND}\`.`,
  )
  process.exit(1)
}

const verdict = compareToBaseline(report, baseline)
if (verdict.ok) {
  console.log(
    `complexity ratchet: ok — ${verdict.aboveThreshold} functions above cognitive ${baseline.threshold}, none above its baseline`,
  )
  process.exit(0)
}
console.error(formatVerdict(verdict, baseline.threshold))
process.exit(1)
