#!/usr/bin/env bun
// Write a bundled build's third-party license notices (#3271).
//
//   bun scripts/third-party-licenses.ts <bundle name> <out file> <metafile.json>...
//
// Run from the package directory the build ran in: metafile input paths
// are relative to it. See scripts/lib/third-party-licenses.ts.

import { writeFileSync } from 'node:fs'
import { bundledPackages, readMetafile, renderThirdPartyLicenses } from './lib/third-party-licenses'

const [bundleName, outFile, ...metafilePaths] = process.argv.slice(2)
if (!bundleName || !outFile || metafilePaths.length === 0) {
  console.error('usage: bun scripts/third-party-licenses.ts <bundle name> <out file> <metafile.json>...')
  process.exit(1)
}

const packages = bundledPackages(metafilePaths.map(readMetafile), process.cwd())
writeFileSync(outFile, renderThirdPartyLicenses(bundleName, packages))
console.log(`${outFile}: ${packages.map((p) => `${p.name}@${p.version}`).join(', ') || '(no third-party packages)'}`)
