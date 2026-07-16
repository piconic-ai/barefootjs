//! Port of `packages/adapter-jinja/python/barefootjs/evaluator.py` (itself a
//! port of `packages/adapter-perl/lib/BarefootJS/Evaluator.pm`).
//!
//! Lightweight evaluator for the pure `ParsedExpr` subset, scoped to
//! higher-order callback bodies (reduce / sort / map / filter / find
//! `(...) => expr`) -- issue #2018. The callback BODY rides as a pure
//! `ParsedExpr` subtree (the structured IR the compiler already produces,
//! decoded here as plain `serde_json::Value` -- see the `num` module
//! docstring for why the tree itself stays `serde_json::Value` while
//! evaluation RESULTS use [`crate::num::JsValue`]) and is evaluated against
//! an environment (`{acc, item, ...captured free vars}`).
//!
//! ONE shared implementation across all backends (mirrors the Perl module).
//! The accepted subset and its semantics are documented in
//! `spec/compiler.md` ("ParsedExpr Evaluator Semantics") and pinned
//! isomorphically by the cross-language golden vectors
//! (`packages/adapter-tests/vectors/eval-vectors.json`), shared with
//! the Go evaluator (`bf.go`) and the Perl evaluator -- same input -> same
//! output, so unlike the runtime helper vectors there are NO backend
//! divergences declared against this file's tests (see
//! `tests/eval_vectors.rs`).
//!
//! The coercion below is JS-faithful (ToNumber / ToString / ToBoolean,
//! strict equality) and deliberately distinct from the divergent
//! `bf.string` / `bf.number` helpers in `runtime.rs`, so the contract is
//! unambiguous and every template adapter stays byte-equal with each other
//! and with Go.

use crate::num::{self, JsValue};
use serde_json::Value as JsonValue;
use std::collections::HashMap;

pub type Env = HashMap<String, JsValue>;

// ---------------------------------------------------------------------------
// evaluate(node, env): evaluate a decoded ParsedExpr node (a JSON object
// keyed by `kind`) against the environment, returning a `JsValue`. The
// matching JSON-string entry point is `eval_json` below.
// ---------------------------------------------------------------------------

