#!/usr/bin/env node
//
// End-to-end smoke test for published tarballs.
//
// Runs every publishable `@barefootjs/*` package through `bun pm pack`
// (see the `Pack tarballs` section below for why bun rather than
// `npm pack`), scaffolds a fresh user-style project against the
// resulting tarballs (no workspace: refs, no monorepo paths), and
// exercises the `bf` CLI surface that depends on bundled resources
// or workspace-shaped imports.
//
// Catches the class of bugs where a command works inside the monorepo
// but breaks when the same code runs from a `node_modules/@barefootjs/*`
// install — e.g. the `bf tokens` regression that resolved
// `site/shared/tokens/index` through `ctx.root`, which only exists in
// the repo. pkg-pr-new verifies the publish wiring; this script
// verifies the runtime behaviour of those tarballs.
//
// Run locally:
//   bun run scripts/smoke-publish.mjs            # build + pack + scaffold + smoke
//   bun run scripts/smoke-publish.mjs --no-build # skip the build step (reuse existing dist/)
//   bun run scripts/smoke-publish.mjs --keep     # preserve the temp workspace + tarball
//                                                # dir on success (always preserved on failure)
//
// Also wired into CI via `.github/workflows/ci-smoke-publish.yml`.

import { execSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

// Publishable packages — the set must stay in sync with
// `.github/workflows/pkg-pr-new.yml`'s publish list (which is the
// source of truth for "what ships"). Order here is the dependency
// order needed for `bun run --filter X build` to find upstream
// artefacts; the pkg-pr-new workflow uses its own order (build vs
// publish), so we deliberately don't mirror that — only the set.
const PUBLISHABLE = [
  'packages/shared',
  'packages/jsx',
  'packages/client',
  'packages/streaming',
  'packages/test',
  'packages/adapter-hono',
  'packages/adapter-go-template',
  'packages/adapter-perl',
  'packages/adapter-mojolicious',
  'packages/form',
  'packages/chart',
  'packages/xyflow',
  'packages/cli',
  'packages/create-barefootjs',
]

const args = process.argv.slice(2)
const skipBuild = args.includes('--no-build')
const keepWorkspace = args.includes('--keep')

function header(label) {
  const bar = '━'.repeat(70)
  console.log(`\n${bar}\n  ${label}\n${bar}`)
}

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', encoding: 'utf-8', ...opts })
}

function runCapture(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', ...opts })
}

// ── 1. Build every publishable package ──────────────────────────────
if (!skipBuild) {
  header('Build publishable packages')
  for (const pkgDir of PUBLISHABLE) {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, pkgDir, 'package.json'), 'utf-8'),
    )
    if (!pkg.scripts?.build) {
      console.log(`(skip) ${pkg.name} has no build script`)
      continue
    }
    run(`bun run --filter '${pkg.name}' build`, { cwd: repoRoot })
  }
} else {
  header('Build (skipped via --no-build)')
}

// ── 2. `bun pm pack` each publishable package ──────────────────────
// `bun pm pack` is used in place of `npm pack` because npm (10.x) does
// not rewrite the `workspace:*` protocol when packing — the resulting
// tarball still claims `"@barefootjs/shared": "workspace:*"`, which
// blows up with EUNSUPPORTEDPROTOCOL on `npm install`. Bun replaces it
// with the resolved version (e.g. `"0.1.0"`), matching what pkg-pr-new
// publishes. Prepack / postpack hooks still fire.
header('Pack tarballs')
const tarballDir = mkdtempSync(join(tmpdir(), 'bf-smoke-tarballs-'))
const tarballs = {} // pkgName -> absolute tarball path
for (const pkgDir of PUBLISHABLE) {
  const pkg = JSON.parse(
    readFileSync(resolve(repoRoot, pkgDir, 'package.json'), 'utf-8'),
  )
  // Log the package up-front so a `bun pm pack` crash names which
  // workspace was being packed at the time of the failure — without
  // this, the per-package line only printed on success and CI logs
  // would surface a bare execSync stack with no package context.
  process.stdout.write(`  ${pkg.name.padEnd(34)} → `)
  let tarballPath
  try {
    // `--quiet` prints only the tarball path on stdout — keeps the
    // capture parse trivial across bun versions.
    const out = runCapture(
      `bun pm pack --quiet --destination=${tarballDir}`,
      { cwd: resolve(repoRoot, pkgDir) },
    )
    tarballPath = out.trim().split('\n').pop()
  } catch (err) {
    console.log('FAILED')
    err.message = `bun pm pack failed for ${pkg.name} (${pkgDir}): ${err.message}`
    throw err
  }
  tarballs[pkg.name] = tarballPath
  console.log(tarballPath.split('/').pop())
}

