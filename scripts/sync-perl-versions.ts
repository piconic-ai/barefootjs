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

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const PACKAGES = [
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
  },
  {
    dir: 'packages/adapter-xslate',
    modules: [
      'lib/BarefootJS/Backend/Xslate.pm',
    ],
  },
];

const today = new Date().toISOString().slice(0, 10);

for (const pkg of PACKAGES) {
  const pkgDir = join(ROOT, pkg.dir);

  const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

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
