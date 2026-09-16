package dev.barefootjs.pebble;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.ToNumberPolicy;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * Golden helper-vector conformance (`spec/template-helpers.md`): one
 * JSON-driven JUnit test per case in
 * `packages/adapter-tests/vectors/vectors.json`, binding each canonical
 * `fn` to the exact {@link Bf} method a compiled `.peb` template would
 * call, asserting value-compat equality against the JS-computed
 * `expect` (or the pinned divergence in {@code vector-divergences.json}).
 *
 * <p>Structurally mirrors
 * {@code packages/adapter-erb/test/helper_vectors_test.rb} (the closest
 * worked JSON-driven-runner example per the vectors README's "Adding a
 * new backend" section) adapted to JUnit 5's {@code @TestFactory} dynamic
 * tests.
 */
class HelperVectorsTest {

  private static final Path VECTORS_PATH =
      Path.of("../../adapter-tests/vectors/vectors.json").normalize();
  private static final Path DIVERGENCES_PATH =
      Path.of("src/test/resources/vector-divergences.json").normalize();

  private static final Gson GSON = new GsonBuilder()
      .setObjectToNumberStrategy(ToNumberPolicy.DOUBLE)
      .create();

  private static final Bf BF = new Bf("test");

  @TestFactory
  Stream<DynamicTest> helperVectors() throws IOException {
    if (!Files.exists(VECTORS_PATH)) {
      return Stream.of(DynamicTest.dynamicTest(
          "skipped (golden vectors not available outside the monorepo checkout)", () -> {}));
    }
    JsonObject doc = GSON.fromJson(Files.readString(VECTORS_PATH), JsonObject.class);
    JsonArray cases = doc.getAsJsonArray("cases");

    JsonObject divergencesDoc = GSON.fromJson(Files.readString(DIVERGENCES_PATH), JsonObject.class);
    JsonObject divergences = divergencesDoc.getAsJsonObject("divergences");
    JsonObject unsupported = divergencesDoc.getAsJsonObject("unsupported");

    Set<String> vectorKeys = new java.util.HashSet<>();
    List<DynamicTest> tests = new ArrayList<>();

    for (JsonElement el : cases) {
      JsonObject c = el.getAsJsonObject();
      String fn = c.get("fn").getAsString();
      String note = c.get("note").getAsString();
      String key = fn + "/" + note;
      vectorKeys.add(key);

      tests.add(DynamicTest.dynamicTest(key, () -> {
        if (unsupported.has(fn)) {
          return; // visibly skipped: no binding yet, declared in vector-divergences.json
        }
        List<Object> args = new ArrayList<>();
        for (JsonElement a : c.getAsJsonArray("args")) {
          args.add(materialize(a));
        }

        Object got;
        RuntimeException thrown = null;
        try {
          got = invoke(fn, args);
        } catch (RuntimeException e) {
          got = null;
          thrown = e;
        }

        if (divergences.has(key)) {
          JsonObject d = divergences.getAsJsonObject(key).getAsJsonObject();
          if (d.has("throws") && d.get("throws").getAsBoolean()) {
            assertTrue(thrown != null, key + ": expected the call to raise, got " + got);
            return;
          }
          if (thrown != null) {
            fail(key + " (declared divergence): raised unexpectedly: " + thrown);
          }
          Object expect = decodeExpect(c.get("expect"));
          assertTrue(!valueMatch(got, expect),
              "stale divergence declaration for '" + key + "' -- the backend now matches JS; remove it");
          Object pinned = decodeExpect(d.get("expect"));
          assertTrue(valueMatch(got, pinned),
              key + " (declared divergence): got " + got + ", pinned " + pinned);
          return;
        }

        if (thrown != null) {
          fail(key + " raised: " + thrown, thrown);
        }
        Object expect = decodeExpect(c.get("expect"));
        assertTrue(valueMatch(got, expect), key + ": got " + explain(got) + ", want " + explain(expect));
      }));
    }

    // Static check: every declared divergence/unsupported key names a real vector case/fn.
    tests.add(DynamicTest.dynamicTest("zzz_every_declaration_matches_a_vector", () -> {
      for (String k : divergences.keySet()) {
        assertTrue(vectorKeys.contains(k), "divergence declaration '" + k + "' matches no vector case");
      }
    }));

    return tests.stream();
  }

  // ---------------------------------------------------------------------
  // fn -> Bf method dispatch. Canonical arg order/shape per
  // spec/template-helpers.md; higher-order/sort/reduce use the SAME
  // canonical projection form the spec documents (reshaped here into
  // whatever call shape the real .peb templates actually use, exactly
  // like the Ruby/Go/Perl harnesses do for their own native shapes).
  // ---------------------------------------------------------------------

  @SuppressWarnings("unchecked")
  private static Object invoke(String fn, List<Object> a) {
    switch (fn) {
      case "add": return BF.add(a.get(0), a.get(1));
      case "sub": return BF.sub(a.get(0), a.get(1));
      case "mul": return BF.mul(a.get(0), a.get(1));
      case "div": return BF.div(a.get(0), a.get(1));
      case "mod": return BF.mod(a.get(0), a.get(1));
      case "neg": return BF.neg(a.get(0));
      case "string": return BF.string(a.get(0));
      case "json": return BF.json(a.get(0));
      case "number": return BF.number(a.get(0));
      case "floor": return BF.floor(a.get(0));
      case "ceil": return BF.ceil(a.get(0));
      case "round": return BF.round(a.get(0));
      case "min": return BF.min(a.get(0), a.get(1));
      case "max": return BF.max(a.get(0), a.get(1));
      case "abs": return BF.abs(a.get(0));
      case "to_fixed": return BF.to_fixed(a.get(0), a.get(1));
      case "date": return BF.date(a.get(0), (String) a.get(1));
      case "format_date": return BF.format_date(a.get(0), (String) a.get(1), (String) a.get(2), a.get(3));
      case "lower": return BF.lc(a.get(0));
      case "upper": return BF.uc(a.get(0));
      case "trim": return BF.trim(a.get(0));
      case "trim_start": return BF.trim_start(a.get(0));
      case "trim_end": return BF.trim_end(a.get(0));
      case "starts_with":
        return a.size() == 2 ? BF.starts_with(a.get(0), a.get(1)) : BF.starts_with(a.get(0), a.get(1), a.get(2));
      case "ends_with":
        return a.size() == 2 ? BF.ends_with(a.get(0), a.get(1)) : BF.ends_with(a.get(0), a.get(1), a.get(2));
      case "replace": return BF.replace(a.get(0), a.get(1), a.get(2));
      case "replace_all": return BF.replace_all(a.get(0), a.get(1), a.get(2));
      case "repeat": return BF.repeat(a.get(0), a.get(1));
      case "pad_start":
        return a.size() == 2 ? BF.pad_start(a.get(0), a.get(1)) : BF.pad_start(a.get(0), a.get(1), a.get(2));
      case "pad_end":
        return a.size() == 2 ? BF.pad_end(a.get(0), a.get(1)) : BF.pad_end(a.get(0), a.get(1), a.get(2));
      case "split":
        if (a.size() == 1) return BF.split(a.get(0));
        if (a.size() == 2) return BF.split(a.get(0), a.get(1));
        return BF.split(a.get(0), a.get(1), a.get(2));
      case "len": return BF.length(a.get(0));
      case "at": return BF.at(a.get(0), a.get(1));
      case "includes": return BF.includes(a.get(0), a.get(1));
      case "index_of": return BF.index_of(a.get(0), a.get(1));
      case "last_index_of": return BF.last_index_of(a.get(0), a.get(1));
      case "concat": return BF.concat(a.get(0), a.get(1));
      case "slice":
        return a.size() == 2 ? BF.slice(a.get(0), a.get(1)) : BF.slice(a.get(0), a.get(1), a.get(2));
      case "reverse": return BF.reverse(a.get(0));
      case "flat": return BF.flat(a.get(0), a.get(1));
      case "flat_dynamic": return BF.flat_dynamic(a.get(0), a.get(1));
      case "join": return BF.join(a.get(0), a.get(1));
      case "arr": return new ArrayList<>(a);
      case "filter_truthy": return BF.filter_truthy(a.get(0));
      case "search_params_get": return BF.search_params_get(a.get(0), a.get(1));
      case "query": return BF.query(a.get(0), new ArrayList<>(a.subList(1, a.size())));
      case "every": return BF.every(a.get(0), a.get(1));
      case "some": return BF.some(a.get(0), a.get(1));
      case "filter": return BF.filter(a.get(0), a.get(1), a.get(2));
      case "find": return BF.find(a.get(0), a.get(1), a.get(2));
      case "find_index": return BF.find_index(a.get(0), a.get(1), a.get(2));
      case "find_last": return BF.find_last(a.get(0), a.get(1), a.get(2));
      case "find_last_index": return BF.find_last_index(a.get(0), a.get(1), a.get(2));
      case "sort": {
        // Canonical flat form: (items, key_kind, key, compare_type, direction){1,2 keys...}
        List<Object> keys = new ArrayList<>();
        for (int i = 1; i + 4 <= a.size(); i += 4) {
          Map<String, Object> k = new LinkedHashMap<>();
          k.put("key_kind", a.get(i));
          k.put("key", a.get(i + 1));
          k.put("compare_type", a.get(i + 2));
          k.put("direction", a.get(i + 3));
          keys.add(k);
        }
        Map<String, Object> opts = new LinkedHashMap<>();
        opts.put("keys", keys);
        return BF.sort(a.get(0), opts);
      }
      case "reduce":
        return BF.reduce(a.get(0), a.get(1), a.get(2), a.get(3), a.get(4), a.get(5), a.get(6));
      case "flat_map": return BF.flat_map(a.get(0), a.get(1), a.get(2));
      case "flat_map_tuple": return BF.flat_map_tuple(a.get(0), new ArrayList<>(a.subList(1, a.size())));
      default:
        throw new IllegalStateException("no Java binding for helper '" + fn + "' -- add it to invoke() in " + HelperVectorsTest.class);
    }
  }

  // ---------------------------------------------------------------------
  // JSON <-> runtime-value materialization (mirrors the TS generator's
  // encoding rules in packages/adapter-tests/vectors/README.md).
  // ---------------------------------------------------------------------

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
    JsonObject obj = el.getAsJsonObject();
    if (obj.size() == 1 && obj.has("$date")) {
      return Instant.parse(obj.get("$date").getAsString());
    }
    Map<String, Object> out = new LinkedHashMap<>();
    for (Map.Entry<String, JsonElement> e : obj.entrySet()) {
      out.put(e.getKey(), materialize(e.getValue()));
    }
    return out;
  }

  /** Decode an `expect` value, resolving the `{"$num": "NaN"|"Infinity"|"-Infinity"}` sentinel. */
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

  /** Value-compat comparison (spec/template-helpers.md): numeric by value, else structural. */
  @SuppressWarnings("unchecked")
  private static boolean valueMatch(Object got, Object expect) {
    if (expect == null) {
      return got == null;
    }
    if (expect instanceof Boolean) {
      return got instanceof Boolean && got.equals(expect);
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
      return e == g;
    }
    if (expect instanceof String) {
      return got instanceof String && got.equals(expect);
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
        if (!valueMatch(gg.get(i), ge.get(i))) {
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
        if (!mg.containsKey(e.getKey()) || !valueMatch(mg.get(e.getKey()), e.getValue())) {
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
