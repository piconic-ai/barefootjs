#!/usr/bin/env bun
//
// Sync Perl $VERSION and Changes files from package.json versions.
//
// Run after `bunx changeset version` so that Perl dists stay in lockstep
// with the npm packages that share the same package directory.
//
// For each entry in PACKAGES:
//   1. Read the bumped version from package.json.
//   2. Update `our $VERSION` in the main Perl module.
//   3. Replace the {{$NEXT}} placeholder in Changes with the new version + date.

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;

const PACKAGES = [
  {
    dir: 'packages/adapter-perl',
    mainModule: 'lib/BarefootJS.pm',
  },
  {
    dir: 'packages/adapter-mojolicious',
    mainModule: 'lib/Mojolicious/Plugin/BarefootJS.pm',
  },
  {
    dir: 'packages/adapter-xslate',
    mainModule: 'lib/BarefootJS/Backend/Xslate.pm',
  },
];

const today = new Date().toISOString().slice(0, 10);

for (const pkg of PACKAGES) {
  const pkgDir = join(ROOT, pkg.dir);

  const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

  // Update $VERSION in the main Perl module.
  const modulePath = join(pkgDir, pkg.mainModule);
  const moduleSource = readFileSync(modulePath, 'utf8');
  const updatedModule = moduleSource.replace(
    /^our \$VERSION = ".+?";/m,
    `our $VERSION = "${version}";`,
  );
  if (updatedModule === moduleSource) {
    console.warn(`[warn] $VERSION not updated in ${pkg.mainModule} — pattern not found`);
  } else {
    writeFileSync(modulePath, updatedModule);
    console.log(`Updated $VERSION → ${version} in ${pkg.mainModule}`);
  }

  // Replace {{$NEXT}} in Changes with the versioned entry.
  const changesPath = join(pkgDir, 'Changes');
  const changesSource = readFileSync(changesPath, 'utf8');
  const updatedChanges = changesSource.replace('{{$NEXT}}', `${version} - ${today}`);
  if (updatedChanges === changesSource) {
    console.warn(`[warn] {{$NEXT}} not found in ${pkg.dir}/Changes — already replaced?`);
  } else {
    writeFileSync(changesPath, updatedChanges);
    console.log(`Updated Changes → ${version} - ${today} in ${pkg.dir}/Changes`);
  }
}
