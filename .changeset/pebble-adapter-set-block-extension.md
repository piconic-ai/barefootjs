---
"@barefootjs/pebble": minor
---

Adds the Pebble adapter's Phase 3b custom `set` tag extension (#2101): `packages/adapter-pebble/java/src/main/java/dev/barefootjs/pebble/ext/` registers a `SetBlockTokenParser` that replaces stock Pebble's `set` tag handler, adding support for `{% set NAME %}...{% endset %}` block-capture (stock Pebble only ever supported `{% set NAME = EXPRESSION %}`) while keeping that assignment form working unchanged.

This closes the gap the Phase 3a Java runtime documented: JSX-children/named-slot/async-fallback forwarding (`bf.async_boundary`, and the `{% set %}...{% endset %}` shape `renderComponent` emits for named slots) now renders correctly end-to-end, including nested capture blocks. Cross-template child rendering (`bf.render_child`) still throws — it additionally needs multi-template dispatch in `Main`/`Bf`, deferred to the Phase 4 conformance-loop work where child-component fixtures first require it.

Tested with a direct JUnit engine-level suite (`ext/SetBlockExtensionTest.java`, parsing/rendering through a real `PebbleEngine` + `StringLoader`) and new end-to-end `java -jar` smoke tests (`pebble-set-block.test.ts`).
