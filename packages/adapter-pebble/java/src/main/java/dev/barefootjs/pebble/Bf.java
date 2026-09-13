package dev.barefootjs.pebble;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.google.gson.ToNumberPolicy;
import dev.barefootjs.pebble.eval.Evaluator;
import io.pebbletemplates.pebble.extension.escaper.SafeString;

import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The `bf` global — every helper the Pebble adapter's compiled `.peb`
 * templates call as `bf.method(...)`. Registered as a fresh instance per
 * render (see {@link Main}), so a per-render counter/state field (used by
 * the hydration-marker helpers) never leaks between renders.
 *
 * <p>Two families of methods live here, kept in ONE class per the
 * `add-adapter` task's "single god-class is fine for the bf helper
 * surface" allowance:
 *
 * <ul>
 *   <li><b>Pure value helpers</b> — the shared, language-neutral catalogue
 *       in {@code spec/template-helpers.md}, golden-vector tested
 *       (see {@code BfHelperVectorsTest}). These have exactly one
 *       correct behavior, computed by executing the JS reference.
 *   <li><b>Render-state helpers</b> — hydration markers, script
 *       registration, context provide/use, spread/style attribute
 *       rendering, cross-template child invocation. These are NOT covered
 *       by the shared spec (`spec/template-helpers.md`'s own "Scope"
 *       section excludes them) and their exact byte-for-byte shape is
 *       validated against the shared fixture corpus in Phase 4
 *       (out of scope for this PR) — implemented here with a reasonable,
 *       structurally-consistent shape (mirroring the marker conventions in
 *       `packages/shared/src/markers.ts`) sufficient to prove the
 *       hand-written `.peb` smoke tests in
 *       `packages/adapter-pebble/src/__tests__/` render end-to-end.
 * </ul>
 *
 * <p>Every `.map()/.filter()/.reduce()/.sort()/.find()` callback body that
 * doesn't lower to native Pebble syntax arrives as a serialized-JSON
 * `ParsedExpr` tree, evaluated via {@link Evaluator} (`bf.*_eval` methods
 * below).
 */
public final class Bf {

  /** Numbers-as-double, matching every OTHER JSON boundary in this runtime (see JsNumber). */
  private static final Gson GSON = new GsonBuilder()
      .setObjectToNumberStrategy(ToNumberPolicy.DOUBLE)
      .create();

  /** This render's root scope id (`bf.scope_attr()`), e.g. "ComponentName_test". */
  private final String rootScopeId;

  /** Auto-incrementing suffix for any marker this runtime must itself number. */
  private final AtomicInteger markerCounter = new AtomicInteger(0);

  public Bf(String rootScopeId) {
    this.rootScopeId = rootScopeId == null ? "" : rootScopeId;
  }

  // =========================================================================
  // Coercion / equality (pervasive — used at nearly every interpolation and
  // condition-test position the TS adapter emits).
  // =========================================================================

  /** JS `String(v)` — see the file header, divergence 2. */
  public String string(Object v) {
    return JsValue.jsString(v);
  }

  /** `String(boolean)` for a props/signal value the analyzer proved is boolean-typed (#1897). */
  public String bool_str(Object v) {
    return JsValue.jsString(v);
  }

  /** Every non-boolean-shaped condition-test position (divergence 1). Always a real boolean. */
  public boolean truthy(Object v) {
    return JsValue.truthy(v);
  }

  /** JS `===` (divergence 4 — never a native Pebble equality operator). */
  public boolean eq(Object a, Object b) {
    return JsValue.strictEquals(a, b);
  }

  /** JS `!==`. */
  public boolean neq(Object a, Object b) {
    return !JsValue.strictEquals(a, b);
  }

  /**
   * JS `??`. Stock Pebble has NO `??`/coalescing operator at all, confirmed
   * empirically (a real {@code io.pebbletemplates.pebble.error.ParserException}
   * on `{{ a ?? b }}`) — see this package's README, "Divergence 3". The TS
   * adapter's `expr/emitters.ts` `logical()` routes every JS `??` through
   * this helper instead of emitting the native (nonexistent) operator.
   */
  public Object coalesce(Object a, Object b) {
    return a == null ? b : a;
  }

  /**
   * Dynamic member/index access (`obj[expr]`) — divergence in the file
   * header's "Member/index access" section. Arrays index numerically
   * (JS `Number()` coercion of the key, out-of-range -> null); maps index
   * by the key's string form (JS object-property semantics: every key is
   * ultimately a string).
   */
  @SuppressWarnings("unchecked")
  public Object get(Object receiver, Object key) {
    if (receiver instanceof List) {
      double idx = JsNumber.jsNumber(key);
      List<?> list = (List<?>) receiver;
      if (idx != Math.floor(idx) || idx < 0 || idx >= list.size()) {
        return null;
      }
      return list.get((int) idx);
    }
    if (receiver instanceof Map) {
      Map<String, Object> m = (Map<String, Object>) receiver;
      String k = JsValue.jsString(key);
      return m.containsKey(k) ? m.get(k) : null;
    }
    return null;
  }

  /** Shallow `Object.assign`-style merge (spread props, `{...a, ...b}`). Later maps win. */
  @SafeVarargs
  @SuppressWarnings("unchecked")
  public final Map<String, Object> merge(Object... maps) {
    Map<String, Object> out = new LinkedHashMap<>();
    for (Object m : maps) {
      if (m instanceof Map) {
        out.putAll((Map<String, Object>) m);
      }
    }
    return out;
  }

  /** `Object.entries(map)` -> `[[k, v], ...]`, insertion order. */
  @SuppressWarnings("unchecked")
  public List<Object> entries(Object map) {
    List<Object> out = new ArrayList<>();
    if (map instanceof Map) {
      for (Map.Entry<String, Object> e : ((Map<String, Object>) map).entrySet()) {
        List<Object> pair = new ArrayList<>();
        pair.add(e.getKey());
        pair.add(e.getValue());
        out.add(pair);
      }
    }
    return out;
  }

  /** `Object.keys(map)`. */
  public List<Object> keys(Object map) {
    List<Object> out = new ArrayList<>();
    if (map instanceof Map) {
      out.addAll(((Map<?, ?>) map).keySet());
    }
    return out;
  }

  /** `Object.values(map)`. */
  @SuppressWarnings("unchecked")
  public List<Object> values(Object map) {
    List<Object> out = new ArrayList<>();
    if (map instanceof Map) {
      out.addAll(((Map<String, Object>) map).values());
    }
    return out;
  }

