package dev.barefootjs.pebble;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.loader.StringLoader;
import io.pebbletemplates.pebble.template.PebbleTemplate;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.StringWriter;
import java.io.UncheckedIOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * JS primitive-operation vector conformance
 * (`spec/js-primitive-semantics.md`, "Conformance"): every
 * `packages/adapter-tests/vectors/primitives/<op>.json` case runs against
 * the {@link Bf} helper a compiled `.peb` template calls for that
 * operation. The step-0 expected-failure ledger
 * (`packages/adapter-tests/vectors/primitives-expected-failures.json`) lists
 * the cases that fail on Java today, each naming the rollout step that
 * removes it. It may only shrink: an unlisted failure fails, and so does a
 * listed case that now passes. Skipped outside a monorepo checkout.
 */
class PrimitiveVectorsTest {

  private static final Path VECTORS_DIR = Path.of("../../adapter-tests/vectors").normalize();

  private static final Bf BF = new Bf("test");

  /**
   * One binding per op, to the helper compiled templates call ({@code eq}
   * for {@code strict_eq}). An op with no binding fails.
   */
  private static final Map<String, Function<List<Object>, Object>> BINDINGS = Map.ofEntries(
      Map.entry("truthy", a -> BF.truthy(a.get(0))),
      Map.entry("to_number", a -> BF.to_number(a.get(0))),
      Map.entry("to_string", a -> BF.to_string(a.get(0))),
      Map.entry("get", a -> BF.get(a.get(0), a.get(1))),
      Map.entry("strict_eq", a -> BF.eq(a.get(0), a.get(1))),
      Map.entry("lt", a -> BF.lt(a.get(0), a.get(1))),
      Map.entry("le", a -> BF.le(a.get(0), a.get(1))),
      Map.entry("gt", a -> BF.gt(a.get(0), a.get(1))),
      Map.entry("ge", a -> BF.ge(a.get(0), a.get(1))),
      Map.entry("plus", a -> BF.plus(a.get(0), a.get(1))),
      Map.entry("neg", a -> BF.neg(a.get(0))));

  /** A real Pebble {@code if}: the native test the adapter spells for a proven boolean. */
  private static final PebbleTemplate PEBBLE_IF = new PebbleEngine.Builder()
      .loader(new StringLoader())
      .strictVariables(false)
      .build()
      .getTemplate("{% if v %}1{% else %}0{% endif %}");

  /**
   * One binding per op the Pebble adapter can spell natively, to the native
   * Pebble operator: a test is Pebble's own {@code if} / {@code not}. It runs
   * over the cases whose domain the adapter's NATIVE_SAFE table claims
   * ({@code primitives-native-safe.json}; spec/js-primitive-semantics.md,
   * "Conformance" item 3).
   */
  private static final Map<String, Function<List<Object>, Object>> NATIVE_BINDINGS = Map.ofEntries(
      Map.entry("truthy", a -> pebbleIf(a.get(0))));

  private static Object pebbleIf(Object v) {
    Map<String, Object> context = new LinkedHashMap<>();
    context.put("v", v);
    StringWriter writer = new StringWriter();
    try {
      PEBBLE_IF.evaluate(writer, context);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
    return writer.toString().equals("1");
  }

  /** Every native claim gives the JS answer on every case it covers; no ledger applies. */
  @Test
  void nativeClaims() throws IOException {
    Path claimsPath = VECTORS_DIR.resolve("primitives-native-safe.json");
    Assumptions.assumeTrue(Files.isRegularFile(claimsPath), "native claims not available outside the monorepo checkout");
    JsonObject claims = JsonParser.parseString(Files.readString(claimsPath)).getAsJsonObject()
        .getAsJsonObject("runtimes").getAsJsonObject("java");
    List<String> problems = new ArrayList<>();
    int ran = 0;
    for (String fn : claims.keySet()) {
      Function<List<Object>, Object> bind = NATIVE_BINDINGS.get(fn);
      if (bind == null) {
        problems.add("no native Pebble binding for '" + fn + "' -- add it to NATIVE_BINDINGS");
        continue;
      }
      Set<String> domains = new HashSet<>();
      claims.getAsJsonArray(fn).forEach(d -> domains.add(d.getAsString()));
      JsonArray cases = JsonParser.parseString(Files.readString(VECTORS_DIR.resolve("primitives").resolve(fn + ".json")))
          .getAsJsonObject().getAsJsonArray("cases");
      for (JsonElement el : cases) {
        JsonObject c = el.getAsJsonObject();
        if (!domains.contains(c.get("domain").getAsString())) {
          continue;
        }
        ran++;
        String failure = run(c, bind);
        if (failure != null) {
          problems.add("NATIVE-FAIL " + fn + "/" + c.get("note").getAsString() + " (domain "
              + c.get("domain").getAsString() + "): " + failure);
        }
      }
    }
    System.out.println("primitives (native): " + ran + " claimed cases");
    assertTrue(problems.isEmpty(), "\n" + String.join("\n", problems));
  }

  @Test
  void primitiveVectors() throws IOException {
    Path dir = VECTORS_DIR.resolve("primitives");
    Assumptions.assumeTrue(Files.isDirectory(dir), "primitive vectors not available outside the monorepo checkout");
    List<Path> files = new ArrayList<>();
    try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "*.json")) {
      stream.forEach(files::add);
    }
    files.sort(null);
    assertTrue(!files.isEmpty(), "no primitives/*.json under " + dir);

