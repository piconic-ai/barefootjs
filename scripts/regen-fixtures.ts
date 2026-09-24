/**
 * Regenerate every ledger derived from the fixture corpus, in dependency
 * order:
 *
 *   bun run fixtures:regen
 *
 * Adding or editing a fixture changes four committed files, each gated by
 * its own CI drift check. They must be rebuilt in this order because each
 * one reads the previous one (or the adapter builds):
 *
 *   1. fixture `expectedHtml`       — from the Hono reference adapter
 *   2. `coverage-map.json`          — from the fixture sources
 *   3. `ui/compat.lock.json`        — from the built adapters' pins
 *   4. `ui/support-matrix.lock.json` — joins (2) with the adapters' pins
 *
 * Missing one costs a full CI round (every adapter workflow) per push, so
 * run this once before pushing a fixture change and commit what it writes.
 */

const BUILD_PACKAGES = [
  '@barefootjs/jsx',
  '@barefootjs/vite',
  '@barefootjs/client',
  '@barefootjs/hono',
  // `compat:lock` / `support-matrix:lock` import these through their
  // `./dist/index.js` entry points (see ci-compat.yml), so they must be
  // built from the current tree first.
  '@barefootjs/blade',
  '@barefootjs/erb',
  '@barefootjs/go-template',
  '@barefootjs/jinja',
  '@barefootjs/mojolicious',
  '@barefootjs/pebble',
  '@barefootjs/rust',
  '@barefootjs/twig',
  '@barefootjs/xslate',
]

const STEPS: ReadonlyArray<{ label: string; cmd: string[] }> = [
  ...BUILD_PACKAGES.map(pkg => ({
    label: `build ${pkg}`,
    cmd: ['bun', 'run', '--filter', pkg, 'build'],
  })),
  {
    label: 'expectedHtml',
    cmd: ['bun', 'run', 'packages/adapter-tests/scripts/generate-expected-html.ts'],
  },
  { label: 'coverage-map.json', cmd: ['bun', 'packages/adapter-tests/scripts/coverage-map.ts'] },
  { label: 'ui/compat.lock.json', cmd: ['bun', 'run', 'compat:lock'] },
  { label: 'ui/support-matrix.lock.json', cmd: ['bun', 'run', 'support-matrix:lock'] },
]

const root = new URL('..', import.meta.url).pathname

for (const step of STEPS) {
  console.log(`\n▶ ${step.label}`)
  const proc = Bun.spawnSync(step.cmd, { cwd: root, stdout: 'inherit', stderr: 'inherit' })
  if (proc.exitCode !== 0) {
    console.error(`✖ ${step.label} failed (exit ${proc.exitCode}): ${step.cmd.join(' ')}`)
    process.exit(proc.exitCode ?? 1)
  }
}

console.log('\n✔ fixture ledgers regenerated — review `git status` and commit the changes')
