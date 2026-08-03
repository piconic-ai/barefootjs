/**
 * Debounce + serialize an async task behind a single `trigger()` entry
 * point. Built for `configureServer`'s watcher handlers: a burst of
 * `'change'`/`'add'`/`'unlink'` events (save-twice-quickly, a multi-file
 * save, a `git checkout` touching many files) must not start several
 * overlapping eager passes writing the same template files — the legacy
 * CLI's `watch()` (`packages/cli/src/lib/build.ts`) debounced at 100ms for
 * exactly this reason.
 *
 * Two, deliberately separate, guarantees:
 *  - **debounce**: `trigger()` calls within `debounceMs` of each other
 *    collapse into a single scheduled run.
 *  - **serialize + coalesce**: if `task()` is still running when the
 *    debounce timer fires, this does NOT start a second, overlapping
 *    call — it marks exactly one follow-up run, which starts the instant
 *    the in-flight one finishes. A change arriving mid-pass is delayed,
 *    never dropped, and at most one run is ever in flight.
 *
 * Deliberately minimal: no queue of distinct payloads, no rehashing —
 * `task()` itself (the caller's full eager pass) is the unit of work, and
 * it re-discovers everything from disk on every call, so "run it again"
 * is always correct regardless of how many trigger()s piled up.
 */
export interface DebouncedSerialRunner {
  /** Schedule a run, debounced. Safe to call from multiple event sources. */
  trigger(): void
}

export function createDebouncedSerialRunner(
  task: () => Promise<void>,
  debounceMs: number,
  onError: (err: unknown) => void,
): DebouncedSerialRunner {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let running: Promise<void> | null = null
  let rerunQueued = false

  function runOnce(): void {
    if (running) {
      // A task is already in flight — don't start a second one racing it
      // to write the same files. Queue exactly one follow-up instead;
      // repeated triggers while running collapse into that same single
      // follow-up (the `do`/`while` below re-checks the flag, not a count).
      rerunQueued = true
      return
    }

    running = (async () => {
      do {
        rerunQueued = false
        await task()
      } while (rerunQueued)
    })()
      .catch(onError)
      .finally(() => {
        running = null
      })
  }

  return {
    trigger() {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        runOnce()
      }, debounceMs)
    },
  }
}
