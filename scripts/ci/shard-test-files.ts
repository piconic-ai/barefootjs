#!/usr/bin/env bun
/**
 * Deterministically partition a directory's test files into N shards for
 * CI matrix runners.
 *
 * `bun test` (as pinned in this repo) has no --shard flag, so we compute
 * the file list ourselves and pass it as explicit args:
 *   bun test $(bun scripts/ci/shard-test-files.ts packages/jsx 1 2)
 *
 * Balancing strategy: sort files by (weight desc, path asc), then greedily
 * assign each file to the shard with the smallest running total weight,
 * breaking ties by lowest shard index. This approximates a balanced
 * partition of wall-clock time far better than alphabetical round-robin,
 * which was measured to produce a 1.7x imbalance on packages/jsx.
 *
 * Weight is byte size by default (a stable, deterministic proxy for test
 * run time — no timestamps or randomness involved), overridden per-file in
 * WEIGHT_OVERRIDES below. Size is a good proxy only when a file's cost
 * scales with how much source it has; it badly underestimates a small file
 * whose cost instead comes from looping a fixed body over a large shared
 * corpus once (or several times) per test run — e.g. packages/adapter-tests
 * has a handful of test files that each iterate the ~360-fixture corpus,
 * so a 2KB file can outweigh a 16KB one by 2x wall time. Measured via
 * `time bun test <file>` in isolation; recheck a listed file's weight if
 * its fixture-loop count or the corpus size changes materially.
 *
 * Usage: bun scripts/ci/shard-test-files.ts <dir> <shardIndex> <shardCount>
 *   <shardIndex> is 1-based.
 */

import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const TEST_FILE_PATTERN = /\.test\.tsx?$/

const WEIGHT_OVERRIDES: Record<string, number> = {
  // Wall time of each file run alone, all measured on one machine so the
  // weights compare with each other (October 2026; CI runners are faster).
  // 3 separate `for (const fixture of jsxFixtures)` loops, each compiling
  // + scanning every fixture.
  'packages/adapter-tests/src/__tests__/ssr-hydration-contract.test.ts': 521_000,
  // 1 full-corpus loop compiling + CSR-rendering every fixture, in a 2.2KB
  // file that size alone would place among the smallest.
  'packages/adapter-tests/src/__tests__/csr-conformance.test.ts': 183_000,
  // 2 full-corpus loops (plus a nested per-child-component pass).
  'packages/adapter-tests/src/__tests__/client-js-scope.test.ts': 196_000,
  // Each checks a generated ledger against the whole fixture corpus.
  'packages/adapter-tests/src/__tests__/coverage-map.test.ts': 190_000,
  'packages/adapter-tests/src/__tests__/generated-data-points.test.ts': 181_000,
  // The cross-adapter files compile each fixture of a family once per DSL
  // adapter (eight compiles per case).
  'packages/adapter-tests/src/__tests__/loop-cross-adapter.test.ts': 317_000,
  'packages/adapter-tests/src/__tests__/callback-chain-cross-adapter.test.ts': 86_000,
  'packages/adapter-tests/src/__tests__/array-method-cross-adapter.test.ts': 68_000,
  'packages/adapter-tests/src/__tests__/attr-plan-cross-adapter.test.ts': 49_000,
}

function findTestFiles(dir: string): string[] {
  const results: string[] = []

  function walk(current: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
        results.push(full)
      }
    }
  }

  walk(dir)
  return results
}

function main(): void {
  const [dir, shardIndexArg, shardCountArg] = process.argv.slice(2)

  if (!dir || !shardIndexArg || !shardCountArg) {
    console.error(
      'Usage: bun scripts/ci/shard-test-files.ts <dir> <shardIndex> <shardCount>',
    )
    process.exit(1)
  }

  const shardIndex = Number.parseInt(shardIndexArg, 10)
  const shardCount = Number.parseInt(shardCountArg, 10)

  if (
    !Number.isInteger(shardIndex) ||
    !Number.isInteger(shardCount) ||
    shardCount < 1 ||
    shardIndex < 1 ||
    shardIndex > shardCount
  ) {
    console.error(
      `Invalid shardIndex/shardCount: ${shardIndexArg}/${shardCountArg} (shardIndex is 1-based)`,
    )
    process.exit(1)
  }

  const files = findTestFiles(dir)

  const sized = files
    .map((path) => ({ path, weight: WEIGHT_OVERRIDES[path] ?? statSync(path).size }))
    .sort((a, b) => b.weight - a.weight || a.path.localeCompare(b.path))

  const bins: { total: number; files: string[] }[] = Array.from(
    { length: shardCount },
    () => ({ total: 0, files: [] }),
  )

  for (const { path, weight } of sized) {
    let smallest = 0
    for (let i = 1; i < bins.length; i++) {
      if (bins[i].total < bins[smallest].total) smallest = i
    }
    bins[smallest].files.push(path)
    bins[smallest].total += weight
  }

  const shard = bins[shardIndex - 1].files
    .map((path) => relative(process.cwd(), path))
    .sort((a, b) => a.localeCompare(b))

  console.log(shard.join('\n'))
}

main()
