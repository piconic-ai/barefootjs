---
"@barefootjs/cli": patch
"@barefootjs/jsx": patch
---

Profiler CLI ergonomics: robust flags + actionable build hint (#1690).

Dogfooding `bf debug profile` surfaced three agent-facing rough edges:

- **Flags leaked into the component name.** Unknown / mis-typed flags were
  pushed onto the positional list, so `bf debug profile --hot-ms 10 foo` read
  `--hot-ms` as the component and failed with `Cannot find component
  "--hot-ms"`. `parseFlags` now rejects unknown `--flags` and validates numeric
  ones with an actionable message + usage, instead of silently mis-parsing.
- **`--top` / `--hot-ms` are now wired.** `--top <n>` caps the hot-subscriber
  list (the `--json` set is unchanged); `--hot-ms <n>` drops sub-threshold
  subscribers so a grid component's long tail collapses to what is worth a fix.
  Threaded through `buildProfileReport` → `analyzeHotSubscribers` (new
  `minMs` option).
- **Opaque "Cannot find module" on a fresh checkout.** The dynamic profiler
  imports the built client runtime (`@barefootjs/client/runtime`), so a checkout
  that ran `bun install` but not `bun run build` failed here with a raw module
  error. The scenario driver now catches it and points at `bun run build`,
  noting the static budget needs no build.
