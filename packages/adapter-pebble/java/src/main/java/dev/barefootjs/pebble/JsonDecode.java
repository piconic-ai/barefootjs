package dev.barefootjs.pebble;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Decode a parsed JSON tree into this runtime's ordinary value domain
 * (`null` / `Boolean` / `Double` / `String` / `List<Object>` /
 * `Map<String, Object>`), resolving the shared `{"$num": "NaN" | "Infinity"
 * | "-Infinity"}` non-finite-number sentinel documented in
 * `spec/template-helpers.md` and already decoded the same way by this
 * package's own {@code HelperVectorsTest}/{@code EvalVectorsTest} (see
 * their `materialize`/`decodeExpect` methods) — reused here (rather than a
 * second ad-hoc convention) so `Main`'s `vars.json` reader decodes exactly
 * what `packages/adapter-tests/vectors/generate.ts`'s own `$num` convention
 * means, and what a hand-authored `renderPebbleComponent` harness payload
 * emits for a `NaN`/`Infinity`/`-Infinity` prop value.
 *
 * <p>Plain JSON has no way to represent a non-finite number
 * (`JSON.stringify(NaN)` silently becomes `null`), so a caller that needs to
 * pass one writes the sentinel object instead; every other JSON shape
 * decodes structurally.
 */
final class JsonDecode {

  private JsonDecode() {}

  static Object materialize(JsonElement el) {
    if (el == null || el.isJsonNull()) {
      return null;
    }
    if (el.isJsonPrimitive()) {
      JsonPrimitive p = el.getAsJsonPrimitive();
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
      for (JsonElement e : (JsonArray) el) {
        out.add(materialize(e));
      }
      return out;
    }
    JsonObject obj = el.getAsJsonObject();
    if (obj.size() == 1 && obj.has("$num")) {
      switch (obj.get("$num").getAsString()) {
        case "NaN":
          return Double.NaN;
        case "Infinity":
          return Double.POSITIVE_INFINITY;
        case "-Infinity":
          return Double.NEGATIVE_INFINITY;
        default:
          break;
      }
    }
    Map<String, Object> out = new LinkedHashMap<>();
    for (Map.Entry<String, JsonElement> e : obj.entrySet()) {
      out.put(e.getKey(), materialize(e.getValue()));
    }
    return out;
  }
}
