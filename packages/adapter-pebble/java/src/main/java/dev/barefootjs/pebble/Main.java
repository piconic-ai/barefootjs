package dev.barefootjs.pebble;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.ToNumberPolicy;
import dev.barefootjs.pebble.ext.SetBlockExtension;
import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.loader.FileLoader;
import io.pebbletemplates.pebble.template.PebbleTemplate;

import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * CLI entry point `packages/adapter-pebble/src/test-render.ts` shells out
 * to via `java -jar` (Phase 3a — the hand-written `.peb` smoke-test
 * plumbing; Phase 4 wires the full conformance harness against this same
 * entry point).
 *
 * <p>Usage: {@code java -jar barefootjs-pebble-runtime.jar
 * <templatesDir> <entryTemplateBaseName> <varsJsonFile> [scopeId]}
 *
 * <ul>
 *   <li>{@code templatesDir} — directory containing one or more
 *       {@code .peb} files (a {@link FileLoader} base directory).
 *   <li>{@code entryTemplateBaseName} — the template to render, WITHOUT
 *       its {@code .peb} extension (e.g. {@code "greeting"} for
 *       {@code greeting.peb}).
 *   <li>{@code varsJsonFile} — a JSON object file: the render context
 *       (props/signals/memos). Numbers decode as {@code Double}
 *       (see {@link JsNumber}); every other JSON shape decodes to this
 *       runtime's ordinary value domain (see {@link JsValue}).
 *   <li>{@code scopeId} — optional; the value {@code bf.scope_attr()}
 *       returns for this render (default {@code "test"}).
 * </ul>
 *
 * <p>Prints the rendered HTML to stdout; on error, prints the exception to
 * stderr and exits non-zero. {@code strictVariables} is left at Pebble's
 * default ({@code false}) — matching the TS adapter's documented
 * assumption (see `pebble-adapter.ts`'s file header, "Pebble
 * variable/null handling").
 */
public final class Main {

  private static final Gson GSON = new GsonBuilder()
      .setObjectToNumberStrategy(ToNumberPolicy.DOUBLE)
      .create();

  public static void main(String[] args) {
    if (args.length < 3) {
      System.err.println(
          "usage: java -jar barefootjs-pebble-runtime.jar <templatesDir> <entryTemplateBaseName> <varsJsonFile> [scopeId]");
      System.exit(2);
      return;
    }
    String templatesDir = args[0];
    String entryName = args[1];
    String varsJsonFile = args[2];
    String scopeId = args.length >= 4 ? args[3] : "test";

    try {
      String result = render(templatesDir, entryName, varsJsonFile, scopeId);
      // Write raw UTF-8 bytes directly, NOT `System.out.print(result)`:
      // `System.out`'s charset is the JVM's platform-default (`file.
      // encoding`/`stdout.encoding`), which is NOT guaranteed to be UTF-8
      // in every environment this CLI runs in (a container with `LANG`
      // unset falls back to US-ASCII/ANSI_X3.4, silently mangling every
      // non-ASCII codepoint — emoji, CJK, accented Latin, em dashes — into
      // `?` before the bytes ever leave the JVM, independent of how the
      // CALLER decodes stdout). The render pipeline's own contract is
      // UTF-8 throughout (`vars.json` is read as UTF-8 by
      // `Files.readString`, and the TS test harness decodes this process's
      // stdout as UTF-8), so encode explicitly here rather than trust the
      // ambient platform default.
      System.out.write(result.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      System.out.flush();
    } catch (Exception e) {
      e.printStackTrace(System.err);
      System.exit(1);
    }
  }

  static String render(String templatesDir, String entryName, String varsJsonFile, String scopeId)
      throws Exception {
    FileLoader loader = new FileLoader(templatesDir);
    loader.setSuffix(".peb");
    PebbleEngine engine = new PebbleEngine.Builder()
        .loader(loader)
        .strictVariables(false)
        // Phase 3b (#2101): replaces stock Pebble's `set` tag handler with
        // one that also understands `{% set NAME %}...{% endset %}`
        // block-capture (see SetBlockExtension's own doc comment for why
        // this REPLACES rather than adds to the stock tag).
        .extension(new SetBlockExtension())
        .build();

    PebbleTemplate template = engine.getTemplate(entryName);

    String varsJson = Files.readString(Path.of(varsJsonFile));
    JsonElement varsEl = GSON.fromJson(varsJson, JsonElement.class);
    Object materialized = varsEl == null ? null : JsonDecode.materialize(varsEl);
    @SuppressWarnings("unchecked")
    Map<String, Object> vars = materialized instanceof Map
        ? (Map<String, Object>) materialized
        : new LinkedHashMap<>();

    Map<String, ChildMeta> manifest = loadManifest(templatesDir);

    Map<String, Object> context = new LinkedHashMap<>(vars);
    // (#1922) Request-scoped `searchParams()` reader: the conformance test
    // harness (`renderPebbleComponent`) seeds this special key ONLY when
    // the component imports `searchParams` (mirrors the Rust/Jinja
    // harnesses' `payload.search_params` / `SearchParams('')` binding) —
    // replaced here with a real `SearchParams` object the compiled
    // template calls as `{{ searchParams.get('key') }}`.
    Object rawSearchParams = context.remove("__bf_search_params");
    if (rawSearchParams instanceof String) {
      context.put("searchParams", new SearchParams((String) rawSearchParams));
    }
    context.put("bf", new Bf(scopeId, engine, manifest));

    StringWriter writer = new StringWriter();
    template.evaluate(writer, context);
    return writer.toString();
  }

  /**
   * Read the optional `_bf_manifest.json` sidecar the conformance test
   * harness (`packages/adapter-pebble/src/test-render.ts`'s
   * `renderPebbleComponent`) writes alongside every child `.peb` file it
   * generates — see {@link ChildMeta}'s doc comment for the wire shape
   * (`{ "<snake_case_template_name>": { "componentName", "ssrDefaults",
   * "restPropsName", "paramNames" }, ... }`) and why this is a general
   * `Main`-level facility rather than a test-only hack. Absent file (every
   * hand-written-`.peb`-template smoke test in this package) -> an empty
   * manifest, exactly like a component tree with no cross-template child
   * invocations at all.
   */
  @SuppressWarnings("unchecked")
  private static Map<String, ChildMeta> loadManifest(String templatesDir) throws Exception {
    Path manifestPath = Path.of(templatesDir, "_bf_manifest.json");
    if (!Files.exists(manifestPath)) {
      return Map.of();
    }
    JsonObject doc = GSON.fromJson(Files.readString(manifestPath), JsonObject.class);
    Map<String, ChildMeta> out = new LinkedHashMap<>();
    if (doc == null) {
      return out;
    }
    for (Map.Entry<String, JsonElement> e : doc.entrySet()) {
      JsonObject entry = e.getValue().getAsJsonObject();
      String componentName = entry.has("componentName") ? entry.get("componentName").getAsString() : e.getKey();
      Object ssrDefaultsRaw = entry.has("ssrDefaults") ? JsonDecode.materialize(entry.get("ssrDefaults")) : null;
      Map<String, Object> ssrDefaults = ssrDefaultsRaw instanceof Map
          ? (Map<String, Object>) ssrDefaultsRaw
          : new LinkedHashMap<>();
      String restPropsName = entry.has("restPropsName") && !entry.get("restPropsName").isJsonNull()
          ? entry.get("restPropsName").getAsString()
          : null;
      List<String> paramNames = new ArrayList<>();
      if (entry.has("paramNames")) {
        for (JsonElement p : entry.getAsJsonArray("paramNames")) {
          paramNames.add(p.getAsString());
        }
      }
      out.put(e.getKey(), new ChildMeta(componentName, ssrDefaults, restPropsName, paramNames));
    }
    return out;
  }
}