pub fn evaluate(node: &JsonValue, env: &Env) -> JsValue {
    let kind = node.get("kind").and_then(|v| v.as_str()).unwrap_or("");

    match kind {
        "literal" => node.get("value").map(JsValue::from_json).unwrap_or(JsValue::Null),
        "identifier" => {
            let name = node.get("name").and_then(|v| v.as_str()).unwrap_or("");
            env.get(name).cloned().unwrap_or(JsValue::Null)
        }
        "binary" => {
            let op = node.get("op").and_then(|v| v.as_str()).unwrap_or("");
            let l = evaluate(node.get("left").unwrap_or(&JsonValue::Null), env);
            let r = evaluate(node.get("right").unwrap_or(&JsonValue::Null), env);
            binary(op, &l, &r)
        }
        "unary" => {
            let op = node.get("op").and_then(|v| v.as_str()).unwrap_or("");
            let v = evaluate(node.get("argument").unwrap_or(&JsonValue::Null), env);
            unary(op, &v)
        }
        "logical" => {
            let op = node.get("op").and_then(|v| v.as_str()).unwrap_or("");
            let left = evaluate(node.get("left").unwrap_or(&JsonValue::Null), env);
            match op {
                "&&" => {
                    if truthy(&left) {
                        evaluate(node.get("right").unwrap_or(&JsonValue::Null), env)
                    } else {
                        left
                    }
                }
                "||" => {
                    if truthy(&left) {
                        left
                    } else {
                        evaluate(node.get("right").unwrap_or(&JsonValue::Null), env)
                    }
                }
                _ => {
                    // `??`
                    if !matches!(left, JsValue::Null) {
                        left
                    } else {
                        evaluate(node.get("right").unwrap_or(&JsonValue::Null), env)
                    }
                }
            }
        }
        "conditional" => {
            let test = evaluate(node.get("test").unwrap_or(&JsonValue::Null), env);
            if truthy(&test) {
                evaluate(node.get("consequent").unwrap_or(&JsonValue::Null), env)
            } else {
                evaluate(node.get("alternate").unwrap_or(&JsonValue::Null), env)
            }
        }
        "member" => {
            let obj = evaluate(node.get("object").unwrap_or(&JsonValue::Null), env);
            let key = node.get("property").and_then(|v| v.as_str()).unwrap_or("");
            read_property(&obj, key)
        }
        "index-access" => {
            let obj = evaluate(node.get("object").unwrap_or(&JsonValue::Null), env);
            let idx = evaluate(node.get("index").unwrap_or(&JsonValue::Null), env);
            read_index(&obj, &idx)
        }
        "call" => {
            // Nested `.map(cb)` / `.filter(cb)` (#2094) -- e.g. a
            // `.flatMap(p => p.tags.map(t => '#'+t))` projection body that
            // itself contains a `.map` call. Checked BEFORE builtin-name
            // resolution since a `member` callee here is a receiver method,
            // not an allowlisted builtin reference. Mirrors Go's
            // `evalArrayCallbackCall` / `evalArrayCallback`.
            if let Some((method, object, arrow)) = array_callback_call(node) {
                return eval_array_callback(method, object, arrow, env);
            }
            let name = builtin_name(node.get("callee").unwrap_or(&JsonValue::Null));
            if name.is_empty() {
                return JsValue::Null;
            }
            let args: Vec<JsValue> = node
                .get("args")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().map(|n| evaluate(n, env)).collect())
                .unwrap_or_default();
            call_builtin(&name, &args)
        }
        "template-literal" => {
            let mut out = String::new();
            if let Some(parts) = node.get("parts").and_then(|v| v.as_array()) {
                for p in parts {
                    let ptype = p.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    if ptype == "string" {
                        out.push_str(p.get("value").and_then(|v| v.as_str()).unwrap_or(""));
                    } else {
                        let expr = p.get("expr").unwrap_or(&JsonValue::Null);
                        out.push_str(&to_string(&evaluate(expr, env)));
                    }
                }
            }
            JsValue::String(out)
        }
        "array-literal" => {
            let elements = node
                .get("elements")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().map(|n| evaluate(n, env)).collect())
                .unwrap_or_default();
            JsValue::Array(elements)
        }
        "object-literal" => {
            let mut out = std::collections::BTreeMap::new();
            if let Some(props) = node.get("properties").and_then(|v| v.as_array()) {
                for prop in props {
                    let key = prop.get("key").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let value = evaluate(prop.get("value").unwrap_or(&JsonValue::Null), env);
                    out.insert(key, value);
                }
            }
            JsValue::Object(out)
        }
        "array-method" if node.get("method").and_then(|v| v.as_str()) == Some("includes") => {
            // `.includes(x)` (#2075) -- the one `array-method` in the
            // evaluator subset, shared between `Array.prototype.includes`
            // (SameValueZero membership) and `String.prototype.includes`
            // (substring search), matching the receiver-type dispatch the
            // SSR template lowering does at runtime (`bf.includes`).
            let args = node.get("args").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            if args.len() == 1 {
                let obj = evaluate(node.get("object").unwrap_or(&JsonValue::Null), env);
                let needle = evaluate(&args[0], env);
                match &obj {
                    JsValue::Array(items) => {
                        JsValue::Bool(items.iter().any(|el| num::same_value_zero(el, &needle)))
                    }
                    JsValue::String(s) => JsValue::Bool(s.contains(&to_string(&needle))),
                    // Any other receiver is not a JS `.includes` target --
                    // degrade to false rather than raising, mirroring the
                    // reference.
                    _ => JsValue::Bool(false),
                }
            } else {
                JsValue::Null
            }
        }
        "array-method" if node.get("method").and_then(|v| v.as_str()) == Some("join") => {
            // `.join(sep?)` (#2094), a plain `array-method` node (not a
            // `call`): default separator `,`, a `null`/`undefined` element
            // joins as `''` (NOT the string "null" -- `to_string` below
            // intentionally renders `Null` as `"null"` for general ToString
            // purposes, so this special-cases it first). Mirrors Go's
            // `evalJoin`.
            let obj = evaluate(node.get("object").unwrap_or(&JsonValue::Null), env);
            let args = node.get("args").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let sep = if args.is_empty() { ",".to_string() } else { to_string(&evaluate(&args[0], env)) };
            eval_join(&obj, &sep)
        }
        // arrow-fn / higher-order / unsupported array-method: a callback
        // body containing these is refused upstream (BF101); never reached
        // here.
        _ => JsValue::Null,
    }
}