// ── 3. Scaffold via the create-barefootjs tarball ──────────────────
header('Scaffold from tarballs')
const workspace = mkdtempSync(join(tmpdir(), 'bf-smoke-workspace-'))

// Install create-barefootjs + @barefootjs/cli into a throwaway tree so
// the bin can `require.resolve('@barefootjs/cli/dist/index.js')`. The
// app being scaffolded gets its own install via the rewrite below.
const installerDir = join(workspace, '_installer')
mkdirSync(installerDir, { recursive: true })
writeFileSync(
  resolve(installerDir, 'package.json'),
  JSON.stringify(
    {
      name: 'bf-smoke-installer',
      private: true,
      dependencies: {
        'create-barefootjs': `file:${tarballs['create-barefootjs']}`,
        '@barefootjs/cli': `file:${tarballs['@barefootjs/cli']}`,
      },
    },
    null,
    2,
  ) + '\n',
)
run('npm install --no-audit --no-fund --loglevel=error', { cwd: installerDir })

// Run the bin against an empty `app/` target. cwd is the parent so the
// confirmation line ("✔ Target directory app") echoes the same path the
// user would type.
const createBin = join(
  installerDir,
  'node_modules',
  'create-barefootjs',
  'dist',
  'index.js',
)
run(`node ${JSON.stringify(createBin)} app --yes`, { cwd: workspace })
const appDir = join(workspace, 'app')

// ── 4. Rewrite the scaffolded package.json to point at our tarballs ─
header('Wire tarballs into the scaffold')
const appPkgPath = resolve(appDir, 'package.json')
const appPkg = JSON.parse(readFileSync(appPkgPath, 'utf-8'))

function rewriteSection(section) {
  for (const [n] of Object.entries(appPkg[section] || {})) {
    if (n.startsWith('@barefootjs/') && tarballs[n]) {
      appPkg[section][n] = `file:${tarballs[n]}`
    }
  }
}
rewriteSection('dependencies')
rewriteSection('devDependencies')

// Overrides cover transitive deps (e.g. `@barefootjs/hono` is a peer of
// `@barefootjs/client`) so every workspace package collapses to the
// same tarball at install time. Skip `create-barefootjs` — it's only
// the entry point, never a transitive dep.
appPkg.overrides = appPkg.overrides || {}
for (const [n, p] of Object.entries(tarballs)) {
  if (n === 'create-barefootjs') continue
  appPkg.overrides[n] = `file:${p}`
}
writeFileSync(appPkgPath, JSON.stringify(appPkg, null, 2) + '\n')

run('npm install --no-audit --no-fund --loglevel=error', { cwd: appDir })

// ── 5. Smoke commands ──────────────────────────────────────────────
header('Smoke commands')

const failures = []

// `spawnSync` reports termination via `.status` (number) on a normal
// exit OR `.signal` (e.g. 'SIGSEGV', 'SIGKILL') when the process was
// killed. `status` is `null` in the signal case, which would render as
// "exit null" with no diagnostic info — surface the signal name when
// it's set so a kill is distinguishable from a non-zero exit.
function describeExit(r) {
  if (r.signal) return `signal ${r.signal}`
  return `exit ${r.status}`
}

function smoke(label, cmd, opts = {}) {
  console.log(`\n• ${label}`)
  console.log(`  $ ${cmd}`)
  const r = spawnSync(cmd, {
    cwd: appDir,
    shell: true,
    encoding: 'utf-8',
  })
  const ok = r.status === 0 && !r.signal &&
    (!opts.expect || (r.stdout ?? '').includes(opts.expect))
  if (!ok) {
    failures.push({
      label,
      cmd,
      status: r.status,
      signal: r.signal,
      expect: opts.expect,
      stdout: r.stdout,
      stderr: r.stderr,
    })
    console.log(`  ✗ failed (${describeExit(r)}${opts.expect ? `, expected "${opts.expect}"` : ''})`)
    const tail = (s) => (s ?? '').slice(-1200)
    if (r.stdout) console.log(`  stdout:\n${tail(r.stdout)}`)
    if (r.stderr) console.log(`  stderr:\n${tail(r.stderr)}`)
    return
  }
  console.log(`  ✓ ok`)
}

