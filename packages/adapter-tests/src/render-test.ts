/**
 * `test` variant for conformance cases that spawn a real backend render.
 *
 * Native adapters render every fixture by spawning a process (`go run`,
 * `php`, `java -jar`, …). Run one after another, those spawns set a floor
 * of 10–17 min per adapter in CI while the runner's other cores sit idle.
 * `test.concurrent` lets Bun keep several renders in flight at once
 * (bounded by `--max-concurrency`). Every renderer writes to
 * its own random temp dir and memoizes its one-time build as a shared
 * promise, so concurrent renders do not collide.
 *
 * A concurrent case's timeout clock also runs while it waits for a CPU
 * behind the other in-flight renders, so the default 5 s is far too tight;
 * cases get `RENDER_TEST_TIMEOUT_MS` unless they pass their own. That
 * budget assumes a bounded number of renders in flight, so CI pins it
 * with `bun test --max-concurrency=8` on every adapter workflow rather than
 * relying on Bun's default (20). Change the two together.
 *
 * Set `BF_CONFORMANCE_SERIAL=1` to run these cases one by one again, e.g.
 * when bisecting a failure that looks order-dependent.
 */

import { test } from 'bun:test'

export const RENDER_TEST_TIMEOUT_MS = 120_000

const base = process.env.BF_CONFORMANCE_SERIAL ? test : test.concurrent

export function renderTest(
  name: string,
  fn: () => Promise<void>,
  timeout: number = RENDER_TEST_TIMEOUT_MS,
): void {
  base(name, fn, timeout)
}