/// Recognize a nested `.map(cb)` / `.filter(cb)` call: the callee is
/// `{kind:'member', object, property:'map'|'filter', computed:false}` and
/// the first argument is `{kind:'arrow', params, body}`. Returns the method
/// name, the receiver node, and the arrow node. Mirrors Go's
/// `evalArrayCallbackCall`.
fn array_callback_call(node: &JsonValue) -> Option<(&str, &JsonValue, &JsonValue)> {
    let callee = node.get("callee")?;
    if callee.get("kind").and_then(|v| v.as_str()) != Some("member") {
        return None;
    }
    if callee.get("computed").and_then(|v| v.as_bool()).unwrap_or(false) {
        return None;
    }
    let prop = callee.get("property").and_then(|v| v.as_str())?;
    if prop != "map" && prop != "filter" {
        return None;
    }
    let arrow = node.get("args").and_then(|v| v.as_array())?.first()?;
    if arrow.get("kind").and_then(|v| v.as_str()) != Some("arrow") {
        return None;
    }
    let object = callee.get("object")?;
    Some((prop, object, arrow))
}

/// Evaluate a nested `.map(cb)` / `.filter(cb)` call recognized by
/// [`array_callback_call`]. `arrow`'s params: 1 (element) or 2 (element,
/// index -- bound as a `JsValue::Number`). The callback's env is a COPY of
/// the parent env (child scope) per invocation, never mutated in place
/// across sibling iterations. A non-array receiver yields `Null` for both
/// methods (matches Go, whose `toAnySlice(nil)` short-circuit fires before
/// the method dispatch). Mirrors Go's `evalArrayCallback`.
fn eval_array_callback(method: &str, object: &JsonValue, arrow: &JsonValue, env: &Env) -> JsValue {
    let arr: Vec<JsValue> = match evaluate(object, env) {
        JsValue::Array(a) => a,
        _ => return JsValue::Null,
    };
    let params: Vec<String> = arrow
        .get("params")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|p| p.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    let body = arrow.get("body").unwrap_or(&JsonValue::Null);
    let call_cb = |item: JsValue, index: usize| -> JsValue {
        let mut inner = env.clone();
        if let Some(p0) = params.first() {
            inner.insert(p0.clone(), item);
        }
        if let Some(p1) = params.get(1) {
            inner.insert(p1.clone(), JsValue::Number(index as f64));
        }
        evaluate(body, &inner)
    };
    if method == "map" {
        JsValue::Array(arr.into_iter().enumerate().map(|(i, item)| call_cb(item, i)).collect())
    } else {
        let mut out = Vec::new();
        for (i, item) in arr.into_iter().enumerate() {
            if truthy(&call_cb(item.clone(), i)) {
                out.push(item);
            }
        }
        JsValue::Array(out)
    }
}

/// `.join(sep)` (#2094): default separator `,` when `sep` is empty/absent
/// upstream (the caller passes the already-resolved separator string); a
/// `null`/`undefined` element joins as `''`, not the literal string
/// `"null"`. A non-array receiver joins as `''`. Mirrors Go's `evalJoin`.
fn eval_join(obj: &JsValue, sep: &str) -> JsValue {
    let arr = match obj.as_array() {
        Some(a) => a,
        None => return JsValue::String(String::new()),
    };
    let parts: Vec<String> = arr.iter().map(|el| if matches!(el, JsValue::Null) { String::new() } else { to_string(el) }).collect();
    JsValue::String(parts.join(sep))
}

