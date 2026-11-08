package dev.barefootjs.pebble;

import com.google.gson.JsonElement;

/**
 * JS `undefined` in the golden vectors (`spec/js-undefined-value.md`, "JSON
 * encoding for vectors"): the one-key `{"$undef": true}` sentinel, shared by
 * the primitive, helper and eval vector harnesses.
 *
 * <ul>
 *   <li>in `args` and the evaluator `env` the sentinel decodes to
 *       {@link #ARG}, the runtime's {@link Undefined#INSTANCE}
 *       ({@link JsonDecode#UNDEFINED}, which the render harness's
 *       `vars.json` reader uses too);
 *   <li>in an `expect` it decodes to {@link #EXPECT}, which matches only a
 *       value {@link #isRuntimeUndefined} accepts, the runtime's
 *       {@link Undefined}, also inside nested lists and maps. A `null`
 *       expect matches Java's `null` only.
 * </ul>
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

  /** Whether {@code got} is the runtime's own undefined value. */
  static boolean isRuntimeUndefined(Object got) {
    return Undefined.isUndefined(got);
  }

  /** Whether a JSON element is `{"$undef": true}`. */
  static boolean isSentinel(JsonElement el) {
    return el != null && el.isJsonObject() && JsonDecode.isUndefSentinel(el.getAsJsonObject());
  }
}
