package dev.barefootjs.pebble.eval;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import dev.barefootjs.pebble.JsNumber;
import dev.barefootjs.pebble.JsValue;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Java port of the reference {@code ParsedExpr} evaluator
 * (`packages/adapter-tests/vectors/eval-reference.ts`) — the literal
 * semantic source of truth for the pure-expression subset a
 * `.map()/.filter()/.reduce()/.sort()/.find()` callback body compiles to
 * when it doesn't lower to native Pebble syntax (`bf.*_eval` calls; see
 * `packages/adapter-pebble/src/adapter/expr/array-method.ts`'s
 * `render*Eval` functions for the exact call shape / JSON payload
 * protocol this class consumes).
 *
 * <p>Scope, subset, and every semantic rule below are a DIRECT,
 * line-for-line port of the TS reference — see that file's header for the
 * full rationale (numbers as doubles with JS coercion, strict-equality
 * only, code-unit string comparison, {@link EvalUnsupported} for anything
 * outside the subset). This class intentionally does not re-derive any
 * semantics beyond what the reference already documents.
 *
 * <p>Input shape: a {@link JsonObject} tree in the exact shape
 * {@code serializeParsedExpr} (`packages/jsx/src/expression-parser.ts`)
 * emits — the SAME `kind`-tagged node shapes as `eval-vectors.json` (no
 * separate wrapper format). The environment ({@code acc}/{@code item}/
 * {@code index} plus captured free vars) is a {@code Map<String, Object>}
 * over this runtime's JSON-shaped value domain (see {@link JsValue}):
 * {@code null}, {@link Boolean}, {@link Double}, {@link String},
 * {@code List<Object>}, {@code Map<String, Object>}.
 */
public final class Evaluator {

  private Evaluator() {
  }

  // ---------------------------------------------------------------------
  // Entry point
  // ---------------------------------------------------------------------

  public static Object evaluate(JsonObject expr, Map<String, Object> env) {
    String kind = str(expr, "kind");
    switch (kind) {
      case "literal":
        return literalValue(expr.get("value"));

      case "identifier": {
        String name = str(expr, "name");
        if (!env.containsKey(name)) {
          throw new EvalUnsupported("unbound identifier '" + name + "'");
        }
        return env.get(name);
      }

      case "binary":
        return binary(str(expr, "op"), evaluate(obj(expr, "left"), env), evaluate(obj(expr, "right"), env));

      case "unary":
        return unary(str(expr, "op"), evaluate(obj(expr, "argument"), env));

      case "logical": {
        String op = str(expr, "op");
        Object left = evaluate(obj(expr, "left"), env);
        if (op.equals("&&")) {
          return JsValue.truthy(left) ? evaluate(obj(expr, "right"), env) : left;
        }
        if (op.equals("||")) {
          return JsValue.truthy(left) ? left : evaluate(obj(expr, "right"), env);
        }
        // `??`
        return left == null ? evaluate(obj(expr, "right"), env) : left;
      }

      case "conditional":
        return JsValue.truthy(evaluate(obj(expr, "test"), env))
            ? evaluate(obj(expr, "consequent"), env)
            : evaluate(obj(expr, "alternate"), env);

      case "member":
        return readProperty(evaluate(obj(expr, "object"), env), str(expr, "property"));

      case "index-access":
        return readIndex(evaluate(obj(expr, "object"), env), evaluate(obj(expr, "index"), env));

      case "call":
        return evalCall(expr, env);

      case "template-literal": {
        StringBuilder sb = new StringBuilder();
        for (JsonElement pEl : expr.getAsJsonArray("parts")) {
          JsonObject p = pEl.getAsJsonObject();
          if (str(p, "type").equals("string")) {
            sb.append(str(p, "value"));
          } else {
            sb.append(JsValue.jsString(evaluate(obj(p, "expr"), env)));
          }
        }
        return sb.toString();
      }

      case "array-literal": {
        List<Object> out = new ArrayList<>();
        for (JsonElement e : expr.getAsJsonArray("elements")) {
          out.add(evaluate(e.getAsJsonObject(), env));
        }
        return out;
      }

      case "object-literal": {
        // Insertion-ordered (LinkedHashMap), mirroring the TS reference's
        // plain-object semantics (later entries win on a shared key).
        Map<String, Object> out = new LinkedHashMap<>();
        for (JsonElement propEl : expr.getAsJsonArray("properties")) {
          JsonObject prop = propEl.getAsJsonObject();
          if (str(prop, "kind").equals("spread")) {
            Object spread = evaluate(obj(prop, "expr"), env);
            if (spread instanceof Map) {
              @SuppressWarnings("unchecked")
              Map<String, Object> spreadMap = (Map<String, Object>) spread;
              out.putAll(spreadMap);
            }
            continue;
          }
          out.put(str(prop, "key"), evaluate(obj(prop, "value"), env));
        }
        return out;
      }

      case "array-method":
        return evalArrayMethod(expr, env);

      default:
        // arrow-fn (outside a recognized map/filter callee), higher-order,
        // regex, unsupported: refused, same as the TS reference's default.
        throw new EvalUnsupported("node kind '" + kind + "' is not in the evaluator subset");
    }
  }

