// The publish set is derived from the checkout, not hand-listed. These pin
// what "derived" means against the real workspace, so a new package is
// published (and preflighted) without anyone remembering to register it —
// and so the JSR mirror keeps excluding the packages that live elsewhere.
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { discoverJsrPackages } from '../jsr-packages'
import { npmPublishablePackages } from '../npm-packages'
import { changesetIgnoreList, workspacePackages } from '../workspace-packages'

const repoRoot = resolve(import.meta.dir, '../../..')

describe('npm publish set', () => {
  const published = npmPublishablePackages(repoRoot)
  const names = published.map(p => p.pkg.name)

  test('is every non-private workspace package Changesets does not ignore — nothing more, nothing less', () => {
    const ignore = changesetIgnoreList(repoRoot)
    const expected = workspacePackages(repoRoot)
      .filter(({ pkg }) => !pkg.private && !ignore.includes(pkg.name))
      .map(({ pkg }) => pkg.name)
      .sort()
    expect([...names].sort()).toEqual(expected)
    expect(names).toContain('@barefootjs/pebble')
    expect(names).not.toContain('@barefootjs/adapter-tests')
    expect(names).not.toContain('@barefootjs/compat')
  })

  test('lists a package after every workspace package it depends on', () => {
    const position = new Map(names.map((n, i) => [n, i]))
    for (const { pkg } of published) {
      for (const dep of Object.keys(pkg.dependencies ?? {})) {
        if (!position.has(dep)) continue
        expect(position.get(dep)!, `${pkg.name} must come after its dependency ${dep}`).toBeLessThan(
          position.get(pkg.name)!,
        )
      }
    }
  })

  test('lists each package exactly once', () => {
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('JSR mirror set', () => {
  const { jsrPublishable } = discoverJsrPackages(repoRoot)
  const npmNames = new Set(npmPublishablePackages(repoRoot).map(p => p.pkg.name))

  test('is a subset of the npm set (so the preflight can join the two)', () => {
    for (const name of jsrPublishable) expect(npmNames.has(name), `${name} on JSR but not npm`).toBe(true)
  })

  test('excludes executables and runtimes published to other registries', () => {
    // bin packages run via `npm:`; perl/php ship their runtime to CPAN/Packagist
    // and have no TS exports for JSR to publish.
    for (const name of ['@barefootjs/cli', 'create-barefootjs', '@barefootjs/perl', '@barefootjs/php']) {
      expect(jsrPublishable.has(name), `${name} must not be mirrored to JSR`).toBe(false)
    }
  })

  test('includes the TypeScript adapters', () => {
    for (const name of ['@barefootjs/pebble', '@barefootjs/hono', '@barefootjs/client']) {
      expect(jsrPublishable.has(name), `${name} must be mirrored to JSR`).toBe(true)
    }
  })
})
