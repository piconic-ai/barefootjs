#!/usr/bin/env bun
//
// Ask the registries whether the versions on main are actually installable.
//
// Two release failures motivated this, and neither produced a red check,
// because in both cases the pipeline believed it had succeeded:
//
//   - changesets/action decides whether to publish from whether `.changeset/`
//     is empty. A changeset landing on main between the Version PR being
//     refreshed and merged turns that merge into another version PR; the run
//     goes green having released nothing, and every native-registry job (all
//     gated on `published == 'true'`) skips with it. 0.30.1 was bumped on main
//     and published nowhere this way.
//   - PAUSE writes its per-module "Successfully indexed" lines BEFORE
//     committing the index transaction, so they survive a rollback. The
//     BarefootJS-0.30.0 report listed four modules as indexed while 02packages
//     kept pointing at 0.29.0.
//
// So don't model the pipeline — ask the registries what is there.
//
// Every registry a release touches is checked, and the reasons differ:
//
//   CPAN, Packagist    "accepted" does not mean "live". cpan-upload returns
//                      once PAUSE takes the tarball and a separate indexer
//                      cron writes 02packages later; the Packagist jobs push
//                      a subtree split and POST to an update API that only
//                      asks Packagist to crawl. Neither failure turns
//                      anything red. PAUSE at least mails a report — though
//                      it is the report that said "Successfully indexed" for
//                      four modules whose index transaction had rolled back.
//
//   npm, JSR, PyPI,    Uploads are synchronous, so a failure is a failed
//   RubyGems, crates   step and the job goes red. That was once the argument
//                      for leaving them out of here. It was wrong: the gem
//                      sat at 0.25.0 for eleven releases while
//                      rubygems-release went red on every one of them, and
//                      nobody noticed (#2521). Red is not the same as
//                      noticed, and a check nobody reads is worth less than
//                      one that answers the whole question.
//
// Run it by hand after a release:
//
//   bun scripts/verify-released.ts          every registry
//   bun scripts/verify-released.ts --npm    npm only; no perl needed
//
// Exit: 0 everything live, 1 something is not released, 2 could not tell.
// Nothing consumes these programmatically today — release.yml's fallback
// publish, which did, was reverted in #2517. Keep 1 and 2 apart anyway: a
// registry that could not be reached has told you nothing, and reporting
// that as "not published" is how a check like this trains people to ignore
// it.

import { resolve } from 'node:path'
import { $ } from 'bun'

const repoRoot = resolve(import.meta.dir, '..')
const npmOnly = process.argv.includes('--npm')

// npm package -> Perl dist. The module list per dist is deliberately NOT here:
// it comes from Module::Metadata, the same call Makefile.PL makes to build
// META's `provides` and therefore the same input PAUSE indexes from, so a
// package added to a dist is checked instead of silently unverified.
const CPAN_DISTS = [
  { npm: '@barefootjs/perl', dir: 'packages/adapter-perl' },
  { npm: '@barefootjs/xslate', dir: 'packages/adapter-xslate' },
  { npm: '@barefootjs/mojolicious', dir: 'packages/adapter-mojolicious' },
]

// npm package -> Packagist package. The tag the release job pushes is
// `v<version>`, which is the version Packagist records.
const PACKAGIST = [
  { npm: '@barefootjs/twig', dir: 'packages/adapter-twig', composer: 'barefootjs/twig' },
  { npm: '@barefootjs/blade', dir: 'packages/adapter-blade', composer: 'barefootjs/blade' },
  { npm: '@barefootjs/php', dir: 'packages/adapter-php', composer: 'barefootjs/php' },
]

// npm package -> a registry that publishes synchronously, with the URL that
// answers "is this exact version there?" — 404 when it is not. These need no
// dist directory: one npm package maps to one artifact.
const SYNC_REGISTRIES = [
  {
    registry: 'PyPI' as const,
    npm: '@barefootjs/jinja',
    subject: 'barefootjs',
    url: (v: string) => `https://pypi.org/pypi/barefootjs/${v}/json`,
  },
  {
    registry: 'RubyGems' as const,
    npm: '@barefootjs/erb',
    subject: 'barefoot_js',
    url: (v: string) => `https://rubygems.org/api/v2/rubygems/barefoot_js/versions/${v}.json`,
  },
  {
    registry: 'crates.io' as const,
    npm: '@barefootjs/rust',
    subject: 'barefootjs',
    url: (v: string) => `https://crates.io/api/v1/crates/barefootjs/${v}`,
  },
]

// JSR is deliberately absent. Checking it means knowing which packages are
// eligible, and that rule lives in scripts/jsr-publish.ts: scoped, not
// private, not in the ignore list, *not a `bin` package*, and — further down —
// dropped when its exports resolve to nothing publishable. Restating it here
// is the same duplication that let rubygems-release drift for eleven releases,
// and getting it wrong is worse than not checking: a first attempt reported
// @barefootjs/perl, /php and /cli as missing when they are simply not
// published there. Asking JSR what the scope contains would sidestep the rule
// entirely, but api.jsr.io is not reachable from here, so that path could not
// be tested — and shipping an untested check is how this file's own history
// went wrong. Left out until it can be written against something verifiable.
const UA = 'barefootjs-verify-released (https://github.com/piconic-ai/barefootjs)'

