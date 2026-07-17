#!/usr/bin/env bun
//
// Sync Perl $VERSION and Changes files from package.json versions.
//
// Run after `bunx changeset version` so that Perl dists stay in lockstep
// with the npm packages that share the same package directory.
//
// For each entry in PACKAGES:
//   1. Read the bumped version from package.json.
//   2. Update `our $VERSION` in every Perl module listed under `modules`.
//   3. Insert the versioned entry immediately after {{$NEXT}} in Changes,
//      keeping the placeholder in place for the next release cycle.
//   4. Pin each cpanfile dependency listed under `cpanfileRequires` to the
//      same release. Never loosen this: generated templates call
//      same-release BarefootJS runtime methods (#2305), and the fixed
//      changeset group guarantees the same-version dist exists on CPAN.

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

interface PerlPackage {
  dir: string;
  modules: string[];
  /** cpanfile deps whose version floor tracks this dist's own release. */
  cpanfileRequires?: string[];
}

const PACKAGES: PerlPackage[] = [
  {
    dir: 'packages/adapter-perl',
    modules: [
      'lib/BarefootJS.pm',
      'lib/BarefootJS/DevReload.pm',
    ],
  },
  {
    dir: 'packages/adapter-mojolicious',
    modules: [
      'lib/Mojolicious/Plugin/BarefootJS.pm',
      'lib/BarefootJS/Backend/Mojo.pm',
      'lib/Mojolicious/Plugin/BarefootJS/DevReload.pm',
    ],
    cpanfileRequires: ['BarefootJS'],
  },
  {
    dir: 'packages/adapter-xslate',
    modules: [
      'lib/BarefootJS/Backend/Xslate.pm',
    ],
    cpanfileRequires: ['BarefootJS'],
  },
];

const today = new Date().toISOString().slice(0, 10);

for (const pkg of PACKAGES) {
  const pkgDir = join(ROOT, pkg.dir);

  const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

  // Skip if the primary module already reflects the target version — this
  // package was not bumped in the current release cycle.
  const primaryPath = join(pkgDir, pkg.modules[0]);
  const primarySource = readFileSync(primaryPath, 'utf8');
  const currentVersionMatch = primarySource.match(/^our \$VERSION = "(.+?)";/m);
  if (currentVersionMatch?.[1] === version) {
    console.log(`Skipping ${pkg.dir} — already at ${version}`);
    continue;
  }

  // Update $VERSION in every Perl module belonging to this dist.
  for (const mod of pkg.modules) {
    const modulePath = join(pkgDir, mod);
    const source = readFileSync(modulePath, 'utf8');
    const updated = source.replace(
      /^our \$VERSION = ".+?";/m,
      `our $VERSION = "${version}";`,
    );
    if (updated === source) {
      console.warn(`[warn] $VERSION not updated in ${mod} — pattern not found`);
    } else {
      writeFileSync(modulePath, updated);
      console.log(`Updated $VERSION → ${version} in ${mod}`);
    }
  }

  // Pin cpanfile dependency floors to this release (step 4 above).
  if (pkg.cpanfileRequires?.length) {
    const cpanfilePath = join(pkgDir, 'cpanfile');
    let cpanfile = readFileSync(cpanfilePath, 'utf8');
    for (const dep of pkg.cpanfileRequires) {
      const pattern = new RegExp(`^requires '${dep}'.*;$`, 'm');
      if (!pattern.test(cpanfile)) {
        console.warn(`[warn] requires '${dep}' not found in ${pkg.dir}/cpanfile — skipping`);
        continue;
      }
      cpanfile = cpanfile.replace(pattern, `requires '${dep}', '${version}';`);
      console.log(`Updated cpanfile requires ${dep} → ${version} in ${pkg.dir}`);
    }
    writeFileSync(cpanfilePath, cpanfile);
  }

  // Insert the versioned entry immediately after {{$NEXT}}, keeping the
  // placeholder in place so it is ready for the next release cycle.
  const changesPath = join(pkgDir, 'Changes');
  const source = readFileSync(changesPath, 'utf8');
  if (!source.includes('{{$NEXT}}')) {
    console.warn(`[warn] {{$NEXT}} not found in ${pkg.dir}/Changes — skipping`);
    continue;
  }
  const updated = source.replace('{{$NEXT}}', `{{$NEXT}}\n\n${version} - ${today}`);
  writeFileSync(changesPath, updated);
  console.log(`Updated Changes → ${version} - ${today} in ${pkg.dir}/Changes`);
}
