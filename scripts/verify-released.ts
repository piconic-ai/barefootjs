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
// So don't model the pipeline — ask npm and CPAN what is there.
//
// Two modes:
//
//   --npm    what release.yml runs to decide whether to publish. npm is
//            synchronous, so "main is ahead of npm" is actionable at once, and
//            acting on it is what makes releases independent of merge order.
//   (full)   adds the two registries where "accepted" does not mean "live",
//            because publishing to them is fire-and-forget:
//
//              CPAN       cpan-upload returns once PAUSE takes the tarball;
//                         a separate indexer cron writes 02packages later,
//                         and can fail on its own.
//              Packagist  the job pushes a subtree split and POSTs to the
//                         update API; Packagist then crawls the tag whenever
//                         it gets round to it.
//
//            Neither failure turns anything red. PAUSE at least mails a
//            report — though it is the report that said "Successfully indexed"
//            for four modules whose index transaction had rolled back —
//            while Packagist says nothing at all. Run by hand after a release:
//
//              bun scripts/verify-released.ts
//
//            PyPI, RubyGems, crates.io and JSR are deliberately absent. Their
//            uploads are synchronous, so a failure is a failed step and
//            already red; there is no state for a check to catch.
//
// Exit: 0 everything live, 1 something is not released, 2 could not tell.
// 1 and 2 are distinct because exit 1 triggers a publish in release.yml — a
// registry outage must not be able to read as "not published" and provoke one.

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

interface Problem {
  registry: 'npm' | 'CPAN' | 'Packagist'
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
  const r = await $`curl -sS --max-time 30 -w ${'\n%{http_code}'} ${url}`.quiet().nothrow()
  if (r.exitCode !== 0) throw new Error(`GET ${url}: ${r.stderr.toString().trim()}`)
  const out = r.text()
  const split = out.lastIndexOf('\n')
  const status = Number(out.slice(split + 1).trim())
  if (status === 404) return null
  if (status < 200 || status >= 300) throw new Error(`GET ${url}: HTTP ${status}`)
  return out.slice(0, split)
}

async function checkNpm(): Promise<Problem[]> {
  const ignored: string[] =
    (await Bun.file(resolve(repoRoot, '.changeset/config.json')).json()).ignore ?? []

  const targets: { name: string; version: string }[] = []
  for (const rel of [...new Bun.Glob('packages/*/package.json').scanSync(repoRoot)].sort()) {
    const pkg = await Bun.file(resolve(repoRoot, rel)).json()
    if (pkg.private || ignored.includes(pkg.name)) continue
    targets.push({ name: pkg.name, version: pkg.version })
  }
  if (targets.length === 0) throw new Error('No publishable packages found — the glob is wrong')

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
    ...(npmOnly ? [] : [...(await checkCpan()), ...(await checkPackagist())]),
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