pub fn eval_json(json_str: &str, env: &Env) -> Result<JsValue, serde_json::Error> {
    let node: JsonValue = serde_json::from_str(json_str)?;
    Ok(evaluate(&node, env))
}

// ---------------------------------------------------------------------------
// JS coercion primitives (ToNumber / ToString / ToBoolean).
// ---------------------------------------------------------------------------

pub fn to_number(v: &JsValue) -> f64 {
    match v {
        JsValue::Null => 0.0,
        JsValue::Bool(b) => if *b { 1.0 } else { 0.0 },
        JsValue::Number(n) => *n,
        JsValue::String(s) => {
            let t = s.trim();
            if t.is_empty() {
                0.0
            } else if num::looks_like_number(t) {
                num::parse_number_literal(t)
            } else {
                f64::NAN
            }
        }
        JsValue::Array(_) | JsValue::Object(_) => f64::NAN,
        // Unreachable in practice: this evaluator only ever sees `JsValue`s
        // decoded from a `serde_json::Value` ParsedExpr tree or produced by
        // its own arithmetic, and JSON can't spell a `Date` (see the `num`
        // module docstring) -- kept exhaustive rather than `unreachable!()`
        // since `JsValue` is a shared, cross-module enum. `valueOf`-style
        // (matches `runtime::js_number`'s `JsValue::Date` arm) for
        // consistency if that ever changes.
        JsValue::Date(ms) => *ms as f64,
    }
}

/// JS ToString. Diverges from `runtime::js_string` deliberately: `null`
/// (JS `null`/`undefined`, both collapsed to [`JsValue::Null`] in this
/// domain) stringifies as the literal `"null"` here, matching real JS
/// `String(null)` -- `bf.string()`'s "unset prop must not surface as
/// literal null in HTML" policy is a `runtime.rs`-only divergence, not part
/// of this JS-faithful evaluator.
///
/// Array/Object stringification is intentionally MORE JS-faithful than the
/// Python port's `str(v)` fallback (which prints a Python `repr`, e.g.
/// `"[1, 2]"` -- not exercised by the golden vectors, and not actually
/// JS-correct): this mirrors real JS `Array.prototype.toString`
/// (`.join(',')`, recursively coercing each element, `null`/`undefined`
/// elements becoming `''`) and `Object.prototype.toString`
/// (`"[object Object]"`).
pub fn to_string(v: &JsValue) -> String {
    match v {
        JsValue::Null => "null".to_string(),
        JsValue::Bool(b) => if *b { "true".to_string() } else { "false".to_string() },
        JsValue::Number(n) => num::format_js_number(*n),
        JsValue::String(s) => s.clone(),
        JsValue::Array(items) => items
            .iter()
            .map(|x| if matches!(x, JsValue::Null) { String::new() } else { to_string(x) })
            .collect::<Vec<_>>()
            .join(","),
        JsValue::Object(_) => "[object Object]".to_string(),
        // Unreachable in practice -- see `to_number`'s `JsValue::Date` arm
        // above. `toISOString` is the one Date->string shape this
        // catalogue defines (matches `runtime::js_string`).
        JsValue::Date(ms) => crate::date::format_iso8601(*ms),
    }
}