  // ---------------------------------------------------------------------
  // Coercion primitives (ToNumber / ToString / ToBoolean) — delegate to the
  // shared JsNumber/JsValue helpers so this evaluator and every `bf.*`
  // template helper agree on one coercion implementation.
  // ---------------------------------------------------------------------

  private static double toNumber(Object v) {
    if (v instanceof Number) {
      return ((Number) v).doubleValue();
    }
    if (v instanceof Boolean) {
      return ((Boolean) v) ? 1.0 : 0.0;
    }
    if (v == null) {
      return 0.0;
    }
    if (v instanceof String) {
      String t = ((String) v).trim();
      if (t.isEmpty()) {
        return 0.0;
      }
      return JsNumber.jsNumber(t);
    }
    throw new EvalUnsupported("cannot coerce " + typeName(v) + " to number");
  }

  private static String toStr(Object v) {
    if (v instanceof String) {
      return (String) v;
    }
    if (v instanceof Number) {
      return JsNumber.numberToString(((Number) v).doubleValue());
    }
    if (v instanceof Boolean) {
      return ((Boolean) v) ? "true" : "false";
    }
    if (v == null) {
      return "null";
    }
    throw new EvalUnsupported("cannot coerce " + typeName(v) + " to string");
  }

  // ---------------------------------------------------------------------
  // Operators
  // ---------------------------------------------------------------------

  private static Object binary(String op, Object l, Object r) {
    switch (op) {
      case "+":
        if (l instanceof String || r instanceof String) {
          return toStr(l) + toStr(r);
        }
        return toNumber(l) + toNumber(r);
      case "-":
        return toNumber(l) - toNumber(r);
      case "*":
        return toNumber(l) * toNumber(r);
      case "/":
        return toNumber(l) / toNumber(r);
      case "%":
        return toNumber(l) % toNumber(r);
      case "<":
      case "<=":
      case ">":
      case ">=":
        return relational(op, l, r);
      case "===":
        return strictEquals(l, r);
      case "!==":
        return !strictEquals(l, r);
      default:
        throw new EvalUnsupported("binary operator '" + op + "' is not in the evaluator subset");
    }
  }

  private static boolean relational(String op, Object l, Object r) {
    int c;
    if (l instanceof String && r instanceof String) {
      c = ((String) l).compareTo((String) r);
      c = Integer.signum(c);
    } else {
      double ln = toNumber(l);
      double rn = toNumber(r);
      if (Double.isNaN(ln) || Double.isNaN(rn)) {
        return false;
      }
      c = Double.compare(ln, rn);
    }
    switch (op) {
      case "<":
        return c < 0;
      case "<=":
        return c <= 0;
      case ">":
        return c > 0;
      case ">=":
        return c >= 0;
      default:
        return false;
    }
  }

  private static boolean strictEquals(Object l, Object r) {
    if (l instanceof List || l instanceof Map) {
      throw new EvalUnsupported("=== on a non-primitive is not in the evaluator subset");
    }
    if (r instanceof List || r instanceof Map) {
      throw new EvalUnsupported("=== on a non-primitive is not in the evaluator subset");
    }
    return JsValue.strictEquals(l, r);
  }

  private static Object unary(String op, Object v) {
    switch (op) {
      case "!":
        return !JsValue.truthy(v);
      case "-":
        return -toNumber(v);
      case "+":
        return toNumber(v);
      default:
        throw new EvalUnsupported("unary operator '" + op + "' is not in the evaluator subset");
    }
  }

