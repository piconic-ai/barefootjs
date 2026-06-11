# Router stress notes

A **directional** smoke test of `@barefootjs/router` — not exhaustive QA.
The goal was to push the prototype through realistic use cases and see
whether the design direction holds. Run with `bun run stress` (drives a
real Chromium via `stress.ts`).

## Result: 8 pass / 0 fail / 1 info

| Scenario | Result | What it probes |
|---|---|---|
| Sequential walk (10 posts) | ✓ | swap + hydrate/dispose balance — `live` islands stayed `{2}` the whole walk; cumulative hydrated `20`, disposed `18` |
| Rapid-fire race (slow superseded by fast) | ✓ | latest-wins; the stale `?delay=400` response never landed |
| Back/forward storm | ✓ | `popstate` swaps to match each URL; forward lands correctly |
| Query-string nav (`?tag=design`) | ✓ | same-path/different-search swaps; shell uptime kept running |
| Leak probe — disposal ON | ✓ | left-page timer stopped firing (`5→5`); `live` back to `2` |
| Guard: hash-only link | ✓ | not intercepted; browser applied `#somewhere`, outlet unchanged |
| Throughput (30 navs) | ✓ | `~29ms/nav`; `live` islands `2→2` (no drift) |
| Leak probe — disposal OFF | ℹ | **documents the gap** (see below) |
| No uncaught page errors | ✓ | clean console |

## What the design got right

- **Outlet swap + shell preservation** is solid across 10 posts and 30+
  rapid navigations. The shell island (uptime clock, theme toggle) never
  resets — confirmed visually in the screenshots and by the monotonic
  uptime gauge.
- **Re-hydration through the existing seam works.** Driving hydration via
  `window.__bf_hydrate` (the router's default rehydrate path) re-inits
  exactly the new outlet islands and nothing else. The hydrate/dispose
  counts balance (`20` hydrated / `18` disposed over 9 transitions).
- **Disposal, when wired, fully contains lifecycle.** With the `dispose`
  hook on, per-page timers are torn down on exit and `live` islands stay
  flat no matter how far you navigate. The seam is sufficient.
- **The abort/last-wins model is correct** — once the race was fixed (see
  below). 30 back-to-back navigations and a forced slow/fast overlap both
  resolve to the right final state.
- **Query-string and back/forward** are ordinary navigations to the
  router — no special cases needed.

## Edges the stress surfaced

1. **A real race in the first cut (now fixed).** `navigate()` cleared its
   in-flight controller too early and didn't re-check `aborted` after
   `res.text()`, so a superseded navigation could still swap stale content
   and push a stale history entry. Fixed on the router branch
   (last-wins guard + regression test). The rapid-fire scenario is the
   guard against regressions.
2. **Disposal must be wired — the default GC-only path leaks.** With the
   `dispose` hook **off**, a left page's `setInterval` keeps firing
   forever (measured `5→9` ticks after leaving) and `live` islands climb
   (`4→6`). This is the prototype's known limitation made concrete:
   **precise per-scope disposal belongs in the client runtime** (wrap each
   scope's `init` in `createRoot`, key the dispose fn by scope element) so
   consumers don't have to hand-wire teardown. The seam works; the default
   needs to be safe.
3. **No scroll restoration on back/forward** — the router resets to the
   top. Minor, but expected for a real router.
4. **GET links only.** Forms / `POST` are not intercepted (full submit).
   That's the intended boundary for this prototype, worth stating.

## Verdict

The design direction holds: **swap-the-outlet + reuse-the-runtime is
sound, and the abort and dispose *seams* are the right shape.** The one
correctness bug found (the race) was small and is fixed. The clearest
follow-up is moving disposal from an opt-in hook to a safe default via a
per-scope registry in `@barefootjs/client` — everything else
(morph/persistent islands, prefetch, snapshot cache, compiler-derived
outlet) is additive polish on a working core.