// Every line below targets a real failure mode caught (or catchable) by
// a tarball install. Add new entries here when a regression escapes
// into a release — this is the dogfood net.

// — bundled-resource access (the `bf tokens` regression class)
smoke('bf tokens', 'npx --no-install bf tokens', { expect: 'background' })
smoke('bf tokens --category colors', 'npx --no-install bf tokens --category colors', { expect: 'background' })
smoke('bf guide (list)', 'npx --no-install bf guide', { expect: 'quick-start' })
smoke('bf guide quick-start', 'npx --no-install bf guide quick-start', { expect: 'Counter' })

// — meta + registry-shaped commands (scaffold writes `meta/button.json`)
smoke('bf docs button', 'npx --no-install bf docs button', { expect: 'Category' })
smoke('bf search button (local)', 'npx --no-install bf search button')

// — compiler + analyzer
smoke('bf build', 'npx --no-install bf build', { expect: 'Build complete' })
smoke('bf debug graph Counter', 'npx --no-install bf debug graph Counter', { expect: 'count' })
smoke('bf debug trace Counter count', 'npx --no-install bf debug trace Counter count', { expect: 'count' })
// The dynamic profiler lazily imports happy-dom, whose CJS deps hit the
// bundle's `require` shim — broken ESM interop only surfaces from the
// published bundle, not `bun test` over src (#1871: "Dynamic require of
// node:events is not supported").
smoke(
  'bf debug profile Counter --scenario auto',
  'npx --no-install bf debug profile Counter --scenario auto',
  { expect: 'profile (scenario: auto)' },
)

// — generators
// `bf init` now scaffolds `components/Counter.test.tsx` alongside
// `components/Counter.tsx` (so the starter's `npm test` has something
// real to run). `bf gen test Counter` refuses to clobber that file by
// default, which is the correct policy — pass `--force` here to keep
// exercising the write path through this smoke entry, since that's
// what this line is actually testing. The companion `--stdout` mode
// is covered by the unit tests in packages/cli.
smoke('bf gen test Counter', 'npx --no-install bf gen test Counter --force', { expect: 'Counter.test.tsx' })
smoke('bf gen preview button', 'npx --no-install bf gen preview button')
smoke('bf gen component widget button', 'npx --no-install bf gen component widget button', { expect: 'components/ui/widget' })
smoke('bf preview (list after gen)', 'npx --no-install bf preview', { expect: 'button' })

// — full project build + test runner
smoke('npm run build', 'npm run build', { expect: 'Build complete' })
// `npm test` dispatches to whichever runner the scaffold picked (`bun
// test` on bun-detected installs, `vitest run` everywhere else). The
// matching `bf gen test`-emitted import was wired against the same
// runner, so the generated `Counter.test.tsx` runs cleanly under
// either path — exercise it through `npm test` so we don't lock the
// smoke to one runner.
smoke('npm test', 'npm test')

// ── 6. Summary ─────────────────────────────────────────────────────
header(failures.length === 0 ? 'PASS' : 'FAIL')
if (failures.length === 0) {
  console.log(`All smoke steps passed.`)
  if (!keepWorkspace) {
    rmSync(workspace, { recursive: true, force: true })
    rmSync(tarballDir, { recursive: true, force: true })
  } else {
    console.log(`Workspace kept: ${workspace}`)
    console.log(`Tarballs kept:  ${tarballDir}`)
  }
  process.exit(0)
}

console.log(`${failures.length} smoke step(s) failed:`)
for (const f of failures) {
  console.log(`  - ${f.label} (${describeExit(f)}${f.expect ? `, expected "${f.expect}"` : ''})`)
}
console.log(`\nWorkspace kept for inspection: ${workspace}`)
console.log(`Tarballs kept for inspection:  ${tarballDir}`)
process.exit(1)
