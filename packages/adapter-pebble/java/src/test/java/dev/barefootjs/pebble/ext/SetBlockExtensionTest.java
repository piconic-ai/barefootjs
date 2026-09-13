package dev.barefootjs.pebble.ext;

import dev.barefootjs.pebble.Bf;
import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.loader.StringLoader;
import io.pebbletemplates.pebble.template.PebbleTemplate;
import org.junit.jupiter.api.Test;

import java.io.StringWriter;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Direct engine-level coverage for {@link SetBlockExtension} /
 * {@link SetBlockTokenParser} / {@link SetBlockNode} (BarefootJS #2101
 * Phase 3b) — exercises the real Pebble parser/renderer (via
 * {@link StringLoader}, so no filesystem fixtures are needed) rather than
 * the golden-vector-driven {@code Bf} unit tests in the parent package,
 * since what's under test here is TAG PARSING, not a {@code bf.*} helper
 * method.
 */
class SetBlockExtensionTest {

  private static String render(String template, Map<String, Object> vars) throws Exception {
    PebbleEngine engine = new PebbleEngine.Builder()
        .loader(new StringLoader())
        .strictVariables(false)
        .extension(new SetBlockExtension())
        .build();
    PebbleTemplate compiled = engine.getTemplate(template);
    Map<String, Object> context = new LinkedHashMap<>(vars);
    context.put("bf", new Bf("test"));
    StringWriter writer = new StringWriter();
    compiled.evaluate(writer, context);
    return writer.toString();
  }

  @Test
  void capturesABlockBodyAsAString() throws Exception {
    String out = render("{% set greeting %}Hello, World!{% endset %}{{ greeting }}", Map.of());
    assertEquals("Hello, World!", out);
  }

  @Test
  void capturedVariableCanBePassedAsAHelperArgument() throws Exception {
    // The exact shape `pebble-adapter.ts` emits for an async fallback:
    // `{% set X %}...{% endset %}{{ bf.async_boundary('id', X) | raw }}`.
    String out = render(
        "{% set fallback %}Loading...{% endset %}{{ bf.async_boundary('boundary-1', fallback) | raw }}",
        Map.of());
    assertEquals("<div bf-async=\"boundary-1\">Loading...</div>", out);
  }

  @Test
  void capturedBodyPreservesRawInterpolatedMarkup() throws Exception {
    // The exact shape used for JSX-children forwarding: dynamic content
    // inside the captured block is already wrapped in `bf.string(...)` and
    // suffixed `| raw` by the TS adapter, same as every other text
    // interpolation position.
    String out = render(
        "{% set children %}<b>{{ bf.string(name) | raw }}</b>{% endset %}{{ children | raw }}",
        Map.of("name", "World"));
    assertEquals("<b>World</b>", out);
  }

  @Test
  void nestedSetBlocksResolveIndependently() throws Exception {
    String out = render(
        "{% set outer %}before-{% set inner %}INNER{% endset %}[{{ inner }}]-after{% endset %}{{ outer }}",
        Map.of());
    assertEquals("before-[INNER]-after", out);
  }

  @Test
  void assignmentFormStillWorks() throws Exception {
    // Regression: this extension REPLACES stock Pebble's `set` tag handler
    // entirely (see SetBlockTokenParser's doc comment) — the plain
    // `{% set NAME = EXPRESSION %}` form must keep working unchanged.
    // `bf.string(...)` (not a bare `{{ x }}`) sidesteps Pebble's own
    // Long/Double `.toString()` formatting quirk (README "Divergence 2") —
    // irrelevant to what THIS test pins (tag parsing), not number
    // formatting.
    String out = render("{% set x = 1 + 2 %}{{ bf.string(x) | raw }}", Map.of());
    assertEquals("3", out);
  }

  @Test
  void selfReferencingAssignmentStillResolvesFromTheEnclosingScope() throws Exception {
    // Phase 3a's research (README "Divergence 9") confirmed this ordering
    // for stock `set`; pin it here too since this extension re-implements
    // the assignment branch rather than delegating to SetTokenParser.
    String out = render("{% set x = x + 1 %}{{ bf.string(x) | raw }}", Map.of("x", 5.0));
    assertEquals("6", out);
  }

  @Test
  void missingEndsetTagIsAParseError() {
    assertThrows(Exception.class, () -> render("{% set x %}unterminated", Map.of()));
  }
}
