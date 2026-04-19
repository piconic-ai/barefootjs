#!/usr/bin/env bun
/**
 * Kill orphaned dev-all processes.
 *
 * `concurrently -k` sends SIGTERM to its direct children, but `bun run
 * --filter` spawns grandchildren (e.g. `bun run --watch server.tsx`, wrangler
 * workerd, perl app.pl) that don't always propagate the signal, leaving
 * ports 3001/3004/3005/4000/8080 held on the next run. This script targets
 * only processes whose command line unambiguously belongs to our dev setup,
 * so it won't interfere with unrelated services on the same ports.
 */

import { spawnSync } from 'node:child_process'

const PATTERNS = [
  // Bun dev servers under this workspace
  String.raw`bun run --watch server\.tsx`,
  // Wrangler + workerd started from our hono example
  String.raw`wrangler-dist/cli\.js`,
  String.raw`workerd.*barefootjs`,
  // Mojolicious app
  String.raw`app\.pl daemon`,
  // Compiled echo binary under the host go-build cache
  String.raw`go-build.*exe/echo`,
  // Our proxy
  String.raw`scripts/dev-all\.ts`,
] as const

let killed = 0
for (const pattern of PATTERNS) {
  const r = spawnSync('pkill', ['-f', pattern], { encoding: 'utf8' })
  // pkill exit code 0 = killed something, 1 = nothing matched.
  if (r.status === 0) killed++
}

if (killed > 0) {
  console.log(`dev-clean: stopped ${killed} orphaned dev process group(s)`)
  // Give the kernel a moment to release the sockets before the next start.
  await new Promise(r => setTimeout(r, 500))
} else {
  console.log('dev-clean: no orphans')
}
