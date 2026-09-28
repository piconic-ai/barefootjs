// The `vite` peer range: which workspace packages declare it, and which Vite
// majors it admits. One answer, shared by the CI step that swaps Vite majors
// (scripts/ci/use-vite-major.ts) and the test that pins the range to the
// ci-vite-compat.yml matrix (scripts/lib/__tests__/vite-peer.test.ts).

import { type WorkspacePackage, workspacePackages } from './workspace-packages'

export interface VitePeerPackage extends WorkspacePackage {
  range: string
}

/** Every `packages/*` package that declares `vite` as a peer dependency. */
export function vitePeerPackages(repoRoot: string): VitePeerPackage[] {
  return workspacePackages(repoRoot).flatMap(entry => {
    const range = entry.pkg.peerDependencies?.vite
    return range === undefined ? [] : [{ ...entry, range }]
  })
}

/**
 * The majors a `^N.0.0 || ^M.0.0 || ...` range admits, in order. Any other
 * shape throws: the CI matrix tests whole majors, so a range that admits
 * part of one (`>=6.1.0`, `~7.2.0`) has no leg that matches it.
 */
export function peerRangeMajors(range: string): number[] {
  return range.split('||').map(alternative => {
    const match = /^\^(\d+)\.0\.0$/.exec(alternative.trim())
    if (!match) throw new Error(`vite peer range alternative "${alternative.trim()}" is not of the form ^N.0.0`)
    return Number(match[1])
  })
}
