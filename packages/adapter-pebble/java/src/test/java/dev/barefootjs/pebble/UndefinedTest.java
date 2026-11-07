package dev.barefootjs.pebble;

import dev.barefootjs.pebble.ext.JsLogicalExtension;
import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.loader.StringLoader;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * JS {@code undefined} as {@link Undefined#INSTANCE}, apart from Java's
 * {@code null} (JS {@code null}): spec/js-undefined-value.md, rollout step
 * U7. The golden vectors cover the value helpers; this covers the render
 * helpers and the Pebble-facing behaviour they do not.
 */
class UndefinedTest {

  private static final Object U = Undefined.INSTANCE;
  private static final Bf BF = new Bf("test");

  private static List<Object> list(Object... xs) {
    return new ArrayList<>(Arrays.asList(xs));
  }

  private static Map<String, Object> map(Object... kv) {
    Map<String, Object> out = new LinkedHashMap<>();
    for (int i = 0; i < kv.length; i += 2) {
      out.put((String) kv[i], kv[i + 1]);
    }
    return out;
  }

  private static String render(String template, Map<String, Object> vars) throws IOException {
    PebbleEngine engine = new PebbleEngine.Builder()
        .loader(new StringLoader())
        .strictVariables(false)
        .extension(new JsLogicalExtension())
        .build();
    Map<String, Object> context = new LinkedHashMap<>(vars);
    context.put("bf", BF);
    StringWriter writer = new StringWriter();
    engine.getTemplate(template).evaluate(writer, context);
    return writer.toString();
  }

  @Test
  void thePredicatesTellTheTwoNilsApart() {
    assertTrue(BF.is_undefined(U));
    assertFalse(BF.is_undefined(null));
    assertTrue(BF.is_null(null));
    assertFalse(BF.is_null(U));
    assertTrue(BF.is_nullish(U));
    assertTrue(BF.is_nullish(null));
    assertFalse(BF.is_nullish(0.0));
    assertSame(U, BF.undefined());
    assertTrue(BF.eq(U, U));
    assertFalse(BF.eq(U, null));
  }

  @Test
  void coalesceAndTruthinessReadBothNils() {
    assertEquals("d", BF.coalesce(U, "d"));
    assertEquals("d", BF.coalesce(null, "d"));
    assertEquals(0.0, BF.coalesce(0.0, "d"));
    assertFalse(BF.truthy(U));
  }

  @Test
  void displayAndToStringDiffer() {
    assertEquals("", BF.string(U));
    assertEquals("", BF.string(null));
    assertEquals("undefined", BF.to_string(U));
    assertEquals("null", BF.to_string(null));
    assertTrue(Double.isNaN(BF.to_number(U)));
    assertEquals(0.0, BF.to_number(null));
    assertTrue(Double.isNaN(BF.sub(U, 1.0)));
    assertEquals(-1.0, BF.sub(null, 1.0));
    assertEquals("undefinedx", BF.plus(U, "x"));
  }

  @Test
  void readsOfAMissingKeyAreUndefined() {
    Map<String, Object> m = map("k", null);
    assertSame(U, BF.get(m, "missing"));
    assertEquals(null, BF.get(m, "k"));
    assertSame(U, BF.get_opt(null, "k"));
    assertSame(U, BF.get_opt(U, "k"));
    assertEquals(null, BF.get_opt(m, "k"));
    assertSame(U, BF.length(map()));
    assertSame(U, BF.at(list(1.0), 5.0));
    assertSame(U, BF.find(list(map("id", 1.0)), "id", 2.0));
    assertSame(U, BF.use_context("never-provided"));
  }

  @Test
  void jsonFollowsJsonStringify() {
    assertEquals("{\"a\":null}", BF.json(map("a", null, "b", U)));
    assertEquals("[null,null]", BF.json(list(null, U)));
    assertEquals("{\"o\":{}}", BF.json(map("o", map("x", U))));
    assertSame(U, BF.json(U));
    Bf root = new Bf("r", null, Map.of(), map("a", 1.0, "b", U));
    assertEquals(" bf-p='{&quot;a&quot;:1}'", root.props_attr());
    assertEquals("<!--bf-scope:r|{\"a\":1}-->", root.scope_comment());
    // `'b' in props` holds for a present `undefined`.
    assertTrue(root.passed("b", false));
  }

  @Test
  void optionalArgumentsDefaultOnlyWhenUndefined() {
    assertEquals(list(2.0, 3.0), BF.slice(list(1.0, 2.0, 3.0), 1.0, U));
    assertEquals(list(), BF.slice(list(1.0, 2.0, 3.0), 1.0, null));
    assertEquals("1,2", BF.join(list(1.0, 2.0), U));
    assertEquals("1null2", BF.join(list(1.0, 2.0), null));
    assertEquals(",", BF.join(list(null, U)));
    assertEquals(list(1.0, 2.0, list(3.0)), BF.flat_dynamic(list(1.0, list(2.0, list(3.0))), U));
    assertEquals(list(1.0, list(2.0, list(3.0))), BF.flat_dynamic(list(1.0, list(2.0, list(3.0))), null));
  }

  @Test
  void sortPutsUndefinedLast() {
    Map<String, Object> keys = map("keys", list(map("key_kind", "self", "compare_type", "numeric", "direction", "asc")));
    assertEquals(list(1.0, 2.0, 3.0, U), BF.sort(list(3.0, U, 1.0, 2.0), keys));
    String body = "{\"kind\":\"binary\",\"op\":\"-\",\"left\":{\"kind\":\"identifier\",\"name\":\"a\"},"
        + "\"right\":{\"kind\":\"identifier\",\"name\":\"b\"}}";
    assertEquals(list(null, 1.0, 2.0, 3.0, U), BF.sort_eval(list(3.0, U, 1.0, null, 2.0), body, "a", "b", map()));
  }

  @Test
  void sinksDropBothNils() {
    assertEquals("a=\"x\"", BF.spread_attrs(map("a", "x", "b", U, "c", null)).toString());
    assertEquals("color:red", BF.style_object(list("color", "red", "margin", U, "padding", null)).toString());
    assertEquals("/p", BF.query("/p", list(true, "a", U, true, "b", null)));
  }

  @Test
  void pebbleRendersItAsNothingAndLoopsOverNothing() throws IOException {
    Map<String, Object> vars = map("u", U);
    assertEquals("[]", render("[{{ u }}]", vars));
    assertEquals("[]", render("[{% for x in u %}x{% endfor %}]", vars));
    assertEquals("no", render("{{ bf.truthy(u) ? 'yes' : 'no' }}", vars));
    assertEquals("d", render("{{ u || 'd' }}", vars));
  }

  @Test
  void theSeedGivesAnOmittedPropItsDefaultOrUndefined() {
    Map<String, Object> defaults = map(
        "n", map("propName", "n"),
        "d", map("propName", "d", "value", "D"),
        "filter", map("propName", "filter", "value", "all"));
    Map<String, Object> props = map("d", null);
    Map<String, Object> vars = DeriveStashFromDefaults.rootVars(defaults, props);
    assertEquals(map("n", U, "d", null, "filter_", "all"), vars);
  }
}
