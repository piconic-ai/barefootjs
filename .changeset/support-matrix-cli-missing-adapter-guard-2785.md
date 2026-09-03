---
"@barefootjs/compat": patch
---

Fix #2785: `support-matrix:lock` and `compat:lock` discover adapters by dynamic-importing each registered package (`adapter-registry.ts`'s `loadCompatAdapters`) and silently skip any that fail to resolve — e.g. an unbuilt `dist/`. Their generators then wrote a lock file containing only the adapters that happened to load, with no warning, deleting the missing adapters' rows from the committed `ui/support-matrix.lock.json` / `ui/compat.lock.json`. The freshness/drift check then compared against this now-truncated lock and passed on it.

`loadAllCompatAdapters`/`requireAllCompatAdapters` (`adapter-registry.ts`) are a new all-or-throw wrapper around the existing degrade-to-skip loader: `MissingCompatAdaptersError` names every package that failed to load, its reason, and the exact `bun run --filter ... build` command to fix it. `support-matrix-cli.ts` (always a lock generator) and `cli.ts`'s `--out` path (`compat:lock`) now refuse to write and exit 1 instead of silently writing a subset; the ad-hoc `bun run compat <component>` (no `--out`) keeps its prior best-effort behavior, since that path was never a committed artifact.
