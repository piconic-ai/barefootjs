package dev.barefootjs.pebble;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.ToNumberPolicy;
import dev.barefootjs.pebble.eval.Evaluator;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Golden `ParsedExpr` evaluator conformance
 * (`spec/compiler.md`, "ParsedExpr Evaluator Semantics"): one JSON-driven
 * JUnit test per case in
 * `packages/adapter-tests/vectors/eval-vectors.json`, running the case's
 * `expr` tree through {@link Evaluator} against its `env` and asserting
 * an EXACT match (no divergence allowance — every backend must match the
 * JS reference exactly here, per the vectors README's "Value-compat
 * comparison contract").
 */
class EvalVectorsTest {

  private static final Path VECTORS_PATH =
      Path.of("../../adapter-tests/vectors/eval-vectors.json").normalize();

  private static final Gson GSON = new GsonBuilder()
      .setObjectToNumberStrategy(ToNumberPolicy.DOUBLE)
      .create();

  @TestFactory
  Stream<DynamicTest> evalVectors() throws IOException {
    if (!Files.exists(VECTORS_PATH)) {
      return Stream.of(DynamicTest.dynamicTest(
          "skipped (golden vectors not available outside the monorepo checkout)", () -> {}));
    }
    JsonObject doc = GSON.fromJson(Files.readString(VECTORS_PATH), JsonObject.class);
    JsonArray cases = doc.getAsJsonArray("cases");

    List<DynamicTest> tests = new ArrayList<>();
    int i = 0;
    for (JsonElement el : cases) {
      JsonObject c = el.getAsJsonObject();
      String note = c.has("note") ? c.get("note").getAsString() : ("case_" + i);
      String src = c.has("src") ? c.get("src").getAsString() : "";
      String testName = note + " (" + src + ")";
      i++;

      tests.add(DynamicTest.dynamicTest(testName, () -> {
        JsonObject expr = c.getAsJsonObject("expr");
        Map<String, Object> env = toEnv(c.getAsJsonObject("env"));
        Object got = Evaluator.evaluate(expr, env);
        Object expect = decodeExpect(c.get("expect"));
        assertTrue(strictMatch(got, expect),
            testName + ": got " + explain(got) + ", want " + explain(expect));
      }));
    }
    return tests.stream();
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> toEnv(JsonObject envObj) {
    Map<String, Object> env = new LinkedHashMap<>();
    for (Map.Entry<String, JsonElement> e : envObj.entrySet()) {
      env.put(e.getKey(), materialize(e.getValue()));
    }
    return env;
  }

  private static Object materialize(JsonElement el) {
    if (el.isJsonNull()) {
      return null;
    }
    if (el.isJsonPrimitive()) {
      com.google.gson.JsonPrimitive p = el.getAsJsonPrimitive();
      if (p.isBoolean()) {
        return p.getAsBoolean();
      }
      if (p.isNumber()) {
        return p.getAsDouble();
      }
      return p.getAsString();
    }
    if (el.isJsonArray()) {
      List<Object> out = new ArrayList<>();
      for (JsonElement e : el.getAsJsonArray()) {
        out.add(materialize(e));
      }
      return out;
    }
    Map<String, Object> out = new LinkedHashMap<>();
    for (Map.Entry<String, JsonElement> e : el.getAsJsonObject().entrySet()) {
      out.put(e.getKey(), materialize(e.getValue()));
    }
    return out;
  }

  private static Object decodeExpect(JsonElement el) {
    if (el == null || el.isJsonNull()) {
      return null;
    }
    if (el.isJsonObject()) {
      JsonObject obj = el.getAsJsonObject();
      if (obj.size() == 1 && obj.has("$num")) {
        switch (obj.get("$num").getAsString()) {
          case "NaN": return Double.NaN;
          case "Infinity": return Double.POSITIVE_INFINITY;
          case "-Infinity": return Double.NEGATIVE_INFINITY;
        }
      }
    }
    return materialize(el);
  }

  /**
   * STRICT match: unlike the helper-vector harness, the evaluator contract
   * requires the real Java type to agree with the reference's JS type
   * (a boolean must be a real boolean, a number-vs-string distinction must
   * be preserved) — see the vectors README's evaluator strictness note.
   */
  @SuppressWarnings("unchecked")
  private static boolean strictMatch(Object got, Object expect) {
    if (expect == null) {
      return got == null;
    }
    if (expect instanceof Boolean) {
      return (got instanceof Boolean) && got.equals(expect);
    }
    if (expect instanceof Number) {
      if (!(got instanceof Number)) {
        return false;
      }
      double e = ((Number) expect).doubleValue();
      double g = ((Number) got).doubleValue();
      return Double.isNaN(e) ? Double.isNaN(g) : e == g;
    }
    if (expect instanceof String) {
      return (got instanceof String) && got.equals(expect);
    }
    if (expect instanceof List) {
      if (!(got instanceof List)) {
        return false;
      }
      List<Object> ge = (List<Object>) expect;
      List<Object> gg = (List<Object>) got;
      if (ge.size() != gg.size()) {
        return false;
      }
      for (int i = 0; i < ge.size(); i++) {
        if (!strictMatch(gg.get(i), ge.get(i))) {
          return false;
        }
      }
      return true;
    }
    if (expect instanceof Map) {
      if (!(got instanceof Map)) {
        return false;
      }
      Map<String, Object> me = (Map<String, Object>) expect;
      Map<String, Object> mg = (Map<String, Object>) got;
      if (me.size() != mg.size()) {
        return false;
      }
      for (Map.Entry<String, Object> e : me.entrySet()) {
        if (!mg.containsKey(e.getKey()) || !strictMatch(mg.get(e.getKey()), e.getValue())) {
          return false;
        }
      }
      return true;
    }
    return got != null && got.equals(expect);
  }

  private static String explain(Object v) {
    return v == null ? "null" : v.toString();
  }
}
