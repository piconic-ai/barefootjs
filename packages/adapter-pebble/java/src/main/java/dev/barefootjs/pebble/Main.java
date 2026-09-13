package dev.barefootjs.pebble;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.ToNumberPolicy;
import dev.barefootjs.pebble.ext.SetBlockExtension;
import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.loader.FileLoader;
import io.pebbletemplates.pebble.template.PebbleTemplate;

import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
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
      System.out.print(result);
      System.out.flush();
    } catch (Exception e) {
      e.printStackTrace(System.err);
      System.exit(1);
    }
  }

  @SuppressWarnings("unchecked")
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
    Map<String, Object> vars = GSON.fromJson(varsJson, Map.class);
    if (vars == null) {
      vars = new LinkedHashMap<>();
    }
    Map<String, Object> context = new LinkedHashMap<>(vars);
    context.put("bf", new Bf(scopeId));

    StringWriter writer = new StringWriter();
    template.evaluate(writer, context);
    return writer.toString();
  }
}
