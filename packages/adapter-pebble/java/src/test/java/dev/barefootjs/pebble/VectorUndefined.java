package dev.barefootjs.pebble;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * JS `undefined` in the golden vectors (`spec/js-undefined-value.md`, "JSON
 * encoding for vectors"): the one-key `{"$undef": true}` sentinel, shared by
 * the primitive, helper and eval vector harnesses.
 *
 * <p>The Java runtime has no undefined value yet (rollout step U7 adds it),
 * so for now:
 *
 * <ul>
 *   <li>in `args` and the evaluator `env` the sentinel decodes to
 *       {@link #ARG}, the host nil a template receives for `undefined` today
 *       ({@link JsonDecode#UNDEFINED}, which the render harness's
 *       `vars.json` reader uses too);
 *   <li>in an `expect` it decodes to {@link #EXPECT}, which matches only a
 *       value {@link #isRuntimeUndefined} accepts. None exists yet, so it
 *       never matches, also inside nested lists and maps, and every such
 *       case is listed in an expected-failure ledger or pinned as a
 *       divergence.
 * </ul>
 *
 * <p>U7 flips both in one place: {@link JsonDecode#UNDEFINED} becomes the
 * runtime's undefined and {@link #isRuntimeUndefined} recognizes it.
 */
final class VectorUndefined {

  private VectorUndefined() {}

  static final Object ARG = JsonDecode.UNDEFINED;

  /** The decoded `$undef` of an expect; nothing else is this object. */
  static final Object EXPECT = new Object() {
    @Override
    public String toString() {
      return "<$undef>";
    }
  };

  /** Whether {@code got} is the runtime's own undefined value (none yet: U7). */
  static boolean isRuntimeUndefined(Object got) {
    return false;
  }

  /** Whether a JSON element is `{"$undef": true}`. */
  static boolean isSentinel(JsonElement el) {
    return el != null && el.isJsonObject() && JsonDecode.isUndefSentinel(el.getAsJsonObject());
  }

  /** The "java" runtime of an expected-failure ledger: case key to entry. */
  static JsonObject loadExpectedFailures(Path path) throws IOException {
    return JsonParser.parseString(Files.readString(path)).getAsJsonObject()
        .getAsJsonObject("runtimes").getAsJsonObject("java");
  }
}
