// The `vite` peer range is one decision copied into every package that
// declares it, and ci-vite-compat.yml is what keeps it honest. Pin the
// copies to each other and the range to the CI matrices, so a package left
// behind or a major added without a leg fails here instead of shipping.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { peerRangeMajors, vitePeerPackages } from '../vite-peer'

const repoRoot = join(import.meta.dir, '..', '..', '..')
const packages = vitePeerPackages(repoRoot)
const reference = packages.find(p => p.pkg.name === '@barefootjs/vite')
const majors = reference ? peerRangeMajors(reference.range) : []

const workflow = Bun.YAML.parse(
  readFileSync(join(repoRoot, '.github', 'workflows', 'ci-vite-compat.yml'), 'utf8'),
) as { jobs: Record<string, { strategy: { matrix: { vite: string[] } } }> }
const matrixMajors = (job: string) => workflow.jobs[job].strategy.matrix.vite.map(Number)

const csrPkg = JSON.parse(readFileSync(join(repoRoot, 'integrations', 'csr', 'package.json'), 'utf8'))
const csrMajor = peerRangeMajors(csrPkg.devDependencies.vite)[0]

describe('vite peer range', () => {
  test('@barefootjs/vite and every adapter builder declare it', () => {
    expect(reference).toBeDefined()
    expect(packages.map(p => p.pkg.name)).toEqual(
      expect.arrayContaining(['@barefootjs/vite', '@barefootjs/hono', '@barefootjs/go-template']),
    )
  })

  test('every package declares the same range as @barefootjs/vite', () => {
    for (const p of packages) expect({ name: p.pkg.name, range: p.range }).toEqual({ name: p.pkg.name, range: reference?.range })
  })

  test('every adapter builder is tested on every major in the range', () => {
    expect(matrixMajors('adapter-builders')).toEqual(majors)
  })

  test('integrations/csr runs on every major exactly once across ci-csr.yml and ci-vite-compat.yml', () => {
    const csrMatrix = matrixMajors('e2e-csr')
    expect(csrMatrix).not.toContain(csrMajor)
    expect([...csrMatrix, csrMajor].sort((a, b) => a - b)).toEqual([...majors].sort((a, b) => a - b))
  })
})

describe('peerRangeMajors', () => {
  test('reads the majors of a ^N.0.0 union', () => {
    expect(peerRangeMajors('^6.0.0 || ^7.0.0 || ^8.0.0')).toEqual([6, 7, 8])
    expect(peerRangeMajors('^8.0.0')).toEqual([8])
  })

  test('refuses a range that admits only part of a major', () => {
    expect(() => peerRangeMajors('>=6.1.0')).toThrow()
    expect(() => peerRangeMajors('^6.0.0 || ~7.2.0')).toThrow()
  })
})