  /** Object-rest destructuring residual (`{ id, ...rest }` -> `rest`): every key NOT excluded. */
  @SuppressWarnings("unchecked")
  public Map<String, Object> omit(Object map, Object excludeKeys) {
    Map<String, Object> out = new LinkedHashMap<>();
    if (!(map instanceof Map)) {
      return out;
    }
    List<Object> exclude = excludeKeys instanceof List ? (List<Object>) excludeKeys : List.of();
    List<String> excludeStr = new ArrayList<>();
    for (Object k : exclude) {
      excludeStr.add(JsValue.jsString(k));
    }
    for (Map.Entry<String, Object> e : ((Map<String, Object>) map).entrySet()) {
      if (!excludeStr.contains(e.getKey())) {
        out.put(e.getKey(), e.getValue());
      }
    }
    return out;
  }

  // =========================================================================
  // Arithmetic / number (spec/template-helpers.md)
  // =========================================================================

  public double add(Object a, Object b) {
    return JsNumber.toDouble(a) + JsNumber.toDouble(b);
  }

  public double sub(Object a, Object b) {
    return JsNumber.toDouble(a) - JsNumber.toDouble(b);
  }

  public double mul(Object a, Object b) {
    return JsNumber.toDouble(a) * JsNumber.toDouble(b);
  }

  public double div(Object a, Object b) {
    return JsNumber.toDouble(a) / JsNumber.toDouble(b);
  }

  public double mod(Object a, Object b) {
    return JsNumber.jsMod(JsNumber.toDouble(a), JsNumber.toDouble(b));
  }

  public double neg(Object a) {
    return -JsNumber.toDouble(a);
  }

  public double number(Object v) {
    return JsNumber.jsNumber(v);
  }

  public double floor(Object v) {
    return Math.floor(JsNumber.jsNumber(v));
  }

  public double ceil(Object v) {
    return Math.ceil(JsNumber.jsNumber(v));
  }

  public double round(Object v) {
    return JsNumber.jsRound(JsNumber.jsNumber(v));
  }

  // `Math.min`/`Math.max`/`Math.abs` apply JS `Number()` coercion to a
  // non-number operand (a non-numeric string coerces to NaN, which then
  // propagates) — unlike `add`/`sub`/`mul`, whose vector domain never
  // probes a non-number operand, so `jsNumber` (full coercion) is used
  // here rather than the stricter `toDouble`.
  public double min(Object a, Object b) {
    return Math.min(JsNumber.jsNumber(a), JsNumber.jsNumber(b));
  }

  public double max(Object a, Object b) {
    return Math.max(JsNumber.jsNumber(a), JsNumber.jsNumber(b));
  }

  public double abs(Object v) {
    return Math.abs(JsNumber.jsNumber(v));
  }

  public String to_fixed(Object v) {
    return to_fixed(v, 0.0);
  }

  public String to_fixed(Object v, Object digits) {
    return JsNumber.toFixed(JsNumber.jsNumber(v), (int) JsNumber.jsNumber(digits));
  }

  /**
   * JS {@code JSON.stringify(v)}, single-argument form. NOT delegated to
   * Gson's own number serialization — Gson always prints a `double` with a
   * decimal point (`42.0`), which would re-introduce exactly the
   * long/double-split artifact {@link JsNumber} exists to prevent
   * (JS `JSON.stringify(42)` -> `"42"`). Numbers route through
   * {@link JsNumber#numberToString} instead; object key order is
   * insertion order (a {@link Map} here is always a {@link LinkedHashMap}).
   */
  public String json(Object v) {
    StringBuilder sb = new StringBuilder();
    writeJson(v, sb);
    return sb.toString();
  }

  @SuppressWarnings("unchecked")
  private static void writeJson(Object v, StringBuilder sb) {
    if (v == null) {
      sb.append("null");
      return;
    }
    if (v instanceof String) {
      writeJsonString((String) v, sb);
      return;
    }
    if (v instanceof Boolean) {
      sb.append(((Boolean) v) ? "true" : "false");
      return;
    }
    if (v instanceof Number) {
      double d = ((Number) v).doubleValue();
      // JS `JSON.stringify` renders a non-finite number as `null` (it is
      // not valid JSON) — out of the vector-tested domain per
      // spec/template-helpers.md's `json` entry, but a safe total fallback.
      sb.append(Double.isFinite(d) ? JsNumber.numberToString(d) : "null");
      return;
    }
    if (v instanceof List) {
      sb.append('[');
      List<Object> list = (List<Object>) v;
      for (int i = 0; i < list.size(); i++) {
        if (i > 0) {
          sb.append(',');
        }
        writeJson(list.get(i), sb);
      }
      sb.append(']');
      return;
    }
    if (v instanceof Map) {
      sb.append('{');
      boolean first = true;
      for (Map.Entry<String, Object> e : ((Map<String, Object>) v).entrySet()) {
        if (!first) {
          sb.append(',');
        }
        first = false;
        writeJsonString(e.getKey(), sb);
        sb.append(':');
        writeJson(e.getValue(), sb);
      }
      sb.append('}');
      return;
    }
    writeJsonString(String.valueOf(v), sb);
  }

