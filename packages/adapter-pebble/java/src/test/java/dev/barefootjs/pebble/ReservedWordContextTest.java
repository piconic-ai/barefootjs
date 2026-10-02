package dev.barefootjs.pebble;

import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.loader.FileLoader;
import io.pebbletemplates.pebble.template.PebbleTemplate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Reserved-word prop / signal names in the render context (#3250).
 *
 * The compiled `.peb` reads every prop / signal through `pebbleIdent`, so a
 * signal named `filter` is read as `filter_`. A context keyed by the source
 * name renders it empty, with no error — what happened to the Spring
 * integration's root renders (`/todos-ssr`'s "All" filter link lost its
 * `selected` class) and to a child's reserved-word signal default.
 */
class ReservedWordContextTest {

  private static PebbleEngine engineFor(Path dir) {
    FileLoader loader = new FileLoader(dir.toString());
    loader.setSuffix(".peb");
    return new PebbleEngine.Builder().loader(loader).strictVariables(false).build();
  }

  private static String render(Path dir, String entry, Map<String, Object> vars, Map<String, ChildMeta> manifest)
      throws Exception {
    PebbleEngine engine = engineFor(dir);
    PebbleTemplate template = engine.getTemplate(entry);
    Map<String, Object> context = new LinkedHashMap<>(vars);
    context.put("bf", new Bf("test", engine, manifest));
    StringWriter writer = new StringWriter();
    template.evaluate(writer, context);
    return writer.toString();
  }

  // The shape the Pebble adapter compiles `className={filter() === 'all' ? 'selected' : ''}` to.
  private static final String FILTER_LINK = "<a class=\"{{ (filter_ == 'all') ? 'selected' : '' }}\">All</a>";

  private static Map<String, Object> signalDefault(Object value) {
    Map<String, Object> d = new LinkedHashMap<>();
    d.put("value", value);
    return d;
  }

  @Test
  void deriveKeysEntriesByTheTemplatesName() {
    Map<String, Object> defaults = Map.of("filter", signalDefault("all"), "count", signalDefault(0.0));
    Map<String, Object> vars = DeriveStashFromDefaults.derive(defaults, Map.of());
    assertEquals(Map.of("filter_", "all", "count", 0.0), vars);
  }

  @Test
  void deriveLooksUpAReservedWordPropByItsMangledName() {
    Map<String, Object> d = new LinkedHashMap<>();
    d.put("propName", "default");
    d.put("value", "fallback");
    // `render_child` hands `derive` the caller's props already mangled.
    Map<String, Object> vars = DeriveStashFromDefaults.derive(Map.of("default", d), Map.of("default_", "given"));
    assertEquals(Map.of("default_", "given"), vars);
  }

  @Test
  void rootVarsMangleDefaultsPropsAndOverlays() {
    Map<String, Object> d = new LinkedHashMap<>();
    d.put("propName", "class");
    d.put("value", "none");
    Map<String, Object> vars = DeriveStashFromDefaults.rootVars(
        Map.of("filter", signalDefault("all"), "class", d),
        Map.of("class", "from-props"),
        Map.of("filter", "active"));
    assertEquals(Map.of("filter_", "active", "class_", "from-props"), vars);
  }

  @Test
  void rootRenderOfAReservedWordSignalDefault(@TempDir Path dir) throws Exception {
    Files.writeString(dir.resolve("repro.peb"), FILTER_LINK);
    Map<String, Object> vars = DeriveStashFromDefaults.rootVars(Map.of("filter", signalDefault("all")), Map.of());
    assertEquals("<a class=\"selected\">All</a>", render(dir, "repro", vars, Map.of()));
  }

  @Test
  void rootRenderOfAReservedWordStashOverride(@TempDir Path dir) throws Exception {
    // `TodoController` stashes `"filter", "all"` in source names.
    Files.writeString(dir.resolve("repro.peb"), FILTER_LINK);
    Map<String, Object> vars = DeriveStashFromDefaults.rootVars(
        Map.of("filter", signalDefault("none")), Map.of(), Map.of("filter", "all"));
    assertEquals("<a class=\"selected\">All</a>", render(dir, "repro", vars, Map.of()));
  }

  @Test
  void childRenderOfAReservedWordSignalDefault(@TempDir Path dir) throws Exception {
    Files.writeString(dir.resolve("parent.peb"), "{{ bf.render_child('child', {}) | raw }}");
    Files.writeString(dir.resolve("child.peb"), FILTER_LINK);
    Map<String, ChildMeta> manifest = Map.of(
        "child", new ChildMeta("Child", Map.of("filter", signalDefault("all")), null, List.of()));
    assertEquals("<a class=\"selected\">All</a>", render(dir, "parent", Map.of(), manifest));
  }

  @Test
  void childRenderOfAReservedWordPropSeedingASignal(@TempDir Path dir) throws Exception {
    Files.writeString(dir.resolve("parent.peb"), "{{ bf.render_child('child', {'filter': 'all'}) | raw }}");
    Files.writeString(dir.resolve("child.peb"), FILTER_LINK);
    Map<String, Object> d = new LinkedHashMap<>();
    d.put("propName", "filter");
    d.put("value", "none");
    Map<String, ChildMeta> manifest = Map.of("child", new ChildMeta("Child", Map.of("filter", d), null, List.of("filter")));
    assertEquals("<a class=\"selected\">All</a>", render(dir, "parent", Map.of(), manifest));
  }
}