  // ---------------------------------------------------------------------
  // Built-in calls
  // ---------------------------------------------------------------------

  private static Object callBuiltin(String name, List<Object> args) {
    switch (name) {
      case "Math.max": {
        double m = Double.NEGATIVE_INFINITY;
        for (Object a : args) {
          m = Math.max(m, toNumber(a));
        }
        return args.isEmpty() ? Double.NEGATIVE_INFINITY : m;
      }
      case "Math.min": {
        double m = Double.POSITIVE_INFINITY;
        for (Object a : args) {
          m = Math.min(m, toNumber(a));
        }
        return args.isEmpty() ? Double.POSITIVE_INFINITY : m;
      }
      case "Math.abs":
        return Math.abs(toNumber(args.get(0)));
      case "Math.floor":
        return Math.floor(toNumber(args.get(0)));
      case "Math.ceil":
        return Math.ceil(toNumber(args.get(0)));
      case "Math.round":
        return JsNumber.jsRound(toNumber(args.get(0)));
      case "String":
        return toStr(args.get(0));
      case "Number":
        return toNumber(args.get(0));
      case "Boolean":
        return JsValue.truthy(args.get(0));
      default:
        throw new EvalUnsupported("builtin '" + name + "' is not in the evaluator subset");
    }
  }

  /** Resolve a `call` callee node to its builtin name (e.g. `Math.max`), or null. */
  private static String builtinName(JsonObject callee) {
    String kind = str(callee, "kind");
    if (kind.equals("identifier")) {
      return str(callee, "name");
    }
    if (kind.equals("member")
        && !bool(callee, "computed")
        && str(obj(callee, "object"), "kind").equals("identifier")) {
      return str(obj(callee, "object"), "name") + "." + str(callee, "property");
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // Member / index access
  // ---------------------------------------------------------------------

  @SuppressWarnings("unchecked")
  private static Object readProperty(Object obj, String key) {
    if (obj instanceof String) {
      if (key.equals("length")) {
        return (double) ((String) obj).length();
      }
      throw new EvalUnsupported("property '" + key + "' on a string is not in the evaluator subset");
    }
    if (obj instanceof List) {
      if (key.equals("length")) {
        return (double) ((List<?>) obj).size();
      }
      throw new EvalUnsupported("property '" + key + "' on an array is not in the evaluator subset");
    }
    if (obj instanceof Map) {
      Map<String, Object> m = (Map<String, Object>) obj;
      return m.containsKey(key) ? m.get(key) : null;
    }
    throw new EvalUnsupported("cannot read property '" + key + "' of " + (obj == null ? "null" : typeName(obj)));
  }

  private static Object readIndex(Object obj, Object index) {
    if (obj instanceof List) {
      double i = toNumber(index);
      List<?> list = (List<?>) obj;
      if (i != Math.floor(i) || i < 0 || i >= list.size()) {
        return null;
      }
      return list.get((int) i);
    }
    if (obj instanceof Map) {
      return readProperty(obj, toStr(index));
    }
    throw new EvalUnsupported("cannot index " + (obj == null ? "null" : typeName(obj)));
  }

  // ---------------------------------------------------------------------
  // `call` dispatch: nested `.map`/`.filter` callback calls widen into the
  // subset (order-preserving, per-element, bounded); every other call is
  // either a recognized builtin or refused.
  // ---------------------------------------------------------------------

  @SuppressWarnings("unchecked")
  private static Object evalCall(JsonObject expr, Map<String, Object> env) {
    JsonObject callee = obj(expr, "callee");
    if (str(callee, "kind").equals("member") && !bool(callee, "computed")) {
      String method = str(callee, "property");
      if (method.equals("map") || method.equals("filter")) {
        JsonArray argsArr = expr.getAsJsonArray("args");
        if (argsArr.size() == 1 && argsArr.get(0).getAsJsonObject().has("kind")
            && str(argsArr.get(0).getAsJsonObject(), "kind").equals("arrow")) {
          Object receiver = evaluate(obj(callee, "object"), env);
          if (!(receiver instanceof List)) {
            throw new EvalUnsupported("." + method + " on a non-array is not in the evaluator subset");
          }
          JsonObject arrow = argsArr.get(0).getAsJsonObject();
          List<String> params = new ArrayList<>();
          for (JsonElement p : arrow.getAsJsonArray("params")) {
            params.add(p.getAsString());
          }
          JsonObject body = obj(arrow, "body");
          List<Object> receiverList = (List<Object>) receiver;
          List<Object> out = new ArrayList<>();
          for (int i = 0; i < receiverList.size(); i++) {
            Map<String, Object> inner = new LinkedHashMap<>(env);
            inner.put(params.get(0), receiverList.get(i));
            if (params.size() > 1) {
              inner.put(params.get(1), (double) i);
            }
            Object result = evaluate(body, inner);
            if (method.equals("map")) {
              out.add(result);
            } else if (JsValue.truthy(result)) {
              out.add(receiverList.get(i));
            }
          }
          return out;
        }
      }
    }
    String name = builtinName(callee);
    if (name == null) {
      throw new EvalUnsupported("only built-in calls (Math.*, String/Number/Boolean) are in the subset");
    }
    List<Object> args = new ArrayList<>();
    for (JsonElement a : expr.getAsJsonArray("args")) {
      args.add(evaluate(a.getAsJsonObject(), env));
    }
    return callBuiltin(name, args);
  }

  // ---------------------------------------------------------------------
  // `array-method`: `.includes(x)` / `.join(sep?)` only (a nested `.map`/
  // `.filter` reaches the `call` arm above instead).
  // ---------------------------------------------------------------------

  private static Object evalArrayMethod(JsonObject expr, Map<String, Object> env) {
    String method = str(expr, "method");
    JsonArray argsArr = expr.getAsJsonArray("args");
    if (method.equals("includes") && argsArr.size() == 1) {
      Object receiver = evaluate(obj(expr, "object"), env);
      Object needle = evaluate(argsArr.get(0).getAsJsonObject(), env);
      return includes(receiver, needle);
    }
    if (method.equals("join") && argsArr.size() <= 1) {
      Object receiver = evaluate(obj(expr, "object"), env);
      String sep = argsArr.size() == 1 ? toStr(evaluate(argsArr.get(0).getAsJsonObject(), env)) : ",";
      return evalJoin(receiver, sep);
    }
    throw new EvalUnsupported("array-method '" + method + "' is not in the evaluator subset");
  }

  private static boolean includes(Object obj, Object needle) {
    if (obj instanceof List) {
      for (Object el : (List<?>) obj) {
        if (JsValue.sameValueZero(el, needle)) {
          return true;
        }
      }
      return false;
    }
    if (obj instanceof String) {
      return ((String) obj).contains(toStr(needle));
    }
    return false;
  }

  private static String evalJoin(Object obj, String sep) {
    if (!(obj instanceof List)) {
      throw new EvalUnsupported(".join on a non-array is not in the evaluator subset");
    }
    StringBuilder sb = new StringBuilder();
    List<?> list = (List<?>) obj;
    for (int i = 0; i < list.size(); i++) {
      if (i > 0) {
        sb.append(sep);
      }
      Object el = list.get(i);
      if (el != null) {
        sb.append(toStr(el));
      }
    }
    return sb.toString();
  }

  // ---------------------------------------------------------------------
  // JSON tree helpers
  // ---------------------------------------------------------------------

  /** Convert a raw JSON literal `value` field into this runtime's value domain. */
  private static Object literalValue(JsonElement el) {
    if (el == null || el.isJsonNull()) {
      return null;
    }
    JsonPrimitive p = el.getAsJsonPrimitive();
    if (p.isBoolean()) {
      return p.getAsBoolean();
    }
    if (p.isNumber()) {
      return p.getAsDouble();
    }
    return p.getAsString();
  }

  private static String str(JsonObject o, String key) {
    JsonElement el = o.get(key);
    if (el == null || el.isJsonNull()) {
      throw new EvalUnsupported("missing required field '" + key + "'");
    }
    return el.getAsString();
  }

  private static boolean bool(JsonObject o, String key) {
    JsonElement el = o.get(key);
    return el != null && !el.isJsonNull() && el.getAsBoolean();
  }

  private static JsonObject obj(JsonObject o, String key) {
    JsonElement el = o.get(key);
    if (el == null || el.isJsonNull()) {
      throw new EvalUnsupported("missing required field '" + key + "'");
    }
    return el.getAsJsonObject();
  }

  private static String typeName(Object v) {
    if (v instanceof List) {
      return "array";
    }
    if (v instanceof Map) {
      return "object";
    }
    return v.getClass().getSimpleName();
  }
}
