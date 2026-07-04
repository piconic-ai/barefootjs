#!/usr/bin/env bun
/**
 * Deterministically partition a directory's test files into N shards for
 * CI matrix runners.
 *
 * `bun test` (as pinned in this repo) has no --shard flag, so we compute
 * the file list ourselves and pass it as explicit args:
 *   bun test $(bun scripts/ci/shard-test-files.ts packages/jsx 1 2)
 *
 * Balancing strategy: sort files by (size desc, path asc), then greedily
 * assign each file to the shard with the smallest running total size,
 * breaking ties by lowest shard index. This approximates a balanced
 * partition of wall-clock time (file size is a stable, deterministic proxy
 * for test run time — no timestamps or randomness involved) far better
 * than alphabetical round-robin, which was measured to produce a 1.7x
 * imbalance on packages/jsx.
 *
 * Usage: bun scripts/ci/shard-test-files.ts <dir> <shardIndex> <shardCount>
 *   <shardIndex> is 1-based.
 */

import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const TEST_FILE_PATTERN = /\.test\.tsx?$/

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
    .map((path) => ({ path, size: statSync(path).size }))
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))

  const bins: { total: number; files: string[] }[] = Array.from(
    { length: shardCount },
    () => ({ total: 0, files: [] }),
  )

  for (const { path, size } of sized) {
    let smallest = 0
    for (let i = 1; i < bins.length; i++) {
      if (bins[i].total < bins[smallest].total) smallest = i
    }
    bins[smallest].files.push(path)
    bins[smallest].total += size
  }

  const shard = bins[shardIndex - 1].files
    .map((path) => relative(process.cwd(), path))
    .sort((a, b) => a.localeCompare(b))

  console.log(shard.join('\n'))
}

main()
