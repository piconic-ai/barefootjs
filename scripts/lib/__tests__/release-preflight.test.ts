// What the release preflight refuses, and what it tells the operator.
// See scripts/lib/release-preflight.ts for the failure this guards against.
import { describe, expect, test } from 'bun:test'
import { type PreflightEntry, assessPreflight } from '../release-preflight'

const ctx = { repository: 'piconic-ai/barefootjs', workflow: 'release.yml', commit: '1cf54f7e' }

const present = { status: 'present' as const }
const missing = { status: 'missing' as const }
const unreachable = (reason: string) => ({ status: 'unknown' as const, reason })

const pebble = (over: Partial<PreflightEntry> = {}): PreflightEntry => ({
  name: '@barefootjs/pebble',
  version: '0.37.1',
  dir: 'packages/adapter-pebble',
  npm: present,
  jsr: present,
  ...over,
})

describe('assessPreflight', () => {
  test('every package present on npm and JSR → the release may proceed', () => {
    const report = assessPreflight(
      [pebble(), pebble({ name: 'create-barefootjs', dir: 'packages/create-barefootjs', jsr: null })],
      ctx,
    )
    expect(report.blocking).toBe(false)
    expect(report.missing).toEqual([])
    expect(report.text).toContain('all 2 npm packages and 1 JSR packages exist')
  })

  test('a package not on npm blocks, and the operator is told how to publish its first version by hand', () => {
    const report = assessPreflight([pebble({ npm: missing })], ctx)
    expect(report.blocking).toBe(true)
    expect(report.missing).toEqual(['@barefootjs/pebble'])
    // Nothing shipped, and a re-run is the whole recovery.
    expect(report.text).toContain('this run publishes nothing')
    expect(report.text).toContain('re-run this workflow')
    // The manual first publish, concrete enough to paste — including the
    // commit to do it from.
    expect(report.text).toContain('git checkout 1cf54f7e')
    expect(report.text).toContain('cd packages/adapter-pebble')
    expect(report.text).toContain('npm publish ./barefootjs-pebble-0.37.1.tgz --access public')
    // The trusted-publisher setup that lets the workflow take over — including
    // the permission whose absence produced "OIDC permission denied".
    expect(report.text).toContain('https://www.npmjs.com/package/@barefootjs/pebble/access')
    expect(report.text).toContain('repository: piconic-ai/barefootjs    workflow: release.yml')
    expect(report.text).toContain('"npm publish" permission')
    // The re-run skips a version already on npm, so the tag/release are manual too.
    expect(report.text).toContain("git tag '@barefootjs/pebble@0.37.1' 1cf54f7e && git push origin")
    expect(report.text).toContain("gh release create '@barefootjs/pebble@0.37.1'")
    // No JSR instructions when JSR is fine.
    expect(report.text).not.toContain('jsr.io/new')
  })

  test('a package not on JSR blocks, and the operator is told to create it (no manual publish needed)', () => {
    const report = assessPreflight([pebble({ jsr: missing })], ctx)
    expect(report.blocking).toBe(true)
    expect(report.text).toContain('https://jsr.io/new?scope=barefootjs&package=pebble')
    expect(report.text).toContain('https://jsr.io/@barefootjs/pebble/settings')
    expect(report.text).toContain('GitHub Repository: piconic-ai/barefootjs')
    expect(report.text).toContain('Nothing has to be published by hand on JSR')
    expect(report.text).not.toContain('npm publish ./')
  })

  test('missing on both registries → both sets of instructions, once each', () => {
    const report = assessPreflight([pebble({ npm: missing, jsr: missing })], ctx)
    expect(report.missing).toEqual(['@barefootjs/pebble'])
    expect(report.text.match(/npm — @barefootjs\/pebble is not on npm yet/g)).toHaveLength(1)
    expect(report.text.match(/JSR — @barefootjs\/pebble does not exist on JSR yet/g)).toHaveLength(1)
  })

  test('without a known commit (a by-hand run outside a checkout) the commands keep a visible placeholder', () => {
    const report = assessPreflight([pebble({ npm: missing })], { ...ctx, commit: undefined })
    expect(report.text).toContain('git checkout <the commit this run releases>')
    expect(report.text).toContain("git tag '@barefootjs/pebble@0.37.1' <the commit this run releases>")
  })

  test('a package that is not mirrored to JSR is never asked about JSR', () => {
    const cli = pebble({ name: '@barefootjs/cli', dir: 'packages/cli', jsr: null })
    expect(assessPreflight([cli], ctx).blocking).toBe(false)
  })

  test('a registry that could not be reached never blocks, but is reported as an unanswered check', () => {
    const report = assessPreflight(
      [pebble({ npm: unreachable('ETIMEDOUT registry.npmjs.org'), jsr: unreachable('HTTP 503') })],
      ctx,
    )
    expect(report.blocking).toBe(false)
    expect(report.text).toContain('Could not reach a registry for 2 check(s)')
    expect(report.text).toContain('NOT treated as missing')
    expect(report.text).toContain('@barefootjs/pebble  npm: ETIMEDOUT registry.npmjs.org')
    expect(report.text).toContain('@barefootjs/pebble  jsr: HTTP 503')
  })

  test('one missing package blocks even when another check was unreachable', () => {
    const report = assessPreflight(
      [pebble({ npm: missing }), pebble({ name: '@barefootjs/jsx', dir: 'packages/jsx', npm: unreachable('HTTP 502') })],
      ctx,
    )
    expect(report.blocking).toBe(true)
    expect(report.missing).toEqual(['@barefootjs/pebble'])
    expect(report.text).toContain('Could not reach a registry for 1 check(s)')
  })
})
