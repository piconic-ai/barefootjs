---
"@barefootjs/cli": patch
---

Fix non-deterministic Go type ordering when building under Bun.

`discoverComponentFiles` relied on the OS `readdir` order, which differs between runtimes: Bun returns APFS hash order while Node.js returns alphabetical order. This caused Go integrations' `components.go` to regenerate with a different type/function ordering on every build even when no source files changed.

Sort entries in `discoverComponentFiles` by name so the component processing order is always alphabetical, regardless of JS runtime or filesystem.