pub fn truthy(v: &JsValue) -> bool {
    match v {
        JsValue::Null => false,
        JsValue::Bool(b) => *b,
        JsValue::Number(n) => !n.is_nan() && *n != 0.0, // nonzero and not NaN
        JsValue::String(s) => !s.is_empty(),          // incl. the truthy "0"
        JsValue::Array(_) | JsValue::Object(_) => true,
        // Unreachable in practice -- see `to_number`'s `JsValue::Date` arm
        // above. A JS Date object is always truthy, like every other
        // object.
        JsValue::Date(_) => true,
    }
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

fn binary(op: &str, l: &JsValue, r: &JsValue) -> JsValue {
    match op {
        "+" => {
            // JS `+`: string concatenation once either operand is a string,
            // numeric addition otherwise.
            if num::is_string(l) || num::is_string(r) {
                JsValue::String(format!("{}{}", to_string(l), to_string(r)))
            } else {
                JsValue::Number(to_number(l) + to_number(r))
            }
        }
        "-" => JsValue::Number(to_number(l) - to_number(r)),
        "*" => JsValue::Number(to_number(l) * to_number(r)),
        // No zero-divisor special-casing: `f64` division already yields
        // +-Infinity / NaN per IEEE-754 -- see `num` module docstring.
        "/" => JsValue::Number(to_number(l) / to_number(r)),
        "%" => JsValue::Number(num::js_mod(to_number(l), to_number(r))),
        "<" | "<=" | ">" | ">=" => JsValue::Bool(relational(op, l, r)),
        "===" => JsValue::Bool(num::strict_eq(l, r)),
        "!==" => JsValue::Bool(!num::strict_eq(l, r)),
        // Loose equality / bitwise / shift are out of the subset.
        _ => JsValue::Null,
    }
}

fn relational(op: &str, l: &JsValue, r: &JsValue) -> bool {
    // JS Abstract Relational Comparison: both strings -> compare by code
    // unit (UTF-8 byte order agrees with UTF-16 code-unit order for all but
    // rare non-BMP edge cases -- same simplification the Python port's
    // native `str` comparison makes); otherwise coerce both to numbers (a
    // NaN operand makes it false).
    let c = if let (JsValue::String(ls), JsValue::String(rs)) = (l, r) {
        ls.cmp(rs)
    } else {
        let (ln, rn) = (to_number(l), to_number(r));
        if ln.is_nan() || rn.is_nan() {
            return false;
        }
        ln.partial_cmp(&rn).unwrap_or(std::cmp::Ordering::Equal)
    };
    match op {
        "<" => c.is_lt(),
        "<=" => c.is_le(),
        ">" => c.is_gt(),
        ">=" => c.is_ge(),
        _ => false,
    }
}

fn unary(op: &str, v: &JsValue) -> JsValue {
    match op {
        "!" => JsValue::Bool(!truthy(v)),
        "-" => JsValue::Number(-to_number(v)),
        "+" => JsValue::Number(to_number(v)),
        _ => JsValue::Null,
    }
}

// ---------------------------------------------------------------------------
// Built-in calls (the deterministic allowlist). Locale-sensitive builtins
// (localeCompare) are deliberately excluded to keep the backends isomorphic.
// ---------------------------------------------------------------------------

/// Resolve a `call` callee to its builtin name (e.g. "Math.max"), or ''
/// when the callee is not an allowlisted builtin reference.
fn builtin_name(callee: &JsonValue) -> String {
    let kind = callee.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    if kind == "identifier" {
        return callee.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    }
    if kind == "member" && !callee.get("computed").and_then(|v| v.as_bool()).unwrap_or(false) {
        let obj = callee.get("object");
        let obj_kind = obj.and_then(|o| o.get("kind")).and_then(|v| v.as_str()).unwrap_or("");
        if obj_kind != "identifier" {
            return String::new();
        }
        let obj_name = obj.and_then(|o| o.get("name")).and_then(|v| v.as_str()).unwrap_or("");
        let prop = callee.get("property").and_then(|v| v.as_str()).unwrap_or("");
        return format!("{obj_name}.{prop}");
    }
    String::new()
}

fn call_builtin(name: &str, args: &[JsValue]) -> JsValue {
    let arg = |i: usize| -> JsValue { args.get(i).cloned().unwrap_or(JsValue::Null) };
    match name {
        "Math.max" => {
            let mut m = f64::NEG_INFINITY; // JS Math.max() with no args is -Infinity
            for a in args {
                let n = to_number(a);
                if n.is_nan() {
                    return JsValue::Number(n);
                }
                if n > m {
                    m = n;
                }
            }
            JsValue::Number(m)
        }
        "Math.min" => {
            let mut m = f64::INFINITY; // JS Math.min() with no args is +Infinity
            for a in args {
                let n = to_number(a);
                if n.is_nan() {
                    return JsValue::Number(n);
                }
                if n < m {
                    m = n;
                }
            }
            JsValue::Number(m)
        }
        "Math.abs" => JsValue::Number(to_number(&arg(0)).abs()),
        "Math.floor" => JsValue::Number(num::js_floor(to_number(&arg(0)))),
        "Math.ceil" => JsValue::Number(num::js_ceil(to_number(&arg(0)))),
        "Math.round" => JsValue::Number(num::js_round(to_number(&arg(0)))),
        "String" => JsValue::String(to_string(&arg(0))),
        "Number" => JsValue::Number(to_number(&arg(0))),
        "Boolean" => JsValue::Bool(truthy(&arg(0))),
        // Any other callee is outside the subset (refused upstream).
        _ => JsValue::Null,
    }
}

// ---------------------------------------------------------------------------
// Member / index access
// ---------------------------------------------------------------------------

fn read_property(obj: &JsValue, key: &str) -> JsValue {
    match obj {
        JsValue::Null => JsValue::Null,
        JsValue::Object(map) => map.get(key).cloned().unwrap_or(JsValue::Null),
        JsValue::Array(a) => {
            if key == "length" {
                JsValue::Number(a.len() as f64)
            } else {
                JsValue::Null
            }
        }
        JsValue::String(s) => {
            // `.length` is a string property only -- a numeric scalar
            // (123) has no `.length` in the subset (JS `(123).length` is
            // undefined -> null); matches the Go/Perl evaluators (numbers
            // fall through to the catch-all below).
            if key == "length" {
                JsValue::Number(s.chars().count() as f64)
            } else {
                JsValue::Null
            }
        }
        _ => JsValue::Null,
    }
}

fn read_index(obj: &JsValue, index: &JsValue) -> JsValue {
    match obj {
        JsValue::Array(a) => {
            let f = to_number(index);
            if f.is_nan() || f.is_infinite() {
                return JsValue::Null;
            }
            let i = f as i64;
            if i as f64 != f || i < 0 || i as usize >= a.len() {
                return JsValue::Null;
            }
            a[i as usize].clone()
        }
        JsValue::Object(map) => map.get(&to_string(index)).cloned().unwrap_or(JsValue::Null),
        _ => JsValue::Null,
    }
}

// ---------------------------------------------------------------------------
// Evaluator-driven higher-order folds (the generalization of bf_reduce /
// bf_sort onto the evaluator).
// ---------------------------------------------------------------------------

/// Fold a list into a value via the evaluator. `body` is a pure ParsedExpr
/// node evaluated against `{acc_name: acc, item_name: item}` plus the
/// captured free vars in `base_env` per element; `init` seeds the
/// accumulator and `direction` is "left" (reduce) or "right" (reduceRight).
/// Mirrors Go's `FoldEval`.
pub fn fold(
    items: &JsValue,
    body: &JsonValue,
    acc_name: &str,
    item_name: &str,
    init: JsValue,
    direction: &str,
    base_env: &Env,
) -> JsValue {
    let mut arr: Vec<JsValue> = items.as_array().map(|a| a.to_vec()).unwrap_or_default();
    if direction == "right" {
        arr.reverse();
    }
    let mut env = base_env.clone();
    let mut acc = init;
    for item in arr {
        env.insert(acc_name.to_string(), acc);
        env.insert(item_name.to_string(), item);
        acc = evaluate(body, &env);
    }
    acc
}

/// Return a new list ordered by a ParsedExpr comparator `cmp` evaluated
/// against `{param_a: a, param_b: b}` plus the captured free vars in
/// `base_env`, to a number (negative / zero / positive, like a JS
/// comparator). Non-mutating. Stable: `Vec::sort_by` carries a formal
/// stability guarantee, matching Python's `sorted`. Mirrors Go's `SortEval`.
pub fn sort_by(items: &JsValue, cmp: &JsonValue, param_a: &str, param_b: &str, base_env: &Env) -> Vec<JsValue> {
    let mut arr: Vec<JsValue> = match items.as_array() {
        Some(a) => a.to_vec(),
        None => return Vec::new(),
    };
    let env = base_env.clone();
    arr.sort_by(|a, b| {
        let mut e = env.clone();
        e.insert(param_a.to_string(), a.clone());
        e.insert(param_b.to_string(), b.clone());
        let c = to_number(&evaluate(cmp, &e));
        // NaN comparator result -> keep order (matches JS + the Go/Perl
        // sign test, which treat a NaN comparator result as "no
        // reordering").
        if c.is_nan() {
            std::cmp::Ordering::Equal
        } else if c < 0.0 {
            std::cmp::Ordering::Less
        } else if c > 0.0 {
            std::cmp::Ordering::Greater
        } else {
            std::cmp::Ordering::Equal
        }
    });
    arr
}

pub fn fold_json(
    items: &JsValue,
    body_json: &str,
    acc_name: &str,
    item_name: &str,
    init: JsValue,
    direction: &str,
    base_env: &Env,
) -> Result<JsValue, serde_json::Error> {
    let body: JsonValue = serde_json::from_str(body_json)?;
    Ok(fold(items, &body, acc_name, item_name, init, direction, base_env))
}

pub fn sort_by_json(
    items: &JsValue,
    cmp_json: &str,
    param_a: &str,
    param_b: &str,
    base_env: &Env,
) -> Result<Vec<JsValue>, serde_json::Error> {
    let cmp: JsonValue = serde_json::from_str(cmp_json)?;
    Ok(sort_by(items, &cmp, param_a, param_b, base_env))
}

// ---------------------------------------------------------------------------
// Higher-order predicates (#2018, P2) -- the generalization of bf_filter /
// bf_find / bf_find_index / bf_every / bf_some onto the evaluator. Each
// mirrors the corresponding Go helper (FilterEval / EveryEval / SomeEval /
// FindEval / FindIndexEval).
// ---------------------------------------------------------------------------

pub fn filter(items: &JsValue, pred: &JsonValue, param: &str, base_env: &Env) -> Vec<JsValue> {
    let arr: Vec<JsValue> = match items.as_array() {
        Some(a) => a.to_vec(),
        None => return Vec::new(),
    };
    let mut env = base_env.clone();
    let mut out = Vec::new();
    for item in arr {
        env.insert(param.to_string(), item.clone());
        if truthy(&evaluate(pred, &env)) {
            out.push(item);
        }
    }
    out
}

pub fn every(items: &JsValue, pred: &JsonValue, param: &str, base_env: &Env) -> bool {
    let arr: Vec<JsValue> = items.as_array().map(|a| a.to_vec()).unwrap_or_default();
    let mut env = base_env.clone();
    for item in arr {
        env.insert(param.to_string(), item);
        if !truthy(&evaluate(pred, &env)) {
            return false;
        }
    }
    true
}

pub fn some(items: &JsValue, pred: &JsonValue, param: &str, base_env: &Env) -> bool {
    let arr: Vec<JsValue> = items.as_array().map(|a| a.to_vec()).unwrap_or_default();
    let mut env = base_env.clone();
    for item in arr {
        env.insert(param.to_string(), item);
        if truthy(&evaluate(pred, &env)) {
            return true;
        }
    }
    false
}

pub fn find(items: &JsValue, pred: &JsonValue, param: &str, forward: bool, base_env: &Env) -> JsValue {
    let mut arr: Vec<JsValue> = items.as_array().map(|a| a.to_vec()).unwrap_or_default();
    if !forward {
        arr.reverse();
    }
    let mut env = base_env.clone();
    for item in arr {
        env.insert(param.to_string(), item.clone());
        if truthy(&evaluate(pred, &env)) {
            return item;
        }
    }
    JsValue::Null
}

pub fn find_index(items: &JsValue, pred: &JsonValue, param: &str, forward: bool, base_env: &Env) -> i64 {
    let arr: Vec<JsValue> = items.as_array().map(|a| a.to_vec()).unwrap_or_default();
    let mut env = base_env.clone();
    let idxs: Vec<usize> = if forward { (0..arr.len()).collect() } else { (0..arr.len()).rev().collect() };
    for i in idxs {
        env.insert(param.to_string(), arr[i].clone());
        if truthy(&evaluate(pred, &env)) {
            return i as i64;
        }
    }
    -1
}

pub fn flat_map(items: &JsValue, proj: &JsonValue, param: &str, base_env: &Env) -> Vec<JsValue> {
    let arr: Vec<JsValue> = items.as_array().map(|a| a.to_vec()).unwrap_or_default();
    let mut env = base_env.clone();
    let mut out = Vec::new();
    for item in arr {
        env.insert(param.to_string(), item);
        let v = evaluate(proj, &env);
        match v {
            JsValue::Array(inner) => out.extend(inner),
            other => out.push(other),
        }
    }
    out
}

/// Value-producing `.map(cb)` (#2073): project each element through
/// `proj`, one result per element (no flatten).
pub fn map_items(items: &JsValue, proj: &JsonValue, param: &str, base_env: &Env) -> Vec<JsValue> {
    let arr: Vec<JsValue> = items.as_array().map(|a| a.to_vec()).unwrap_or_default();
    let mut env = base_env.clone();
    let mut out = Vec::new();
    for item in arr {
        env.insert(param.to_string(), item);
        out.push(evaluate(proj, &env));
    }
    out
}

// ---------------------------------------------------------------------------
// JSON-string seams -- the adapters emit `bf.filter_eval(recv, '<json>', ...)`;
// the predicate body arrives as a JSON string here, decoded then handed to
// the helper above (mirroring fold_json / sort_by_json).
// ---------------------------------------------------------------------------

pub fn filter_json(items: &JsValue, pred_json: &str, param: &str, base_env: &Env) -> Result<Vec<JsValue>, serde_json::Error> {
    let pred: JsonValue = serde_json::from_str(pred_json)?;
    Ok(filter(items, &pred, param, base_env))
}

pub fn every_json(items: &JsValue, pred_json: &str, param: &str, base_env: &Env) -> Result<bool, serde_json::Error> {
    let pred: JsonValue = serde_json::from_str(pred_json)?;
    Ok(every(items, &pred, param, base_env))
}

pub fn some_json(items: &JsValue, pred_json: &str, param: &str, base_env: &Env) -> Result<bool, serde_json::Error> {
    let pred: JsonValue = serde_json::from_str(pred_json)?;
    Ok(some(items, &pred, param, base_env))
}

pub fn find_json(
    items: &JsValue,
    pred_json: &str,
    param: &str,
    forward: bool,
    base_env: &Env,
) -> Result<JsValue, serde_json::Error> {
    let pred: JsonValue = serde_json::from_str(pred_json)?;
    Ok(find(items, &pred, param, forward, base_env))
}

pub fn find_index_json(
    items: &JsValue,
    pred_json: &str,
    param: &str,
    forward: bool,
    base_env: &Env,
) -> Result<i64, serde_json::Error> {
    let pred: JsonValue = serde_json::from_str(pred_json)?;
    Ok(find_index(items, &pred, param, forward, base_env))
}

pub fn flat_map_json(items: &JsValue, proj_json: &str, param: &str, base_env: &Env) -> Result<Vec<JsValue>, serde_json::Error> {
    let proj: JsonValue = serde_json::from_str(proj_json)?;
    Ok(flat_map(items, &proj, param, base_env))
}

pub fn map_json(items: &JsValue, proj_json: &str, param: &str, base_env: &Env) -> Result<Vec<JsValue>, serde_json::Error> {
    let proj: JsonValue = serde_json::from_str(proj_json)?;
    Ok(map_items(items, &proj, param, base_env))
}
