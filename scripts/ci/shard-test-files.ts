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
  // 3 separate `for (const fixture of jsxFixtures)` loops, each compiling
  // + scanning every fixture — ~300s alone vs. a 12.6KB file size that
  // would place it as merely mid-sized.
  'packages/adapter-tests/src/__tests__/ssr-hydration-contract.test.ts': 300_000,
  // 1 full-corpus loop compiling + CSR-rendering every fixture — ~120s
  // alone vs. a 2.2KB file size that would place it among the smallest.
  'packages/adapter-tests/src/__tests__/csr-conformance.test.ts': 120_000,
  // 2 full-corpus loops (plus a nested per-child-component pass) —
  // ~115s alone vs. a 9.4KB file size.
  'packages/adapter-tests/src/__tests__/client-js-scope.test.ts': 115_000,
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
