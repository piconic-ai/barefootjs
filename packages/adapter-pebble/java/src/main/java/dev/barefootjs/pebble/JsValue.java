package dev.barefootjs.pebble;

import java.util.List;
import java.util.Map;

/**
 * JS-compatible stringification, equality, and truthiness — the other half
 * of the Phase 3a watchpoints (alongside {@link JsNumber}): a
 * `SameValueZero` `.includes` (NaN equals itself), strict `===`/`!==`
 * (NaN never equals itself, no cross-type coercion), and JS truthiness
 * (empty array/object IS truthy, unlike Python/PHP).
 *
 * <p>Value representation used throughout this runtime (mirrors the shared
 * `EvalValue` domain in
 * `packages/adapter-tests/vectors/eval-reference.ts`): {@code null},
 * {@link Boolean}, {@link Double} (every JS number, see {@link JsNumber}),
 * {@link String}, {@link List}&lt;Object&gt; (JS array), {@link Map}
 * &lt;String,Object&gt; (JS object/map).
 */
public final class JsValue {

  private JsValue() {
  }

  /**
   * JS {@code String(v)}: numbers via {@link JsNumber#numberToString},
   * {@code String(null)} -> {@code "null"}, {@code String(true)} ->
   * {@code "true"}, arrays join their elements with {@code ","} (JS
   * `Array.prototype.toString` delegates to `.join(',')`, recursively
   * stringifying each element the same way), plain objects render `"[object
   * Object]"` (JS `Object.prototype.toString` default; nothing in this
   * catalogue needs a more specific tag).
   */
  public static String jsString(Object v) {
    if (v == null) {
      return "null";
    }
    if (v instanceof String) {
      return (String) v;
    }
    if (v instanceof Boolean) {
      return ((Boolean) v) ? "true" : "false";
    }
    if (v instanceof Number) {
      return JsNumber.numberToString(((Number) v).doubleValue());
    }
    if (v instanceof List) {
      StringBuilder sb = new StringBuilder();
      List<?> list = (List<?>) v;
      for (int i = 0; i < list.size(); i++) {
        if (i > 0) {
          sb.append(',');
        }
        Object el = list.get(i);
        if (el != null) {
          sb.append(jsString(el));
        }
      }
      return sb.toString();
    }
    if (v instanceof Map) {
      return "[object Object]";
    }
    return String.valueOf(v);
  }

  /**
   * JS truthiness. Booleans/numbers/strings per the ordinary rules
   * (`NaN`/`0`/`""` are the only falsy non-null/undefined primitives);
   * arrays and maps are ALWAYS truthy, even empty (`[]`/`{}` are JS-truthy
   * — the divergence from Python/PHP the TS adapter's file header flags as
   * divergence 1). `null` (this runtime's single absent-value
   * representation, standing in for both JS `null`/`undefined`) is falsy.
   */
  public static boolean truthy(Object v) {
    if (v == null) {
      return false;
    }
    if (v instanceof Boolean) {
      return (Boolean) v;
    }
    if (v instanceof Number) {
      double d = ((Number) v).doubleValue();
      return d != 0.0 && !Double.isNaN(d);
    }
    if (v instanceof String) {
      return !((String) v).isEmpty();
    }
    // Arrays, maps, and any other object reference: always truthy in JS.
    return true;
  }

  /**
   * JS `===`. Strict: different runtime types never equal (a `Double`
   * String-equality is never attempted), `NaN === NaN` is `false` (unlike
   * {@link #sameValueZero}), `+0 === -0` is `true` (both represented as the
   * same `double` here, so trivially satisfied). Structural (array/map)
   * operands are reference-inequal by definition here since this runtime
   * never interns them — matches JS object identity semantics for the
   * common case (two array/object LITERALS are never `===`).
   */
  public static boolean strictEquals(Object a, Object b) {
    if (a == null || b == null) {
      return a == b;
    }
    if (a instanceof Number && b instanceof Number) {
      // Both represented as double: JS `1 === 1.0` is true (same number),
      // and unlike SameValueZero, `NaN === NaN` is false here.
      return ((Number) a).doubleValue() == ((Number) b).doubleValue();
    }
    if (a instanceof Boolean && b instanceof Boolean) {
      return a.equals(b);
    }
    if (a instanceof String && b instanceof String) {
      return a.equals(b);
    }
    if (a.getClass() != b.getClass()) {
      return false;
    }
    // Arrays/maps: reference identity (JS object equality), never
    // structural — two freshly-built Lists/Maps are never `===` in JS.
    return a == b;
  }

  /**
   * `Array.prototype.includes` / member-test equality: SameValueZero —
   * `===` except `NaN` equals itself (`+0`/`-0` not distinguished, same as
   * everywhere else in this runtime's `double`-only number representation).
   */
  public static boolean sameValueZero(Object a, Object b) {
    if (a instanceof Number && b instanceof Number) {
      double da = ((Number) a).doubleValue();
      double db = ((Number) b).doubleValue();
      if (Double.isNaN(da) && Double.isNaN(db)) {
        return true;
      }
      return da == db;
    }
    return strictEquals(a, b);
  }
}
