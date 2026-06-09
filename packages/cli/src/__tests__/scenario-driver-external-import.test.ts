// `isExternalClientImportError` classifies the one failure mode the auto
// scenario can't fix: a transitive external @barefootjs package whose compiled
// dist imports `@barefootjs/client` directly (#1849 B3). When it matches, the
// driver swaps bun's raw module-resolution stack for an actionable message
// pointing at `--scenario <story.tsx>`.

import { describe, test, expect } from 'bun:test'
import { isExternalClientImportError } from '../lib/scenario-driver'

describe('isExternalClientImportError', () => {
  test('matches the cached-package failure from the issue (xyflow)', () => {
    // The verbatim message `bf debug profile xyflow --scenario auto` surfaced.
    const msg =
      "Cannot find module '@barefootjs/client' from " +
      "'/root/.bun/install/cache/@barefootjs/xyflow@0.10.1@@@1/dist/index.js'"
    expect(isExternalClientImportError(msg)).toBe(true)
  })

  test('matches the "Cannot find package" phrasing too', () => {
    expect(isExternalClientImportError("Cannot find package '@barefootjs/client' from x")).toBe(true)
  })

  test('does NOT match the runtime sub-path (that import is rewritten in-tree)', () => {
    // `@barefootjs/client/runtime` is handled by the rewrite pass + its own
    // "isn't built" guard — it must not be mistaken for the external-package case.
    expect(isExternalClientImportError("Cannot find module '@barefootjs/client/runtime'")).toBe(false)
  })

  test('does NOT match unrelated resolution failures', () => {
    expect(isExternalClientImportError("Cannot find module './component.mjs'")).toBe(false)
    expect(isExternalClientImportError('some other error')).toBe(false)
  })
})
