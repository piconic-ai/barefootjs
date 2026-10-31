package dev.barefootjs.pebble.ext;

import dev.barefootjs.pebble.Bf;
import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.loader.StringLoader;
import org.junit.jupiter.api.Test;

import java.io.StringWriter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Engine-level coverage for {@link JsLogicalExtension} (#3824): JS's
 * value-position {@code ||} / {@code &&} return the operand JS yields (a
 * falsy left one included), test it by JS truthiness, and never evaluate the
 * right operand when the left one decides the result.
 */
class JsLogicalExtensionTest {

  /** Throws when evaluated: a right operand the short circuit must skip. */
  public static final class Boom {
    public Object boom() {
      throw new IllegalStateException("right operand evaluated after the short circuit");
    }
  }

  private static String render(String template) throws Exception {
    PebbleEngine engine = new PebbleEngine.Builder()
        .loader(new StringLoader())
        .strictVariables(false)
        .extension(new SetBlockExtension())
        .extension(new JsLogicalExtension())
        .build();
    Map<String, Object> context = new HashMap<>();
    context.put("bf", new Bf("test"));
    context.put("zero", 0);
    context.put("empty", "");
    context.put("nan", Double.NaN);
    context.put("s", "s");
    context.put("list", new ArrayList<>());
    context.put("x", new Boom());
    StringWriter writer = new StringWriter();
    engine.getTemplate(template).evaluate(writer, context);
    return writer.toString();
  }

  @Test
  void orReturnsTheFirstJsTruthyOperand() throws Exception {
    assertEquals("s", render("{{ (zero || s) }}"));
    assertEquals("s", render("{{ (nan || s) }}"));
    assertEquals("s", render("{{ (missing || s) }}"));
    // An empty list is JS-truthy (Pebble's own truthiness reads it as false).
    assertEquals("0", render("{{ (list || s) | length }}"));
    assertEquals("|", render("{{ (zero || empty) }}|"));
  }

  @Test
  void andReturnsAFalsyLeftOperandItself() throws Exception {
    assertEquals("0", render("{{ (zero && x.boom()) }}"));
    assertEquals("|", render("{{ (empty && x.boom()) }}|"));
    assertEquals("0", render("{{ (s && zero) }}"));
  }

  @Test
  void theRightOperandIsSkippedWhenTheLeftDecides() throws Exception {
    assertEquals("s", render("{{ (s || x.boom()) }}"));
    assertEquals("s", render("{{ ((zero || empty) || s) }}"));
    assertEquals("s", render("{{ ((s && zero) || s) }}"));
    assertEquals("|", render("{{ ((zero || missing) && x.boom()) }}|"));
  }

  @Test
  void precedenceMatchesJs() throws Exception {
    // `&&` binds tighter than `||`, a comparison tighter than both.
    assertEquals("s", render("{{ zero || zero && x.boom() || s }}"));
    assertEquals("s", render("{{ zero == 0 && s }}"));
  }

  @Test
  void aSixteenOperandChainOfFalsyOperandsYieldsTheLast() throws Exception {
    List<String> names = new ArrayList<>();
    for (int i = 0; i < 15; i++) names.add(i % 2 == 0 ? "zero" : "empty");
    names.add("s");
    assertEquals("s", render("{{ " + String.join(" || ", names) + " }}"));
  }
}