    JsonObject ledger = JsonParser.parseString(
        Files.readString(VECTORS_DIR.resolve("primitives-expected-failures.json"))).getAsJsonObject();
    JsonObject expected = ledger.getAsJsonObject("runtimes").getAsJsonObject("java");

    List<String> problems = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    int total = 0;
    int passed = 0;
    for (Path path : files) {
      JsonArray cases = JsonParser.parseString(Files.readString(path)).getAsJsonObject().getAsJsonArray("cases");
      for (JsonElement el : cases) {
        JsonObject c = el.getAsJsonObject();
        String key = c.get("fn").getAsString() + "/" + c.get("note").getAsString();
        seen.add(key);
        total++;
        String failure = run(c);
        boolean listed = expected.has(key);
        if (failure == null) {
          passed++;
          if (listed) {
            problems.add("ledger entry '" + key + "' now passes; remove it from the ledger (step "
                + expected.getAsJsonObject(key).get("step").getAsInt() + ")");
          }
        } else if (!listed) {
          problems.add("UNEXPECTED-FAIL " + key + ": " + failure);
        }
      }
    }
    for (String key : expected.keySet()) {
      if (!seen.contains(key)) {
        problems.add("ledger entry '" + key + "' matches no primitives case -- renamed note?");
      }
    }
    System.out.println("primitives: " + total + " cases, " + passed + " pass, " + expected.size()
        + " in the expected-failure ledger");
    assertTrue(problems.isEmpty(), "\n" + String.join("\n", problems));
  }

  /** Runs one case; returns null when it matches, else what went wrong. */
  private static String run(JsonObject c) {
    return run(c, BINDINGS.get(c.get("fn").getAsString()));
  }

  /** Runs one case through {@code bind}; returns null when it matches, else what went wrong. */
  private static String run(JsonObject c, Function<List<Object>, Object> bind) {
    if (bind == null) {
      return "no Java binding for '" + c.get("fn").getAsString() + "' -- add it to BINDINGS";
    }
    List<Object> args = new ArrayList<>();
    for (JsonElement a : c.getAsJsonArray("args")) {
      args.add(decode(a));
    }
    Object got;
    try {
      got = bind.apply(args);
    } catch (RuntimeException e) {
      return "threw " + e;
    }
    Object expect = decode(c.get("expect"));
    return match(got, expect) ? null : "got " + got + ", want " + expect;
  }

  /** JSON to runtime value: numbers as doubles, the `$num` sentinel (`-0` included) resolved. */
  private static Object decode(JsonElement el) {
    if (el == null || el.isJsonNull()) {
      return null;
    }
    if (el.isJsonPrimitive()) {
      JsonPrimitive p = el.getAsJsonPrimitive();
      if (p.isBoolean()) {
        return p.getAsBoolean();
      }
      return p.isNumber() ? (Object) p.getAsDouble() : p.getAsString();
    }
    if (el.isJsonArray()) {
      List<Object> out = new ArrayList<>();
      el.getAsJsonArray().forEach(e -> out.add(decode(e)));
      return out;
    }
    JsonObject obj = el.getAsJsonObject();
    if (obj.size() == 1 && obj.has("$num")) {
      switch (obj.get("$num").getAsString()) {
        case "NaN": return Double.NaN;
        case "Infinity": return Double.POSITIVE_INFINITY;
        case "-Infinity": return Double.NEGATIVE_INFINITY;
        case "-0": return -0.0;
        default: throw new IllegalArgumentException("unknown $num sentinel " + obj);
      }
    }
    Map<String, Object> out = new LinkedHashMap<>();
    obj.entrySet().forEach(e -> out.put(e.getKey(), decode(e.getValue())));
    return out;
  }

  /**
   * The primitives contract: types are strict (a Boolean for a boolean, a
   * Number for a number, a String for a string), numbers compare as doubles
   * and a zero compares by sign.
   */
  @SuppressWarnings("unchecked")
  private static boolean match(Object got, Object expect) {
    if (expect == null) {
      return got == null;
    }
    if (expect instanceof Number) {
      if (!(got instanceof Number)) {
        return false;
      }
      double e = ((Number) expect).doubleValue();
      double g = ((Number) got).doubleValue();
      if (Double.isNaN(e)) {
        return Double.isNaN(g);
      }
      if (e == 0 && g == 0) {
        return Math.copySign(1.0, e) == Math.copySign(1.0, g);
      }
      return e == g;
    }
    if (expect instanceof List) {
      if (!(got instanceof List) || ((List<?>) got).size() != ((List<?>) expect).size()) {
        return false;
      }
      for (int i = 0; i < ((List<?>) expect).size(); i++) {
        if (!match(((List<?>) got).get(i), ((List<?>) expect).get(i))) {
          return false;
        }
      }
      return true;
    }
    if (expect instanceof Map) {
      if (!(got instanceof Map) || ((Map<?, ?>) got).size() != ((Map<?, ?>) expect).size()) {
        return false;
      }
      for (Map.Entry<String, Object> e : ((Map<String, Object>) expect).entrySet()) {
        Map<String, Object> g = (Map<String, Object>) got;
        if (!g.containsKey(e.getKey()) || !match(g.get(e.getKey()), e.getValue())) {
          return false;
        }
      }
      return true;
    }
    return expect.equals(got);
  }
}
