---
"@barefootjs/cli": patch
"@barefootjs/jsx": patch
---

Profiler dogfooding fixes: resilient mount + capped report (#1690).

Sweeping `--scenario auto` across the UI library surfaced two rough edges:

- **Crash on context-dependent components.** A bare mount of a component whose
  init reads a context provider (e.g. `sidebar`'s `ctx.state`) threw an
  uncaught `TypeError`, aborting `bf debug profile`. The driver now catches the
  mount failure and reports an actionable message ("…needs a context provider
  or composition — profile it with `--scenario <story.tsx>`").
- **Unreadable hot list.** A grid component (e.g. `calendar`) produced 1000+
  subscribers, dumping a thousand rows. `formatHotSubscribers` now shows the top
  N (default 12) and summarizes the rest as "… and N more", keeping the report
  scannable (the full set remains in `--json`).