interface Problem {
  registry: 'npm' | 'PyPI' | 'RubyGems' | 'crates.io' | 'CPAN' | 'Packagist'
  subject: string
  expected: string
  found: string
}

/**
 * `null` means the registry answered "no such thing" (404). Anything else that
 * is not a success throws, and the caller turns that into exit 2 rather than a
 * verdict — see the exit-code note above.
 *
 * curl rather than fetch: it matches how changeset-publish.ts already reaches
 * the registry (`npm view`), and it keeps working behind an HTTP(S) proxy,
 * which Bun's fetch does not reliably traverse.
 */
async function httpGet(url: string): Promise<string | null> {
  // crates.io rejects requests without a User-Agent, so every call carries one.
  const r = await $`curl -sS --max-time 30 -A ${UA} -w ${'\n%{http_code}'} ${url}`.quiet().nothrow()
  if (r.exitCode !== 0) throw new Error(`GET ${url}: ${r.stderr.toString().trim()}`)
  const out = r.text()
  const split = out.lastIndexOf('\n')
  const status = Number(out.slice(split + 1).trim())
  if (status === 404) return null
  if (status < 200 || status >= 300) throw new Error(`GET ${url}: HTTP ${status}`)
  return out.slice(0, split)
}

/** Everything Changesets publishes: non-private, not in its ignore list. */
async function publishable(): Promise<{ name: string; version: string }[]> {
  const ignored: string[] =
    (await Bun.file(resolve(repoRoot, '.changeset/config.json')).json()).ignore ?? []

  const targets: { name: string; version: string }[] = []
  for (const rel of [...new Bun.Glob('packages/*/package.json').scanSync(repoRoot)].sort()) {
    const pkg = await Bun.file(resolve(repoRoot, rel)).json()
    if (pkg.private || ignored.includes(pkg.name)) continue
    targets.push({ name: pkg.name, version: pkg.version })
  }
  if (targets.length === 0) throw new Error('No publishable packages found — the glob is wrong')
  return targets
}

async function checkNpm(): Promise<Problem[]> {
  const targets = await publishable()
  console.log(`npm — checking ${targets.length} packages`)
  const found: Problem[] = []
  await Promise.all(
    targets.map(async ({ name, version }) => {
      // The version endpoint answers in a few hundred bytes; a packument for a
      // long-lived package is megabytes, and this runs on every release.
      if ((await httpGet(`https://registry.npmjs.org/${name}/${version}`)) !== null) return
      const latest = await httpGet(`https://registry.npmjs.org/${name}/latest`)
      found.push({
        registry: 'npm',
        subject: name,
        expected: version,
        found:
          latest === null
            ? 'not on npm at all'
            : `latest published ${(JSON.parse(latest) as { version: string }).version}`,
      })
    }),
  )
  return found
}

async function checkSyncRegistries(): Promise<Problem[]> {
  const versionOf = async (npm: string) => {
    const dir = npm.replace('@barefootjs/', 'packages/adapter-')
    return (await Bun.file(resolve(repoRoot, dir, 'package.json')).json()).version as string
  }

  console.log(`PyPI / RubyGems / crates.io — checking ${SYNC_REGISTRIES.length} packages`)
  const found: Problem[] = []
  await Promise.all(
    SYNC_REGISTRIES.map(async ({ registry, npm, subject, url }) => {
      const version = await versionOf(npm)
      if ((await httpGet(url(version))) !== null) return
      found.push({ registry, subject: `${subject} (${npm})`, expected: version, found: 'not published' })
    }),
  )
  return found
}