  private static void writeJsonString(String s, StringBuilder sb) {
    sb.append('"');
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '"':
          sb.append("\\\"");
          break;
        case '\\':
          sb.append("\\\\");
          break;
        case '\n':
          sb.append("\\n");
          break;
        case '\r':
          sb.append("\\r");
          break;
        case '\t':
          sb.append("\\t");
          break;
        default:
          if (c < 0x20) {
            sb.append(String.format("\\u%04x", (int) c));
          } else {
            sb.append(c);
          }
      }
    }
    sb.append('"');
  }

  // =========================================================================
  // Date / format_date (#2274/#2288/#2324/#2334)
  // =========================================================================

  private static Instant toInstant(Object recv) {
    if (recv instanceof Instant) {
      return (Instant) recv;
    }
    if (recv instanceof String) {
      try {
        return Instant.parse((String) recv);
      } catch (DateTimeParseException e) {
        return null;
      }
    }
    return null;
  }

  /** Zero-arg `Date.prototype` accessor subset the compiler's lowering plugin recognizes. */
  public Object date(Object recv, String op) {
    Instant instant = toInstant(recv);
    if (instant == null) {
      return op.equals("toISOString") ? "" : 0.0;
    }
    if (op.equals("toISOString")) {
      ZonedDateTime z = instant.atZone(ZoneOffset.UTC);
      long millisOfSecond = Math.floorDiv(instant.getNano(), 1_000_000L);
      return String.format("%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
          z.getYear(), z.getMonthValue(), z.getDayOfMonth(),
          z.getHour(), z.getMinute(), z.getSecond(), millisOfSecond);
    }
    if (op.equals("getTime")) {
      return (double) instant.toEpochMilli();
    }
    ZonedDateTime z = instant.atZone(ZoneOffset.UTC);
    switch (op) {
      case "getUTCFullYear":
        return (double) z.getYear();
      case "getUTCMonth":
        return (double) (z.getMonthValue() - 1);
      case "getUTCDate":
        return (double) z.getDayOfMonth();
      case "getUTCHours":
        return (double) z.getHour();
      case "getUTCMinutes":
        return (double) z.getMinute();
      case "getUTCSeconds":
        return (double) z.getSecond();
      default:
        return 0.0;
    }
  }

  private static final Pattern FORMAT_TOKEN =
      Pattern.compile("YYYY|MMMM|MMM|MM|DD|dddd|ddd|M|D");

  /** Pure-function date formatter (#2324/#2334) — see spec/template-helpers.md's `format_date`. */
  public String format_date(Object recv, String pattern, String tz, Object namesObj) {
    Instant instant = toInstant(recv);
    if (instant == null) {
      return "";
    }
    ZoneOffset offset = resolveOffset(tz, instant);
    ZonedDateTime z = instant.atOffset(offset).toZonedDateTime();

    List<?> names = namesObj instanceof List ? (List<?>) namesObj : List.of();

    StringBuilder out = new StringBuilder();
    Matcher m = FORMAT_TOKEN.matcher(pattern);
    int last = 0;
    while (m.find()) {
      out.append(pattern, last, m.start());
      out.append(formatToken(m.group(), z, names));
      last = m.end();
    }
    out.append(pattern.substring(last));
    return out.toString();
  }

  private static String formatToken(String token, ZonedDateTime z, List<?> names) {
    switch (token) {
      case "YYYY": {
        int y = z.getYear();
        String digits = String.format("%04d", Math.abs(y));
        return y < 0 ? "-" + digits : digits;
      }
      case "MM":
        return String.format("%02d", z.getMonthValue());
      case "DD":
        return String.format("%02d", z.getDayOfMonth());
      case "M":
        return String.valueOf(z.getMonthValue());
      case "D":
        return String.valueOf(z.getDayOfMonth());
      case "MMMM":
        return nameAt(names, z.getMonthValue() - 1);
      case "MMM":
        return nameAt(names, 12 + (z.getMonthValue() - 1));
      case "dddd":
        return nameAt(names, 24 + jsDayOfWeek(z));
      case "ddd":
        return nameAt(names, 31 + jsDayOfWeek(z));
      default:
        return "";
    }
  }

  private static String nameAt(List<?> names, int index) {
    if (index < 0 || index >= names.size()) {
      return "";
    }
    Object v = names.get(index);
    return v == null ? "" : JsValue.jsString(v);
  }

  /**
   * Sunday-first day-of-week (0=Sunday...6=Saturday), matching JS
   * `getUTCDay()` — epoch day 0 (1970-01-01) is a Thursday, i.e. index 4.
   * `epochDay + 4`, floor-mod 7, lands on 4 at epochDay 0 and is stable for
   * negative epoch days (pre-1970) via the double-mod (`% 7` in Java can be
   * negative for a negative dividend — see `JsNumber`'s own note on `%`).
   */
  private static int jsDayOfWeek(ZonedDateTime z) {
    long epochDay = z.toLocalDate().toEpochDay();
    return (int) (((epochDay + 4) % 7 + 7) % 7);
  }

  private static ZoneOffset resolveOffset(String tz, Instant instant) {
    if (tz.equals("UTC")) {
      return ZoneOffset.UTC;
    }
    if (tz.matches("[+-]\\d{2}:\\d{2}")) {
      return ZoneOffset.of(tz);
    }
    ZoneId zoneId = ZoneId.of(tz); // throws for unknown/misspelled zones, matching JS's RangeError
    return zoneId.getRules().getOffset(instant);
  }

  // =========================================================================
  // String
  // =========================================================================

  public String lc(Object v) {
    return JsValue.jsString(v).toLowerCase();
  }

  public String uc(Object v) {
    return JsValue.jsString(v).toUpperCase();
  }

  public String trim(Object v) {
    return jsTrim(JsValue.jsString(v), true, true);
  }

  public String trim_start(Object v) {
    return jsTrim(JsValue.jsString(v), true, false);
  }

  public String trim_end(Object v) {
    return jsTrim(JsValue.jsString(v), false, true);
  }

  private static boolean isJsWhitespace(char c) {
    return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == 0x0B;
  }

  private static String jsTrim(String s, boolean start, boolean end) {
    int a = 0;
    int b = s.length();
    if (start) {
      while (a < b && isJsWhitespace(s.charAt(a))) {
        a++;
      }
    }
    if (end) {
      while (b > a && isJsWhitespace(s.charAt(b - 1))) {
        b--;
      }
    }
    return s.substring(a, b);
  }

  public boolean starts_with(Object v, Object prefix) {
    return starts_with(v, prefix, 0.0);
  }

  public boolean starts_with(Object v, Object prefix, Object position) {
    String s = JsValue.jsString(v);
    int pos = clamp((int) JsNumber.jsNumber(position), 0, s.length());
    return s.startsWith(JsValue.jsString(prefix), pos);
  }

  public boolean ends_with(Object v, Object suffix) {
    String s = JsValue.jsString(v);
    return ends_with(v, suffix, (double) s.length());
  }

  public boolean ends_with(Object v, Object suffix, Object endPosition) {
    String s = JsValue.jsString(v);
    int end = clamp((int) JsNumber.jsNumber(endPosition), 0, s.length());
    String truncated = s.substring(0, end);
    return truncated.endsWith(JsValue.jsString(suffix));
  }

  private static int clamp(int v, int lo, int hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  public String replace(Object v, Object pattern, Object replacement) {
    String s = JsValue.jsString(v);
    String pat = JsValue.jsString(pattern);
    String rep = JsValue.jsString(replacement);
    int idx = pat.isEmpty() ? 0 : s.indexOf(pat);
    if (pat.isEmpty()) {
      return rep + s;
    }
    if (idx < 0) {
      return s;
    }
    return s.substring(0, idx) + rep + s.substring(idx + pat.length());
  }

  public String replace_all(Object v, Object pattern, Object replacement) {
    String s = JsValue.jsString(v);
    String pat = JsValue.jsString(pattern);
    String rep = JsValue.jsString(replacement);
    if (pat.isEmpty()) {
      StringBuilder sb = new StringBuilder(rep);
      for (int i = 0; i < s.length(); i++) {
        sb.append(s.charAt(i)).append(rep);
      }
      return sb.toString();
    }
    return s.replace(pat, rep);
  }

  public String repeat(Object v, Object count) {
    String s = JsValue.jsString(v);
    int n = (int) JsNumber.jsNumber(count);
    return s.repeat(Math.max(0, n));
  }

  public String pad_start(Object v, Object targetLength) {
    return pad_start(v, targetLength, " ");
  }

  public String pad_start(Object v, Object targetLength, Object pad) {
    return jsPad(JsValue.jsString(v), (int) JsNumber.jsNumber(targetLength), JsValue.jsString(pad), true);
  }

  public String pad_end(Object v, Object targetLength) {
    return pad_end(v, targetLength, " ");
  }

  public String pad_end(Object v, Object targetLength, Object pad) {
    return jsPad(JsValue.jsString(v), (int) JsNumber.jsNumber(targetLength), JsValue.jsString(pad), false);
  }

  private static String jsPad(String s, int target, String pad, boolean start) {
    if (pad.isEmpty() || s.length() >= target) {
      return s;
    }
    int need = target - s.length();
    StringBuilder fill = new StringBuilder();
    while (fill.length() < need) {
      fill.append(pad);
    }
    String fillStr = fill.substring(0, need);
    return start ? fillStr + s : s + fillStr;
  }

  public List<Object> split(Object v) {
    List<Object> out = new ArrayList<>();
    out.add(JsValue.jsString(v));
    return out;
  }

  public List<Object> split(Object v, Object separator) {
    return splitImpl(JsValue.jsString(v), JsValue.jsString(separator), -1);
  }

  public List<Object> split(Object v, Object separator, Object limit) {
    return splitImpl(JsValue.jsString(v), JsValue.jsString(separator), (int) JsNumber.jsNumber(limit));
  }

  private static List<Object> splitImpl(String s, String sep, int limit) {
    List<Object> out = new ArrayList<>();
    if (limit == 0) {
      return out;
    }
    if (sep.isEmpty()) {
      for (int i = 0; i < s.length(); i++) {
        if (limit >= 0 && out.size() >= limit) {
          break;
        }
        out.add(String.valueOf(s.charAt(i)));
      }
      return out;
    }
    int from = 0;
    while (true) {
      int idx = s.indexOf(sep, from);
      if (idx < 0) {
        out.add(s.substring(from));
        break;
      }
      out.add(s.substring(from, idx));
      from = idx + sep.length();
      if (limit >= 0 && out.size() >= limit) {
        return out.subList(0, limit);
      }
    }
    if (limit >= 0 && out.size() > limit) {
      return out.subList(0, limit);
    }
    return out;
  }

  // =========================================================================
  // Array / string (receiver-dispatched where JS itself dispatches by type)
  // =========================================================================

  public double length(Object v) {
    if (v instanceof String) {
      return ((String) v).length();
    }
    if (v instanceof List) {
      return ((List<?>) v).size();
    }
    return 0;
  }

  public Object at(Object recv, Object indexObj) {
    int i = (int) JsNumber.jsNumber(indexObj);
    if (recv instanceof List) {
      List<?> l = (List<?>) recv;
      int idx = i < 0 ? l.size() + i : i;
      return (idx < 0 || idx >= l.size()) ? null : l.get(idx);
    }
    if (recv instanceof String) {
      String s = (String) recv;
      int idx = i < 0 ? s.length() + i : i;
      return (idx < 0 || idx >= s.length()) ? null : String.valueOf(s.charAt(idx));
    }
    return null;
  }

  public boolean includes(Object recv, Object needle) {
    if (recv instanceof List) {
      for (Object el : (List<?>) recv) {
        if (JsValue.sameValueZero(el, needle)) {
          return true;
        }
      }
      return false;
    }
    if (recv instanceof String) {
      return ((String) recv).contains(JsValue.jsString(needle));
    }
    return false;
  }

  public double index_of(Object recv, Object needle) {
    if (recv instanceof List) {
      List<?> l = (List<?>) recv;
      for (int i = 0; i < l.size(); i++) {
        if (JsValue.sameValueZero(l.get(i), needle)) {
          return i;
        }
      }
      return -1;
    }
    if (recv instanceof String) {
      return ((String) recv).indexOf(JsValue.jsString(needle));
    }
    return -1;
  }

  public double last_index_of(Object recv, Object needle) {
    if (recv instanceof List) {
      List<?> l = (List<?>) recv;
      for (int i = l.size() - 1; i >= 0; i--) {
        if (JsValue.sameValueZero(l.get(i), needle)) {
          return i;
        }
      }
      return -1;
    }
    if (recv instanceof String) {
      return ((String) recv).lastIndexOf(JsValue.jsString(needle));
    }
    return -1;
  }

  @SuppressWarnings("unchecked")
  public Object concat(Object a, Object b) {
    if (a instanceof List) {
      List<Object> out = new ArrayList<>((List<Object>) a);
      if (b instanceof List) {
        out.addAll((List<Object>) b);
      } else {
        out.add(b);
      }
      return out;
    }
    return JsValue.jsString(a) + JsValue.jsString(b);
  }

  public Object slice(Object recv, Object startObj) {
    return slice(recv, startObj, null);
  }

  public Object slice(Object recv, Object startObj, Object endObj) {
    int len = (recv instanceof String) ? ((String) recv).length()
        : (recv instanceof List) ? ((List<?>) recv).size() : 0;
    int start = clampSliceIndex(startObj == null ? 0 : (int) JsNumber.jsNumber(startObj), len);
    int end = clampSliceIndex(endObj == null ? len : (int) JsNumber.jsNumber(endObj), len);
    if (start >= end) {
      return recv instanceof String ? "" : new ArrayList<>();
    }
    if (recv instanceof String) {
      return ((String) recv).substring(start, end);
    }
    if (recv instanceof List) {
      return new ArrayList<>(((List<?>) recv).subList(start, end));
    }
    return recv;
  }

  private static int clampSliceIndex(int i, int len) {
    int v = i < 0 ? len + i : i;
    return Math.max(0, Math.min(len, v));
  }

  @SuppressWarnings("unchecked")
  public Object reverse(Object v) {
    if (v instanceof List) {
      List<Object> out = new ArrayList<>((List<Object>) v);
      java.util.Collections.reverse(out);
      return out;
    }
    if (v instanceof String) {
      return new StringBuilder((String) v).reverse().toString();
    }
    return v;
  }

  /** `.flat(depth)`; canonical `-1` is the compiled `Infinity` sentinel. */
  public List<Object> flat(Object v, Object depthObj) {
    double depth = JsNumber.jsNumber(depthObj);
    int d = depth < 0 ? Integer.MAX_VALUE : (int) depth;
    return flattenTo(v, d);
  }

  /** Dynamic `.flat(expr)` depth — JS `ToIntegerOrInfinity` coercion first (#2094). */
  public List<Object> flat_dynamic(Object v, Object depthObj) {
    double raw = JsNumber.jsNumber(depthObj);
    int d;
    if (Double.isNaN(raw)) {
      d = 0;
    } else if (raw == Double.POSITIVE_INFINITY || raw > Integer.MAX_VALUE) {
      d = Integer.MAX_VALUE;
    } else if (raw < 0) {
      d = 0;
    } else {
      d = (int) raw; // truncate toward zero
    }
    return flattenTo(v, d);
  }

  @SuppressWarnings("unchecked")
  private static List<Object> flattenTo(Object v, int depth) {
    List<Object> out = new ArrayList<>();
    if (!(v instanceof List)) {
      return out;
    }
    for (Object el : (List<Object>) v) {
      if (depth > 0 && el instanceof List) {
        out.addAll(flattenTo(el, depth - 1));
      } else {
        out.add(el);
      }
    }
    return out;
  }

  public String join(Object v) {
    return join(v, ",");
  }

  public String join(Object v, Object sep) {
    if (!(v instanceof List)) {
      return "";
    }
    String separator = JsValue.jsString(sep);
    StringBuilder sb = new StringBuilder();
    List<?> list = (List<?>) v;
    for (int i = 0; i < list.size(); i++) {
      if (i > 0) {
        sb.append(separator);
      }
      Object el = list.get(i);
      if (el != null) {
        sb.append(JsValue.jsString(el));
      }
    }
    return sb.toString();
  }

  /** `arr.filter(Boolean)` — JS truthiness, NOT PERL/Python truthiness (spec: `"0"` is truthy). */
  public List<Object> filter_truthy(Object v) {
    List<Object> out = new ArrayList<>();
    if (v instanceof List) {
      for (Object el : (List<?>) v) {
        if (JsValue.truthy(el)) {
          out.add(el);
        }
      }
    }
    return out;
  }

  // =========================================================================
  // Higher-order: canonical projection form
  // (items, field[, value]) — spec/template-helpers.md
  // =========================================================================

  @SuppressWarnings("unchecked")
  private static Object fieldOf(Object item, String field) {
    if (item instanceof Map) {
      return ((Map<String, Object>) item).get(field);
    }
    return null;
  }

  public boolean every(Object recv, Object field) {
    if (!(recv instanceof List)) {
      return true;
    }
    String f = JsValue.jsString(field);
    for (Object item : (List<?>) recv) {
      if (!JsValue.truthy(fieldOf(item, f))) {
        return false;
      }
    }
    return true;
  }

  public boolean some(Object recv, Object field) {
    if (!(recv instanceof List)) {
      return false;
    }
    String f = JsValue.jsString(field);
    for (Object item : (List<?>) recv) {
      if (JsValue.truthy(fieldOf(item, f))) {
        return true;
      }
    }
    return false;
  }

  public List<Object> filter(Object recv, Object field, Object value) {
    List<Object> out = new ArrayList<>();
    if (!(recv instanceof List)) {
      return out;
    }
    String f = JsValue.jsString(field);
    for (Object item : (List<?>) recv) {
      if (JsValue.sameValueZero(fieldOf(item, f), value)) {
        out.add(item);
      }
    }
    return out;
  }

  public Object find(Object recv, Object field, Object value) {
    if (!(recv instanceof List)) {
      return null;
    }
    String f = JsValue.jsString(field);
    for (Object item : (List<?>) recv) {
      if (JsValue.sameValueZero(fieldOf(item, f), value)) {
        return item;
      }
    }
    return null;
  }

  public double find_index(Object recv, Object field, Object value) {
    if (!(recv instanceof List)) {
      return -1;
    }
    String f = JsValue.jsString(field);
    List<?> list = (List<?>) recv;
    for (int i = 0; i < list.size(); i++) {
      if (JsValue.sameValueZero(fieldOf(list.get(i), f), value)) {
        return i;
      }
    }
    return -1;
  }

  public Object find_last(Object recv, Object field, Object value) {
    if (!(recv instanceof List)) {
      return null;
    }
    String f = JsValue.jsString(field);
    List<?> list = (List<?>) recv;
    for (int i = list.size() - 1; i >= 0; i--) {
      if (JsValue.sameValueZero(fieldOf(list.get(i), f), value)) {
        return list.get(i);
      }
    }
    return null;
  }

  public double find_last_index(Object recv, Object field, Object value) {
    if (!(recv instanceof List)) {
      return -1;
    }
    String f = JsValue.jsString(field);
    List<?> list = (List<?>) recv;
    for (int i = list.size() - 1; i >= 0; i--) {
      if (JsValue.sameValueZero(fieldOf(list.get(i), f), value)) {
        return i;
      }
    }
    return -1;
  }

  // =========================================================================
  // sort / reduce / flat_map — structured (non-lambda) descriptors
  // =========================================================================

  /**
   * `.sort(cmp)` / `.toSorted(cmp)` for the accepted comparator catalogue.
   * `opts` is `{"keys": [{"key_kind": "self"|"field", "key": <field>?,
   * "compare_type": "numeric"|"string"|"auto", "direction": "asc"|"desc"}, ...]}`
   * — non-mutating, stable.
   */
  @SuppressWarnings("unchecked")
  public List<Object> sort(Object recv, Object optsObj) {
    if (!(recv instanceof List)) {
      return new ArrayList<>();
    }
    List<Object> out = new ArrayList<>((List<Object>) recv);
    Map<String, Object> opts = (Map<String, Object>) optsObj;
    List<Object> keys = (List<Object>) opts.get("keys");
    Comparator<Object> cmp = (a, b) -> {
      for (Object keyObj : keys) {
        Map<String, Object> key = (Map<String, Object>) keyObj;
        String keyKind = JsValue.jsString(key.get("key_kind"));
        Object av = keyKind.equals("self") ? a : fieldOf(a, JsValue.jsString(key.get("key")));
        Object bv = keyKind.equals("self") ? b : fieldOf(b, JsValue.jsString(key.get("key")));
        String compareType = JsValue.jsString(key.get("compare_type"));
        String direction = JsValue.jsString(key.get("direction"));
        int c = compareValues(av, bv, compareType);
        if (direction.equals("desc")) {
          c = -c;
        }
        if (c != 0) {
          return c;
        }
      }
      return 0;
    };
    out.sort(cmp);
    return out;
  }

  private static int compareValues(Object a, Object b, String compareType) {
    if (compareType.equals("numeric")) {
      return Double.compare(JsNumber.jsNumber(a), JsNumber.jsNumber(b));
    }
    if (compareType.equals("string")) {
      // `localeCompare` (ICU collation, e.g. "a" before "B") — Java's
      // Collator with PRIMARY strength approximates this ordering closely
      // enough for the ASCII-domain vectors; exact ICU collation is a
      // known cross-host variance point (spec/template-helpers.md's
      // `sort` entry).
      java.text.Collator collator = java.text.Collator.getInstance(java.util.Locale.US);
      return collator.compare(JsValue.jsString(a), JsValue.jsString(b));
    }
    // "auto": relational operator — numeric for numbers, lexical for strings
    // (including numeric-looking strings, e.g. "10" < "9").
    if (a instanceof Number && b instanceof Number) {
      return Double.compare(((Number) a).doubleValue(), ((Number) b).doubleValue());
    }
    return JsValue.jsString(a).compareTo(JsValue.jsString(b));
  }

  /**
   * `.reduce((acc, x) => acc <op> x[.field], init)` / `.reduceRight(...)`.
   * `op` in {"+","*"}; `keyKind` in {"self","field"}; `type` in
   * {"numeric","string"}; `init` as a string (decoded seed); `direction`
   * in {"left","right"}.
   */
  public Object reduce(Object recv, Object op, Object keyKind, Object key, Object type,
                        Object init, Object direction) {
    List<?> list = recv instanceof List ? (List<?>) recv : List.of();
    boolean isMul = "*".equals(op);
    boolean isSelf = "self".equals(keyKind);
    boolean rightward = "right".equals(direction);
    // The declared `type` decodes the INITIAL seed literal only (a numeric
    // seed like "0" vs a string seed like ""). Folding itself always
    // applies GENUINE JS `+` semantics from there — a numeric accumulator
    // that meets a string-typed item concatenates from that point on, same
    // as real JS `0 + "5" + "6"` -> "056" even though the seed's declared
    // type is numeric (spec/template-helpers.md's `reduce` entry, the
    // "numeric-string items concatenate" vector: `type` does NOT force
    // numeric coercion of every subsequent element).
    Object acc = "numeric".equals(type) ? (Object) JsNumber.jsNumber(JsValue.jsString(init)) : JsValue.jsString(init);
    int n = list.size();
    for (int i = 0; i < n; i++) {
      Object item = list.get(rightward ? n - 1 - i : i);
      Object v = isSelf ? item : fieldOf(item, JsValue.jsString(key));
      if (isMul) {
        acc = JsNumber.jsNumber(acc) * JsNumber.jsNumber(v);
      } else if (acc instanceof String || v instanceof String) {
        // Direction changes ITERATION ORDER only (which item is visited
        // first) — the fold expression itself is always `acc + x`, never
        // swapped, exactly like real JS `.reduceRight((acc, x) => acc + x)`.
        acc = JsValue.jsString(acc) + JsValue.jsString(v);
      } else {
        acc = JsNumber.jsNumber(acc) + JsNumber.jsNumber(v);
      }
    }
    return acc;
  }

  public List<Object> flat_map(Object recv, Object kind, Object name) {
    List<Object> out = new ArrayList<>();
    if (!(recv instanceof List)) {
      return out;
    }
    boolean isSelf = "self".equals(kind);
    for (Object item : (List<?>) recv) {
      Object v = isSelf ? item : fieldOf(item, JsValue.jsString(name));
      if (v instanceof List) {
        out.addAll((List<?>) v);
      } else {
        out.add(v);
      }
    }
    return out;
  }

  /** Tuple form: `i => [i.a, i.b]` — every leaf appended verbatim (only the literal wrapper flattens). */
  public List<Object> flat_map_tuple(Object recv, Object... kindNamePairs) {
    List<Object> out = new ArrayList<>();
    if (!(recv instanceof List)) {
      return out;
    }
    for (Object item : (List<?>) recv) {
      for (int i = 0; i + 1 < kindNamePairs.length; i += 2) {
        boolean isSelf = "self".equals(kindNamePairs[i]);
        Object v = isSelf ? item : fieldOf(item, JsValue.jsString(kindNamePairs[i + 1]));
        out.add(v);
      }
    }
    return out;
  }

  // =========================================================================
  // search_params_get / query
  // =========================================================================

  public Object search_params_get(Object queryStr, Object key) {
    String q = JsValue.jsString(queryStr);
    if (q.startsWith("?")) {
      q = q.substring(1);
    }
    String wantKey = JsValue.jsString(key);
    if (q.isEmpty()) {
      return null;
    }
    for (String pair : q.split("&", -1)) {
      int eq = pair.indexOf('=');
      String k = eq < 0 ? pair : pair.substring(0, eq);
      String v = eq < 0 ? "" : pair.substring(eq + 1);
      k = urlDecode(k);
      if (k.equals(wantKey)) {
        return urlDecode(v);
      }
    }
    return null;
  }

  private static String urlDecode(String s) {
    return URLDecoder.decode(s, StandardCharsets.UTF_8);
  }

  /**
   * `queryHref` builtin lowering target (#2042): `base` + variadic
   * `(included, key, value)` triples, `value` a scalar or a list (one pair
   * per member). form-encoded like `URLSearchParams` (space -> `+`, `~`
   * kept literally UNescaped is WRONG — see vectors: `~` encodes to `%7E`,
   * `*` stays literal). Repeated key: last WRITE wins, first POSITION kept
   * (a JS `URLSearchParams.set` semantics fold).
   */
  public String query(Object base, Object... triples) {
    // key -> (position, values[])
    Map<String, Integer> position = new LinkedHashMap<>();
    List<List<String>> valuesByPosition = new ArrayList<>();
    int nextPos = 0;
    for (int i = 0; i + 3 <= triples.length; i += 3) { // a trailing partial triple is simply never reached
      boolean included = JsValue.truthy(triples[i]);
      String key = JsValue.jsString(triples[i + 1]);
      Object valueObj = triples[i + 2];
      List<String> values = new ArrayList<>();
      if (valueObj instanceof List) {
        for (Object el : (List<?>) valueObj) {
          String s = JsValue.jsString(el);
          if (!s.isEmpty()) {
            values.add(s);
          }
        }
      } else {
        String s = JsValue.jsString(valueObj);
        if (!s.isEmpty()) {
          values.add(s);
        }
      }
      if (!included || values.isEmpty()) {
        continue;
      }
      Integer pos = position.get(key);
      if (pos == null) {
        pos = nextPos++;
        position.put(key, pos);
        valuesByPosition.add(null);
      }
      // Build/overwrite the (key, values) pair at its position, keeping the
      // ORIGINAL key text for encoding.
      List<String> entry = new ArrayList<>();
      entry.add(key);
      entry.addAll(values);
      while (valuesByPosition.size() <= pos) {
        valuesByPosition.add(null);
      }
      valuesByPosition.set(pos, entry);
    }
    StringBuilder qs = new StringBuilder();
    for (List<String> entry : valuesByPosition) {
      if (entry == null) {
        continue;
      }
      String key = entry.get(0);
      for (int i = 1; i < entry.size(); i++) {
        if (qs.length() > 0) {
          qs.append('&');
        }
        qs.append(formEncode(key)).append('=').append(formEncode(entry.get(i)));
      }
    }
    String baseStr = JsValue.jsString(base);
    return qs.length() == 0 ? baseStr : baseStr + "?" + qs;
  }

  /** `application/x-www-form-urlencoded` (URLSearchParams), not RFC 3986 query-escape: space -> `+`, `~`/`*` differ from percent-escaping. */
  private static String formEncode(String s) {
    String encoded = URLEncoder.encode(s, StandardCharsets.UTF_8);
    // Java's URLEncoder escapes '*' (as %2A) and encodes space as '+'
    // already; JS's URLSearchParams leaves '*' literal and escapes '~' (Java
    // leaves '~' literal) — reconcile both differences explicitly.
    return encoded.replace("%2A", "*").replace("~", "%7E");
  }

  // =========================================================================
  // Style / spread attribute rendering (#1322/#2261)
  // =========================================================================

  private static final Pattern UNSAFE_CSS_VALUE = Pattern.compile("[;{}]|/\\*|<|>|url\\s*\\(", Pattern.CASE_INSENSITIVE);

  /**
   * `style={{...}}` object literal lowering (Hono's `hasUnsafeStyleValue`
   * oracle, ported): variadic `(cssKey, value)` pairs. Drops any pair whose
   * value could break out of the CSS declaration; HTML-escapes what
   * remains; returns a {@link SafeString} so the caller's un-filtered
   * `{{ bf.style_object(...) }}` isn't double-escaped by Pebble's own
   * autoescaper (see the source-code note in the package README on
   * `SafeString`/`EscapeFilter`).
   */
  public SafeString style_object(Object... keyValuePairs) {
    StringBuilder decls = new StringBuilder();
    for (int i = 0; i + 1 < keyValuePairs.length; i += 2) {
      String cssKey = JsValue.jsString(keyValuePairs[i]);
      Object valueObj = keyValuePairs[i + 1];
      if (valueObj == null) {
        continue;
      }
      String value = JsValue.jsString(valueObj);
      if (value.isEmpty() || UNSAFE_CSS_VALUE.matcher(value).find()) {
        continue;
      }
      if (decls.length() > 0) {
        decls.append(' ');
      }
      decls.append(htmlEscape(cssKey)).append(':').append(htmlEscape(value)).append(';');
    }
    return new SafeString(decls.length() == 0 ? "" : "style=\"" + decls + "\"");
  }

  /** `{...attrs}` spread onto an intrinsic element — one `key="value"` per entry, boolean-shorthand aware. */
  @SuppressWarnings("unchecked")
  public SafeString spread_attrs(Object attrsObj) {
    StringBuilder out = new StringBuilder();
    if (attrsObj instanceof Map) {
      for (Map.Entry<String, Object> e : ((Map<String, Object>) attrsObj).entrySet()) {
        Object v = e.getValue();
        if (v == null || Boolean.FALSE.equals(v)) {
          continue;
        }
        if (out.length() > 0) {
          out.append(' ');
        }
        if (Boolean.TRUE.equals(v)) {
          out.append(htmlEscape(e.getKey()));
        } else {
          out.append(htmlEscape(e.getKey())).append("=\"").append(htmlEscape(JsValue.jsString(v))).append('"');
        }
      }
    }
    return new SafeString(out.toString());
  }

  private static String htmlEscape(String s) {
    StringBuilder sb = new StringBuilder(s.length());
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '&':
          sb.append("&amp;");
          break;
        case '<':
          sb.append("&lt;");
          break;
        case '>':
          sb.append("&gt;");
          break;
        case '"':
          sb.append("&quot;");
          break;
        case '\'':
          sb.append("&#39;");
          break;
        default:
          sb.append(c);
      }
    }
    return sb.toString();
  }

  // =========================================================================
  // Hydration markers / render state
  // (spec/template-helpers.md explicitly excludes these — see the class
  // header. Phase 4 validates the exact byte shape against the shared
  // fixture corpus; this is a reasonable, self-consistent implementation.)
  // =========================================================================

  /** `bf-s="..."` value: this render's root scope id. */
  public String scope_attr() {
    return rootScopeId;
  }

  /** Reserved for future hydration-mode markers (`bf-h`/`bf-m`/`bf-r`) — none needed yet. */
  public String hydration_attrs() {
    return "";
  }

  /** Reserved for a `bf-p` marker when a props payload accompanies the scope. */
  public String props_attr() {
    return "";
  }

  /** A loop row's own data-key attribute, when this component is itself invoked as a keyed row. */
  public String data_key_attr() {
    return "";
  }

  /** HTML comment marker (client-hydration anchor for a clientOnly slot). */
  public String comment(Object text) {
    return "<!--" + JsValue.jsString(text) + "-->";
  }

  /** Neutralizes `-` in a dynamic loop-row key so it can't spell `-->` and close the comment early. */
  public String escape_comment_key(Object key) {
    return JsValue.jsString(key).replace("-", "_");
  }

  public String scope_comment() {
    return "<!--bf-scope:" + markerCounter.incrementAndGet() + "-->";
  }

  public String scope_comment_end() {
    return "<!--/bf-scope-->";
  }

  /** `<div bf-async="id">fallback</div>` wrapper — a real render always resolves synchronously, so this only wraps the fallback markup for the marker's sake. */
  public String async_boundary(Object id, Object fallbackHtml) {
    return "<div bf-async=\"" + htmlEscape(JsValue.jsString(id)) + "\">" + JsValue.jsString(fallbackHtml) + "</div>";
  }

  public String text_start(Object slotId) {
    return "<!--t:" + JsValue.jsString(slotId) + "-->";
  }

  public String text_end() {
    return "<!--/t-->";
  }

  public String register_script(Object url) {
    return "<script type=\"module\" src=\"" + htmlEscape(JsValue.jsString(url)) + "\"></script>";
  }

  public String register_preload(Object url) {
    return "<link rel=\"modulepreload\" href=\"" + htmlEscape(JsValue.jsString(url)) + "\">";
  }

  // Context provide/use — a simple stack per context name, scoped to this
  // render (this `Bf` instance is fresh per render — see Main).
  private final Map<String, java.util.Deque<Object>> contextStacks = new LinkedHashMap<>();

  public String provide_context(Object name, Object value) {
    contextStacks.computeIfAbsent(JsValue.jsString(name), k -> new java.util.ArrayDeque<>()).push(value);
    return "";
  }

  public String revoke_context(Object name) {
    java.util.Deque<Object> stack = contextStacks.get(JsValue.jsString(name));
    if (stack != null && !stack.isEmpty()) {
      stack.pop();
    }
    return "";
  }

  public Object use_context(Object name) {
    java.util.Deque<Object> stack = contextStacks.get(JsValue.jsString(name));
    return (stack == null || stack.isEmpty()) ? null : stack.peek();
  }

  /**
   * Cross-template child invocation (`<Child {...props}/>`). NOT supported
   * in this Phase 3a runtime — a child template requires the Phase 3b
   * custom `{% set %}...{% endset %}` tag to capture children/slots
   * faithfully, and this CLI (`Main`) registers only ONE template per
   * render. Throws loudly rather than silently rendering nothing.
   */
  public String render_child(Object name, Object props) {
    throw new UnsupportedOperationException(
        "bf.render_child('" + JsValue.jsString(name) + "', ...): cross-template child rendering "
            + "is out of scope for the Phase 3a runtime (needs the Phase 3b {% set %}...{% endset %} "
            + "tag extension and multi-template registration in Main).");
  }

  // =========================================================================
  // ParsedExpr evaluator (#2018) — `.map()/.filter()/.reduce()/.sort()/
  // .find()` callback bodies that don't lower to native Pebble syntax.
  // Each `*_eval` method receives the callback body as serialized-JSON
  // (see packages/adapter-pebble/src/adapter/expr/array-method.ts's
  // render*Eval functions for the exact call shape) plus the captured
  // free-variable environment as a Pebble map literal.
  // =========================================================================

  private static JsonObject parseNode(String json) {
    return GSON.fromJson(json, JsonObject.class);
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> baseEnv(Object envMap) {
    return envMap instanceof Map ? new LinkedHashMap<>((Map<String, Object>) envMap) : new LinkedHashMap<>();
  }

  public List<Object> map_eval(Object recv, String bodyJson, String param, Object env) {
    List<Object> out = new ArrayList<>();
    if (!(recv instanceof List)) {
      return out;
    }
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    List<?> list = (List<?>) recv;
    for (Object item : list) {
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, item);
      out.add(Evaluator.evaluate(body, inner));
    }
    return out;
  }

  public List<Object> filter_eval(Object recv, String bodyJson, String param, Object env) {
    List<Object> out = new ArrayList<>();
    if (!(recv instanceof List)) {
      return out;
    }
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    for (Object item : (List<?>) recv) {
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, item);
      if (JsValue.truthy(Evaluator.evaluate(body, inner))) {
        out.add(item);
      }
    }
    return out;
  }

  public boolean every_eval(Object recv, String bodyJson, String param, Object env) {
    if (!(recv instanceof List)) {
      return true;
    }
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    for (Object item : (List<?>) recv) {
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, item);
      if (!JsValue.truthy(Evaluator.evaluate(body, inner))) {
        return false;
      }
    }
    return true;
  }

  public boolean some_eval(Object recv, String bodyJson, String param, Object env) {
    if (!(recv instanceof List)) {
      return false;
    }
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    for (Object item : (List<?>) recv) {
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, item);
      if (JsValue.truthy(Evaluator.evaluate(body, inner))) {
        return true;
      }
    }
    return false;
  }

  public Object find_eval(Object recv, String bodyJson, String param, Object forwardObj, Object env) {
    if (!(recv instanceof List)) {
      return null;
    }
    boolean forward = JsValue.truthy(forwardObj);
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    List<?> list = (List<?>) recv;
    int n = list.size();
    for (int i = 0; i < n; i++) {
      Object item = list.get(forward ? i : n - 1 - i);
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, item);
      if (JsValue.truthy(Evaluator.evaluate(body, inner))) {
        return item;
      }
    }
    return null;
  }

  public double find_index_eval(Object recv, String bodyJson, String param, Object forwardObj, Object env) {
    if (!(recv instanceof List)) {
      return -1;
    }
    boolean forward = JsValue.truthy(forwardObj);
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    List<?> list = (List<?>) recv;
    int n = list.size();
    for (int i = 0; i < n; i++) {
      int idx = forward ? i : n - 1 - i;
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, list.get(idx));
      if (JsValue.truthy(Evaluator.evaluate(body, inner))) {
        return idx;
      }
    }
    return -1;
  }

  public List<Object> flat_map_eval(Object recv, String bodyJson, String param, Object env) {
    List<Object> out = new ArrayList<>();
    if (!(recv instanceof List)) {
      return out;
    }
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    for (Object item : (List<?>) recv) {
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, item);
      Object v = Evaluator.evaluate(body, inner);
      if (v instanceof List) {
        out.addAll((List<?>) v);
      } else {
        out.add(v);
      }
    }
    return out;
  }

  public List<Object> sort_eval(Object recv, String bodyJson, String paramA, String paramB, Object env) {
    if (!(recv instanceof List)) {
      return new ArrayList<>();
    }
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    List<Object> out = new ArrayList<>();
    for (Object o : (List<?>) recv) {
      out.add(o);
    }
    out.sort((a, b) -> {
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(paramA, a);
      inner.put(paramB, b);
      double r = JsNumber.jsNumber(Evaluator.evaluate(body, inner));
      return Double.compare(r, 0.0);
    });
    return out;
  }

  public Object reduce_eval(Object recv, String bodyJson, String paramAcc, String paramItem,
                             Object init, String direction, Object env) {
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    List<?> list = recv instanceof List ? (List<?>) recv : List.of();
    boolean rightward = "right".equals(direction);
    Object acc = init;
    int n = list.size();
    for (int i = 0; i < n; i++) {
      Object item = list.get(rightward ? n - 1 - i : i);
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(paramAcc, acc);
      inner.put(paramItem, item);
      acc = Evaluator.evaluate(body, inner);
    }
    return acc;
  }
}
