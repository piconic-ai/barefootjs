---
"@barefootjs/jsx": patch
---

Profiler: flag compound components in the static budget (#1844 follow-up).

A compound component like `Select` / `Combobox` declares signals/memos but its
consumers live in composed child components, so the single-component static
budget reads `subscriptions: 0` with empty fan-out — which looks misleadingly
"free". `buildStaticBudget` now sets a `crossComponentOnly` flag (and
`formatStaticBudget` prints a `ⓘ compound:` note) when a component has reactive
state but no in-component subscriber, pointing the user at `--scenario` to
measure across the composition boundary. Self-contained components are
unaffected.
