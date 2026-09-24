---
title: Java Adapter
description: Render BarefootJS components from Java via Pebble — no framework required (Spring Boot, Ktor, plain Servlet apps).
---

# Java Adapter

`@barefootjs/pebble` compiles components to [Pebble](https://pebbletemplates.io/) templates (`.peb`) rendered by a small Java runtime (`dev.barefootjs.pebble`) over a plain `PebbleEngine`. Spring Boot, Ktor or a plain Servlet app all work the same way.

## Install

```sh
npm install @barefootjs/pebble
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/pebble/vite'

export default defineConfig({
  plugins: barefoot({ components: ['components'], templates: 'src/main/resources/templates' }),
})
```

The runtime is not published to Maven Central. Vendor the `java/` sources from the npm package into your Gradle or Maven build (or include its Gradle project as a composite build); its one dependency is `io.pebbletemplates:pebble`.

## Render from your server

```java
import dev.barefootjs.pebble.Bf;
import dev.barefootjs.pebble.ext.SetBlockExtension;
import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.loader.FileLoader;
import io.pebbletemplates.pebble.template.PebbleTemplate;

import java.io.StringWriter;
import java.util.Map;

FileLoader loader = new FileLoader("/abs/path/to/src/main/resources/templates");
loader.setSuffix(".peb");
PebbleEngine engine = new PebbleEngine.Builder()
    .loader(loader)
    .strictVariables(false)
    .extension(new SetBlockExtension())
    .build();

Bf bf = new Bf("Counter_0", engine, Map.of()); // scope id, engine (for render_child), child manifest
PebbleTemplate template = engine.getTemplate("counter");
StringWriter writer = new StringWriter();
template.evaluate(writer, Map.of("initial", 0, "bf", bf));
String html = "<!doctype html><body>" + writer + bf.scripts() + "</body>";
```

Three settings are required. `strictVariables(false)` lets a missing prop render empty instead of throwing. `SetBlockExtension` adds the `{% set name %}…{% endset %}` block-capture form that stock Pebble lacks; children and slots do not render without it. The `bf` context entry is `Bf(scopeId, engine, manifest)`: the engine resolves child templates for `render_child`, and the manifest maps child template names to their prop defaults — `Map.of()` for a component without children, otherwise `ManifestLoader.loadFromBuildManifest(templatesDir.resolve("manifest.json"))` over the `manifest.json` that `vite build` writes next to the templates (`ManifestLoader.load` reads the `_bf_manifest.json` sidecar the conformance harness writes instead).

## Notes

- `FileLoader` rejects a relative prefix; pass an absolute path.
- Template names are the snake_cased component name: `UserCard` → `user_card.peb`.
- Pebble has no `??`, no strict equality and no lambdas; the adapter routes those through `bf.*` helpers, so nothing needs configuring.
- Variadic helpers take a single Pebble list literal, because Pebble's method resolver requires an exact parameter count.
- No Gradle wrapper is committed; build with a `gradle` on `PATH` (CI uses Java 21).

Example: [`integrations/spring`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/spring).
