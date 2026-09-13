---
"@barefootjs/pebble": minor
---

Wires the Pebble adapter into the shared ~190-fixture conformance corpus (#2101 Phase 4): `bf.render_child` now actually performs cross-template child-component rendering against a real `PebbleEngine`, closing the gap Phase 3b left open. A new `renderPebbleComponent` JSX-compiling test harness (`test-render.ts`) drives `runAdapterConformanceTests`, and `conformance-pins.ts` starts from the Jinja adapter's pin set (the same shared, engine-independent BF0xx compiler refusals) with no additions needed — every remaining gap found during this pass was a real bug, now fixed:

- `render_child` derives child scope ids (`_bf_slot`-based or a random fallback), routes undeclared props into the rest bag via a new `_bf_manifest.json` sidecar + `ChildMeta`/`DeriveStashFromDefaults` (a Java port of `ssr-defaults.ts`'s prop/signal/memo default-resolution rules), and shares the parent's context-provider stack with cross-template descendants.
- Hydration marker helpers (`text_start`/`text_end`, `scope_comment`/`scope_comment_end`, `comment`, `hydration_attrs`/`props_attr`/`data_key_attr`) now emit the real shared wire format instead of Phase 3a placeholders.
- `merge`/`flat_map_tuple`/`query`/`style_object` take a single Pebble list-literal argument instead of Java varargs — confirmed Pebble's method resolver can never match a varargs method from a template call.
- Literal-map subscript (`{...}[key]`) and two-variable `for k, v in map` — both previously assumed unsupported in comments only — are now actually routed through the already-correct `bf.get`/`bf.entries` helpers everywhere they're emitted.
- `{% set %}...{% endset %}` block-capture now binds a `SafeString`, fixing silent double-escaping of every forwarded JSX-children/named-slot/async-fallback value.
- `Bf.string(null)` now returns `""` (pinned divergence, matching every other language port), `style_object` ports the shared `hasUnsafeStyleValue` scan exactly, and `Main` writes stdout as explicit UTF-8 (was silently mangling non-ASCII fixture output).
- Registers Pebble's own template metacharacters (`{{`/`{%`/`{#`) in the shared `dangerousInnerHtmlMetacharViolation` guard table — every adapter must supply this entry, per that file's own fail-closed design.

Result: `bun test packages/adapter-pebble` — 1766 pass / 24 skip (pre-existing, Jinja-derived compiler-refusal pins) / 0 fail. `bun test packages/adapter-tests` stays fully green (2661 pass / 5 skip / 0 fail), confirming no regression to any sibling adapter.
