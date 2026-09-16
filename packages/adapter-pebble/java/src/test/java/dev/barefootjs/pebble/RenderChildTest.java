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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Direct JUnit coverage for {@link Bf#render_child} (BarefootJS #2101 Phase
 * 4) — exercises the real Pebble engine against a small `FileLoader`
 * directory of `.peb` templates (a {@code StringLoader}, unlike
 * {@code SetBlockExtensionTest}'s use of it, treats its "name" argument AS
 * the template's own source text — it can't resolve one named template
 * from within another, which is exactly the cross-template dispatch under
 * test here). Since this test lives in the same package as {@link Bf} /
 * {@link ChildMeta}, it builds `ChildMeta` instances directly rather than
 * round-tripping through `Main`'s `_bf_manifest.json` file format — a more
 * direct unit test of `render_child` itself; the manifest FILE-reading path
 * is covered separately by the `renderPebbleComponent` conformance harness
 * driving real compiled fixtures through `Main`.
 */
class RenderChildTest {

  private static PebbleEngine engineFor(Path dir) {
    FileLoader loader = new FileLoader(dir.toString());
    loader.setSuffix(".peb");
    return new PebbleEngine.Builder().loader(loader).strictVariables(false).build();
  }

  private static String renderEntry(
      Path dir, String entry, Map<String, Object> vars, String scopeId, Map<String, ChildMeta> manifest)
      throws Exception {
    PebbleEngine engine = engineFor(dir);
    PebbleTemplate template = engine.getTemplate(entry);
    Map<String, Object> context = new LinkedHashMap<>(vars);
    context.put("bf", new Bf(scopeId, engine, manifest));
    StringWriter writer = new StringWriter();
    template.evaluate(writer, context);
    return writer.toString();
  }

  @Test
  void plainChildRender(@TempDir Path dir) throws Exception {
    Files.writeString(dir.resolve("parent.peb"), "{{ bf.render_child('child', {'label': 'hi'}) | raw }}");
    Files.writeString(dir.resolve("child.peb"), "<span>{{ label }}</span>");

    String html = renderEntry(dir, "parent", Map.of(), "test", Map.of());
    assertEquals("<span>hi</span>", html);
  }

  @Test
  void propDefaultFallbackWhenCallerOmitsIt(@TempDir Path dir) throws Exception {
    // Caller sends no `variant` prop at all.
    Files.writeString(dir.resolve("parent.peb"), "{{ bf.render_child('child', {}) | raw }}");
    Files.writeString(dir.resolve("child.peb"), "<span>{{ variant }}</span>");

    Map<String, ChildMeta> manifest = Map.of(
        "child",
        new ChildMeta(
            "Child",
            Map.of("variant", Map.of("propName", "variant", "value", "primary")),
            null,
            List.of("variant")));

    String html = renderEntry(dir, "parent", Map.of(), "test", manifest);
    assertEquals("<span>primary</span>", html);
  }

  @Test
  void callerSuppliedPropOverridesTheDefault(@TempDir Path dir) throws Exception {
    Files.writeString(dir.resolve("parent.peb"), "{{ bf.render_child('child', {'variant': 'secondary'}) | raw }}");
    Files.writeString(dir.resolve("child.peb"), "<span>{{ variant }}</span>");

    Map<String, ChildMeta> manifest = Map.of(
        "child",
        new ChildMeta(
            "Child",
            Map.of("variant", Map.of("propName", "variant", "value", "primary")),
            null,
            List.of("variant")));

    String html = renderEntry(dir, "parent", Map.of(), "test", manifest);
    assertEquals("<span>secondary</span>", html);
  }

  @Test
  void slotBasedScopeIdDerivation(@TempDir Path dir) throws Exception {
    Files.writeString(
        dir.resolve("parent.peb"),
        "{{ bf.render_child('child', {'_bf_slot': 's0'}) | raw }}");
    Files.writeString(
        dir.resolve("child.peb"),
        "<span bf-s=\"{{ bf.scope_attr() }}\" {{ bf.hydration_attrs() | raw }}></span>");

    String html = renderEntry(dir, "parent", Map.of(), "Parent_test", Map.of());
    assertEquals("<span bf-s=\"Parent_test_s0\" bf-h=\"Parent_test\" bf-m=\"s0\"></span>", html);
  }

  @Test
  void noSlotMintsARandomComponentPrefixedScopeId(@TempDir Path dir) throws Exception {
    Files.writeString(dir.resolve("parent.peb"), "{{ bf.render_child('child', {}) | raw }}");
    Files.writeString(
        dir.resolve("child.peb"),
        "<span bf-s=\"{{ bf.scope_attr() }}\" {{ bf.hydration_attrs() | raw }}></span>");

    Map<String, ChildMeta> manifest = Map.of("child", new ChildMeta("Child", Map.of(), null, List.of()));

    String html = renderEntry(dir, "parent", Map.of(), "test", manifest);
    // No `_bf_slot` -> no `bf-h`/`bf-m`, and hydration_attrs() stays empty
    // (bf-r only marks a client-side hydration island root, orthogonal to
    // slot presence — see packages/shared/src/markers.ts) plus a
    // `Child_<rand6>` scope id.
    assertTrue(html.matches("<span bf-s=\"Child_[0-9a-f]{6}\" ></span>"));
  }

  @Test
  void nestedGrandchildRendering(@TempDir Path dir) throws Exception {
    Files.writeString(dir.resolve("parent.peb"), "{{ bf.render_child('child', {'_bf_slot': 's0'}) | raw }}");
    Files.writeString(
        dir.resolve("child.peb"),
        "<div>{{ bf.render_child('grandchild', {'_bf_slot': 'g0', 'label': 'deep'}) | raw }}</div>");
    Files.writeString(
        dir.resolve("grandchild.peb"),
        "<em bf-s=\"{{ bf.scope_attr() }}\">{{ label }}</em>");

    String html = renderEntry(dir, "parent", Map.of(), "Parent_test", Map.of());
    assertEquals("<div><em bf-s=\"Parent_test_s0_g0\">deep</em></div>", html);
  }

  @Test
  void renderChildWithNoEngineThrows() {
    Bf bf = new Bf("test");
    assertThrows(IllegalStateException.class, () -> bf.render_child("child", Map.of()));
  }
}