async function checkCpan(): Promise<Problem[]> {
  const perl = async (script: string, args: string[] = [], cwd = repoRoot) => {
    const r = await $`perl -e ${script} ${args}`.cwd(cwd).quiet().nothrow()
    return r
  }

  const found: Problem[] = []
  for (const { npm, dir } of CPAN_DISTS) {
    const version: string = (await Bun.file(resolve(repoRoot, dir, 'package.json')).json()).version

    const r = await perl(
      'use Module::Metadata; use JSON::PP;' +
        'my $p = Module::Metadata->provides(version => 2, dir => "lib");' +
        'print JSON::PP->new->canonical->encode([sort keys %$p]);',
      [],
      resolve(repoRoot, dir),
    )
    if (r.exitCode !== 0) throw new Error(`Module::Metadata failed in ${dir}: ${r.stderr.toString().trim()}`)
    const modules: string[] = JSON.parse(r.text())

    console.log(`CPAN — ${npm} @ ${version}: checking ${modules.length} modules`)
    for (const module of modules) {
      // cpanmetadb serves 02packages — the file that decides what `cpanm Foo`
      // installs, and the file PAUSE failed to write in the 0.30.0 incident.
      // MetaCPAN is a downstream view of it and lags.
      const body = await httpGet(`https://cpanmetadb.plackperl.org/v1.0/package/${module}`)
      const indexed = body?.match(/^version:\s*(\S+)$/m)?.[1] ?? null
      if (indexed === null) {
        found.push({ registry: 'CPAN', subject: module, expected: version, found: 'not indexed' })
        continue
      }
      // One release wears three hats — "0.30.2" in the .pm literal, "v0.30.2"
      // in META/02packages, "0.030002" in PAUSE's numified form. Compare
      // through the parser that defines them.
      //
      // `use version` is belt and braces: version:: is bootstrapped into the
      // interpreter, so `version->parse` resolves even though version.pm is
      // not in %INC, but nothing here should rest on that. 0 and 1 are the
      // only answers — anything else (a die on unparseable input, say) is not
      // a verdict, so it throws to exit 2 rather than reporting drift, the
      // same rule httpGet follows.
      const same = await perl(
        'use version; exit(version->parse($ARGV[0]) == version->parse($ARGV[1]) ? 0 : 1)',
        [indexed, version],
      )
      if (same.exitCode !== 0 && same.exitCode !== 1) {
        throw new Error(
          `comparing ${module} ${indexed} against ${version}: ${same.stderr.toString().trim()}`,
        )
      }
      if (same.exitCode === 1) {
        found.push({ registry: 'CPAN', subject: module, expected: version, found: `indexed at ${indexed}` })
      }
    }
  }
  return found
}

async function checkPackagist(): Promise<Problem[]> {
  const found: Problem[] = []
  console.log(`Packagist — checking ${PACKAGIST.length} packages`)
  for (const { npm, dir, composer } of PACKAGIST) {
    const version: string = (await Bun.file(resolve(repoRoot, dir, 'package.json')).json()).version
    const body = await httpGet(`https://repo.packagist.org/p2/${composer}.json`)
    const versions: string[] =
      body === null
        ? []
        : (Object.values((JSON.parse(body) as { packages: Record<string, { version: string }[]> }).packages)
            .flat()
            .map((v) => v.version) ?? [])
    if (versions.includes(`v${version}`)) continue
    found.push({
      registry: 'Packagist',
      subject: `${composer} (${npm})`,
      expected: `v${version}`,
      found: versions.length ? `newest published ${versions[0]}` : 'nothing published',
    })
  }
  return found
}

let problems: Problem[]
try {
  problems = [
    ...(await checkNpm()),
    ...(npmOnly
      ? []
      : [
          ...(await checkSyncRegistries()),
          ...(await checkCpan()),
          ...(await checkPackagist()),
        ]),
  ]
} catch (err) {
  console.error(`\nCould not determine release state: ${err instanceof Error ? err.message : err}`)
  process.exit(2)
}

if (problems.length === 0) {
  console.log('\nEverything on main is live on its registry.')
  process.exit(0)
}

console.error(`\n${problems.length} version(s) on main are not released:\n`)
for (const p of problems) {
  console.error(`  ${p.registry.padEnd(9)}  ${p.subject}`)
  console.error(`             main says ${p.expected} — ${p.found}`)
}

if (problems.some((p) => ['PyPI', 'RubyGems', 'crates.io'].includes(p.registry))) {
  console.error(
    '\nPyPI / RubyGems / crates.io: these publish synchronously, so the job\n' +
      'went red when it failed — read its log rather than guessing. Re-running\n' +
      'the failed job on the release run retries at the same SHA. If a version\n' +
      'is missing across several releases the job has been failing that whole\n' +
      'time; that is how barefoot_js sat at 0.25.0 for eleven of them.',
  )
}

if (problems.some((p) => p.registry === 'Packagist')) {
  console.error(
    '\nPackagist: the release job pushes the subtree split and its tag, then\n' +
      'POSTs to the update API — which only asks Packagist to crawl. Check that\n' +
      'the tag exists on the split repository first; if it does, re-trigger the\n' +
      'crawl from the package page. Nothing here needs a version bump.',
  )
}

if (problems.some((p) => p.registry === 'CPAN')) {
  console.error(
    '\nCPAN: uploading is not indexing. cpan-upload returns as soon as PAUSE\n' +
      'accepts the tarball; the module becomes installable only once the\n' +
      'indexer writes 02packages, which can lag an hour and can fail on its own\n' +
      '(a rolled-back transaction still mails "Successfully indexed"). Right\n' +
      'after a release, re-run later. If it persists, read the PAUSE report —\n' +
      'one module stuck while its siblings moved usually means META `provides`\n' +
      'gave it no version, which PAUSE reads as a decreasing version number.\n' +
      'PAUSE rejects a re-upload of the same version, so this needs a human:\n' +
      'force a reindex, or ship the next patch.',
  )
}

process.exit(1)
