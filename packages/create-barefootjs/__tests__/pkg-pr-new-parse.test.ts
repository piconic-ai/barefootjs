// Unit test for the pkg.pr.new detector in create-barefootjs. The
// detector reads its own `dependencies['@barefootjs/cli']` and, when
// that value is a pkg.pr.new URL, extracts the base + ref so init can
// rewrite the generated app's `@barefootjs/*: "latest"` entries to the
// same SHA. Under a normal npm install (post-publish) the dep is a
// semver string and the parse returns null — init then leaves "latest"
// alone, which resolves from the npm registry as expected.

import { describe, test, expect } from 'bun:test'
import { parsePkgPrNewCliDep } from '../src/index'

describe('parsePkgPrNewCliDep', () => {
  test('extracts base + ref from a SHA-pinned pkg.pr.new URL', () => {
    expect(
      parsePkgPrNewCliDep(
        'https://pkg.pr.new/piconic-ai/barefootjs/@barefootjs/cli@a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      ),
    ).toEqual({
      base: 'https://pkg.pr.new/piconic-ai/barefootjs',
      ref: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    })
  })

  test('accepts a short SHA', () => {
    expect(
      parsePkgPrNewCliDep('https://pkg.pr.new/piconic-ai/barefootjs/@barefootjs/cli@abc1234'),
    ).toEqual({
      base: 'https://pkg.pr.new/piconic-ai/barefootjs',
      ref: 'abc1234',
    })
  })

  test('accepts a PR number as the ref (pkg.pr.new emits this form too)', () => {
    expect(
      parsePkgPrNewCliDep('https://pkg.pr.new/piconic-ai/barefootjs/@barefootjs/cli@1433'),
    ).toEqual({
      base: 'https://pkg.pr.new/piconic-ai/barefootjs',
      ref: '1433',
    })
  })

  test('returns null for a normal semver dep (post-publish path)', () => {
    expect(parsePkgPrNewCliDep('latest')).toBeNull()
    expect(parsePkgPrNewCliDep('^0.1.0')).toBeNull()
    expect(parsePkgPrNewCliDep('workspace:*')).toBeNull()
  })

  test('returns null when the dep is undefined', () => {
    expect(parsePkgPrNewCliDep(undefined)).toBeNull()
  })

  test('returns null for unrelated URLs that happen to contain pkg.pr.new', () => {
    // Defensive: don't grab anything that doesn't match the exact
    // /<owner>/<repo>/@barefootjs/cli@<ref> shape.
    expect(
      parsePkgPrNewCliDep('https://pkg.pr.new/piconic-ai/barefootjs/@barefootjs/jsx@abc123'),
    ).toBeNull()
    expect(parsePkgPrNewCliDep('https://example.com/foo')).toBeNull()
  })
})
