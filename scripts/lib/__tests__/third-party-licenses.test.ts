// Third-party license notices for bundled builds (#3271). The package list
// must come from what the bundler actually read, so the end-to-end case
// bundles @barefootjs/xyflow the way its `build:js` script does and checks
// the notice names every inlined package — and nothing that stays external.
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type BuildMetafile, bundledPackages, packageRootOf, renderThirdPartyLicenses } from '../third-party-licenses'

const repoRoot = join(import.meta.dir, '..', '..', '..')

describe('packageRootOf', () => {
  test('finds the package directory after the last node_modules', () => {
    expect(packageRootOf('node_modules/.bun/d3-zoom@3.0.0/node_modules/d3-zoom/src/zoom.js')).toBe(
      'node_modules/.bun/d3-zoom@3.0.0/node_modules/d3-zoom',
    )
    expect(packageRootOf('../../node_modules/d3-zoom/src/zoom.js')).toBe('../../node_modules/d3-zoom')
  })

  test('keeps both segments of a scoped name', () => {
    expect(
      packageRootOf('node_modules/.bun/@xyflow+system@0.0.76/node_modules/@xyflow/system/dist/esm/index.js'),
    ).toBe('node_modules/.bun/@xyflow+system@0.0.76/node_modules/@xyflow/system')
  })

  test('a source file of the package being built is not a dependency', () => {
    expect(packageRootOf('src/store.ts')).toBeNull()
  })
})

describe('@barefootjs/xyflow bundle', () => {
  test('the notice covers every inlined package and no external one', async () => {
    const xyflowDir = join(repoRoot, 'packages', 'xyflow')
    const pkg = JSON.parse(readFileSync(join(xyflowDir, 'package.json'), 'utf8'))
    // Same entry and externals as the package's `build:js` script.
    const externals = [...String(pkg.scripts['build:js']).matchAll(/--external '([^']+)'/g)].map((m) => m[1])
    expect(externals).toContain('@barefootjs/client')
    const result = await Bun.build({
      entrypoints: [join(xyflowDir, 'src', 'index.ts')],
      external: externals,
      format: 'esm',
      metafile: true,
    } as Parameters<typeof Bun.build>[0])
    expect(result.success).toBe(true)
    const metafile = (result as unknown as { metafile: BuildMetafile }).metafile

    const packages = bundledPackages([metafile], process.cwd())
    expect(packages.map((p) => p.name)).toEqual([
      '@xyflow/system',
      'd3-color',
      'd3-dispatch',
      'd3-drag',
      'd3-ease',
      'd3-interpolate',
      'd3-selection',
      'd3-timer',
      'd3-transition',
      'd3-zoom',
    ])
    const license = Object.fromEntries(packages.map((p) => [p.name, p.license]))
    expect(license['@xyflow/system']).toBe('MIT')
    expect(license['d3-ease']).toBe('BSD-3-Clause')
    expect(license['d3-zoom']).toBe('ISC')

    const notice = renderThirdPartyLicenses('@barefootjs/xyflow', packages)
    for (const p of packages) {
      expect(notice).toContain(`${p.name}@${p.version} (${p.license})`)
      expect(notice).toContain(p.licenseText)
    }
    expect(notice).toContain('Copyright (c) 2019-2025 webkid GmbH')
  })
})

describe('bundledPackages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'third-party-licenses-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  function fakePackage(name: string, files: Record<string, string>) {
    const root = join(dir, 'node_modules', name)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name, version: '1.0.0', license: 'MIT' }))
    for (const [file, text] of Object.entries(files)) writeFileSync(join(root, file), text)
  }

  test('accepts LICENSE.md / LICENCE spellings and dedupes repeated inputs', () => {
    fakePackage('with-md', { 'LICENSE.md': 'md text' })
    fakePackage('with-licence', { LICENCE: 'licence text' })
    const packages = bundledPackages(
      [
        {
          inputs: {
            'node_modules/with-md/a.js': {},
            'node_modules/with-md/b.js': {},
            'node_modules/with-licence/index.js': {},
            'src/own.ts': {},
          },
        },
      ],
      dir,
    )
    expect(packages.map((p) => [p.name, p.licenseText])).toEqual([
      ['with-licence', 'licence text'],
      ['with-md', 'md text'],
    ])
  })

  test('fails loudly when a bundled package has no license file', () => {
    fakePackage('no-license', {})
    expect(() => bundledPackages([{ inputs: { 'node_modules/no-license/index.js': {} } }], dir)).toThrow(
      /no-license@1\.0\.0 is bundled but has no license file/,
    )
  })
})
