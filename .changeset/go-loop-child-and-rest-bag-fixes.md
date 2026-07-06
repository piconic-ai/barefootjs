---
"@barefootjs/go-template": patch
"@barefootjs/cli": patch
---

Fix two Go template adapter codegen bugs against generated props structs (#2130, #2131):

- **#2130** — a `.map()` loop whose body is an element *wrapping* a child component (`<li><Badge>…</Badge></li>`) retargeted its `{{range}}` at a `.{ChildName}s` slice that only exists for direct single-component bodies, 500ing at render with `can't evaluate field Badges in type *XxxProps`. The range now iterates the real collection (gated on the IR's `loop.childComponent`, the same condition the slice generator uses), and the wrapped child renders through the parent's once-per-slot instance (`$.{Name}SlotN`) with per-item children injected via the loop-body companion define.
- **#2131** — `bf build` never registered child component shapes on the adapter (only the test harness did), so HTML attributes passed to a rest-spread child (`<Input placeholder="…" />`) were emitted as named Go struct fields the generated `Input` struct doesn't declare, breaking `go build` with `unknown field Placeholder`. The CLI now runs a metadata-only pre-pass (`analyzeComponent` + `buildMetadata` per discovered component) that registers every component's shape before the first entry compiles, so non-param attrs route into the child's `Props map[string]any` rest bag.
