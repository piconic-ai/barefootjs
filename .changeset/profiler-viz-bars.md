---
"@barefootjs/jsx": minor
---

Visualize the profiler report with proportional bars (#1690).

`bf debug profile --scenario` now renders mitata-style horizontal bars in the
human report: hot subscribers get a bar proportional to their run count, and
batch candidates a bar proportional to the runs a `batch()` would save. Bars are
keyed on the deterministic metrics (`runs` / `savings`), so the chart is stable
across runs (SR7); long names are ellipsized to keep columns aligned. `--json`
output is unchanged.

    hot subscribers — most run / most time
      s1 (attribute)       ██████████████   2×  0.4ms  (switch/index.tsx:146)
      isControlled (memo)  ███████          1×  0.1ms  (switch/index.tsx:90)
