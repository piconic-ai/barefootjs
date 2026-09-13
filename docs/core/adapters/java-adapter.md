---
title: Java Adapter
description: Render BarefootJS components from Java via Pebble — no framework required (Spring Boot, Ktor, plain Servlet apps).
---

# Java Adapter

Run the same JSX components on a JVM backend. BarefootJS compiles your JSX
into a **Pebble marked template** plus **client JS**; on the server, a small
Java runtime renders those templates through a plain
[`PebbleEngine`](https://pebbletemplates.io/) — no framework is required, so
Spring Boot, Ktor, or a plain Servlet app all work the same way.

```
JSX → IR → marked template (.peb) + Component.client.js
                 │
                 ▼
   BarefootJS runtime  ──delegates──▶  io.pebbletemplates.pebble.PebbleEngine
   (java/, dev.barefootjs.pebble)
```

This adapter is a port of `@barefootjs/jinja` (the Python adapter — see the
[Python Adapter](./python-adapter.md)) to [Pebble](https://pebbletemplates.io/),
a Twig/Jinja-family template engine for the JVM. Pebble's syntax
(`{{ }}` / `{% if %}` / `{% for %}` / `{% set %}`) is close to Jinja2's, but
not identical — see "Divergences from Jinja2" below for the differences this
adapter works around.

## Template output shape

- One `.peb` file per component, named by snake-casing the PascalCase
  component name (`UserCard` → `user_card.peb`).
- Hydration markers use the same runtime method names as every other
  adapter's `bf.*` calls (`bf.scope_attr()`, `bf.hydration_attrs()`,
  `bf.text_start`/`text_end`, `bf.comment(...)`, …) — see
  [`spec/template-helpers.md`](https://github.com/piconic-ai/barefootjs/blob/main/spec/template-helpers.md)
  for the shared helper contract.
- Every text/attribute interpolation of a possibly-non-string value is
  routed through `bf.string(...)` (or `bf.bool_str(...)` for boolean-shaped
  values); every non-comparison condition position is routed through
  `bf.truthy(...)`. Pebble's `{% if %}` has no implicit
  empty-container-is-falsy coercion at all — an unrouted non-primitive
  condition doesn't just render wrong, it throws at render time, so this
  routing is load-bearing rather than a style choice.

## Divergences from Jinja2

Pebble is Twig-inspired, not Jinja2-compatible, so a few constructs this
adapter's Jinja/Rust/PHP siblings emit natively route through dedicated
`bf.*` helpers on Pebble instead:

- **No `??` operator.** Confirmed absent from Pebble's grammar entirely (not
  just a native/coalesce split like other adapters) — a template containing
  a raw `??` fails to *parse*. This adapter emits `bf.coalesce(a, b)`.
- **No `===`/`!==`.** Pebble's `==` uses `Objects.equals`, which is
  null-safe but not cross-type-numeric-aware (`1 == 1.0` can be `false`
  depending on boxed type) — every strict-equality comparison routes through
  `bf.eq`/`bf.neq` instead of trusting the native operator.
- **No block-capture `{% set NAME %}...{% endset %}` in stock Pebble.** This
  adapter's Java runtime registers a custom `Extension` (`ext/`) that
  replaces Pebble's `set` tag handler with one supporting both the stock
  `{% set NAME = EXPR %}` assignment form and a new block-capture form,
  needed for JSX-children/named-slot/async-fallback forwarding. The captured
  value binds as a `SafeString` so it isn't double-escaped when a child
  template re-prints it.
- **No native two-variable `for key, value in map`.** Pebble's `for` tag
  binds a single loop variable (to a `Map.Entry` for map iteration); object
  entries/keys/values iteration routes through `bf.entries`/`bf.keys`/
  `bf.values` instead of relying on a native map-iteration shape.
- **No lambda/closure value.** Higher-order callback bodies (`.map()`,
  `.filter()`, `.sort()`, `.reduce()`, …) can't be expressed as Pebble
  syntax at all — they're carried as a serialized `ParsedExpr` tree and
  interpreted by a small Java evaluator (`eval/Evaluator.java`) at render
  time, the same mechanism the Go and Perl adapters use.

See `packages/adapter-pebble/src/adapter/pebble-adapter.ts`'s file header
for the full confirmed-syntax table, and the package README's "Research
findings" section for how each divergence was verified against Pebble's
actual source (no `pebble-sources.jar` is published, so several claims were
confirmed by decompiling `pebble-4.1.2.jar` directly).

## Java runtime

`java/` (a Gradle project, dependency `io.pebbletemplates:pebble`) implements
the engine-agnostic `bf` object every emitted template calls into: hydration
markers, context propagation, cross-template child-component rendering
(`bf.render_child`), and the JS-compatible helper library (`string`,
`bool_str`, `truthy`, `number`, array/string helpers, `spread_attrs`,
`query`, …). Helpers that take a variable number of JS arguments (`merge`,
`style_object`, `flat_map_tuple`, `query`) take a single Pebble list literal
instead — Pebble's method resolver requires an exact parameter-count match,
so a Java varargs method can never be called from a template.

Cross-template child rendering (`bf.render_child`) resolves the child
template by name through the same `PebbleEngine`/`FileLoader` the parent was
loaded from — Pebble already resolves any sibling `.peb` file this way, with
no explicit per-child registration needed. The one piece a plain `FileLoader`
can't supply is a child's own prop defaults and rest-prop name; a small
`_bf_manifest.json` sidecar (written by the compiler alongside the emitted
templates) carries that metadata, read into a `ChildMeta` record and
resolved via `DeriveStashFromDefaults` — a Java port of
`packages/jsx/src/ssr-defaults.ts`'s prop/signal/memo default-resolution
rules.

No Gradle wrapper is committed — build with a matching `gradle` on `PATH`
(the CI workflow provisions Java 21/Temurin), or `gradle wrapper` if your own
project wants one.

## Usage

```
npm install @barefootjs/pebble
```

Configure the build (`vite.config.ts`):

```typescript
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/pebble/vite'

export default defineConfig({
  plugins: barefoot({
    components: ['./src/components'],
    templates: 'src/main/resources/templates',
  }),
})
```

`vite build` emits `.peb` templates (plus the `_bf_manifest.json` sidecar and
client JS) under `templates`. On the JVM side, depend on `io.pebbletemplates:pebble`,
build a `PebbleEngine` over a `FileLoader` pointed at that same directory,
register the `SetBlockExtension` (required — it's what makes `{% set %}...{%
endset %}` block-capture work), and put a `Bf` instance in the render
context:

```java
import dev.barefootjs.pebble.Bf;
import dev.barefootjs.pebble.ext.SetBlockExtension;
import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.loader.FileLoader;
import io.pebbletemplates.pebble.template.PebbleTemplate;

import java.io.StringWriter;
import java.util.Map;

FileLoader loader = new FileLoader("src/main/resources/templates");
loader.setSuffix(".peb");
PebbleEngine engine = new PebbleEngine.Builder()
    .loader(loader)
    .strictVariables(false)
    .extension(new SetBlockExtension())
    .build();

PebbleTemplate template = engine.getTemplate("user_card");
Map<String, Object> context = Map.of(
    "name", "Ada",
    "bf", new Bf("UserCard_0", engine, Map.of()) // scope id, engine (for render_child), child manifest
);

StringWriter writer = new StringWriter();
template.evaluate(writer, context);
String html = writer.toString();
```

`@barefootjs/pebble`'s npm package ships the Java sources under its own
`java/` directory (not yet published as a standalone Maven Central
artifact — see the package README for the current publishing-automation
research) — vendor them into your Gradle/Maven build, or depend on the
package's Gradle project directly via a source/composite build, until a
published coordinate lands. A full runnable Spring Boot example (with
manifest-driven child-component registration, mirroring the Rust adapter's
`integrations/axum`) is tracked as a follow-up.

## See also

- [Python Adapter](./python-adapter.md) — the Jinja2 adapter this is ported from
- [Rust Adapter](./rust-adapter.md) — another near-mechanical Jinja2-family port, for comparison
- [Adapter Architecture](./adapter-architecture.md) — the `TemplateAdapter` interface and IR contract
- [Writing a Custom Adapter](./custom-adapter.md)
