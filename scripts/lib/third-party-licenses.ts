// Third-party license notices for a bundled build (#3271).
//
// A package whose build inlines its dependencies (`bun build` without
// `--external`) ships their code without their packages, so their
// LICENSE files never reach consumers. This reads the build's metafile
// (`bun build --metafile`), finds every npm package the bundle drew from,
// and renders one notice file with each package's name, version, license
// field and full LICENSE text. The package list comes from what the
// bundler actually read, not from `dependencies`, so it cannot drift from
// the bundle.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface BundledPackage {
  name: string
  version: string
  license: string
  licenseText: string
}

/** The `inputs` part of a `bun build --metafile` JSON file. */
export interface BuildMetafile {
  inputs: Record<string, unknown>
}

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i

/**
 * The package root an input path belongs to: the directory after the last
 * `node_modules/` (two segments for a scoped name), or `null` for a source
 * file of the package being built.
 */
export function packageRootOf(inputPath: string): string | null {
  const parts = inputPath.split('/')
  const at = parts.lastIndexOf('node_modules')
  if (at === -1 || at + 1 >= parts.length) return null
  const nameLength = parts[at + 1].startsWith('@') ? 2 : 1
  return parts.slice(0, at + 1 + nameLength).join('/')
}

/**
 * Every npm package the bundle read from, sorted by name. `baseDir` is the
 * directory the build ran in (metafile input paths are relative to it).
 * Throws when a bundled package has no license file, so a missing notice
 * fails the build instead of shipping silently.
 */
export function bundledPackages(metafiles: BuildMetafile[], baseDir: string): BundledPackage[] {
  const roots = new Set<string>()
  for (const metafile of metafiles) {
    for (const input of Object.keys(metafile.inputs)) {
      const root = packageRootOf(input)
      if (root) roots.add(resolve(baseDir, root))
    }
  }

  const byName = new Map<string, BundledPackage>()
  for (const root of roots) {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const licenseFile = readdirSync(root).find((f) => LICENSE_FILE.test(f))
    if (!licenseFile) {
      throw new Error(`${pkg.name}@${pkg.version} is bundled but has no license file in ${root}`)
    }
    const key = `${pkg.name}@${pkg.version}`
    byName.set(key, {
      name: pkg.name,
      version: pkg.version,
      license: typeof pkg.license === 'string' ? pkg.license : 'UNKNOWN',
      licenseText: readFileSync(join(root, licenseFile), 'utf8').trim(),
    })
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
}

/** The notice file's text. */
export function renderThirdPartyLicenses(bundleName: string, packages: BundledPackage[]): string {
  const header = [
    `${bundleName} bundles code from the following packages.`,
    'Their license notices are reproduced below.',
  ].join('\n')
  const sections = packages.map((p) =>
    [`${'-'.repeat(72)}`, `${p.name}@${p.version} (${p.license})`, `${'-'.repeat(72)}`, '', p.licenseText].join('\n'),
  )
  return `${[header, ...sections].join('\n\n')}\n`
}

/** Read a `bun build --metafile` JSON file. */
export function readMetafile(path: string): BuildMetafile {
  if (!existsSync(path)) throw new Error(`metafile not found: ${path}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}
