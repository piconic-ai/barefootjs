"""Python port of packages/adapter-perl/lib/BarefootJS/Evaluator.pm.

Lightweight evaluator for the pure ``ParsedExpr`` subset, scoped to
higher-order callback bodies (reduce / sort / map / filter / find
``(...) => expr``) -- issue #2018. Templates cannot carry a lambda in
expression position, which is why the adapters historically special-cased
these callbacks into fixed shapes (bf_sort's comparator catalogue,
bf_reduce's +/* fold). Instead, the callback BODY rides as a pure
``ParsedExpr`` subtree (the structured IR the compiler already produces) and
is evaluated here against an environment (``{acc, item, ...captured free
vars}``).

ONE shared implementation across all backends (mirrors the Perl module,
which is shared by the Mojo + Xslate Perl backends), living alongside
``search_params.py`` in the engine-agnostic core. The accepted subset and
its semantics are documented in ``spec/compiler.md`` ("ParsedExpr Evaluator
Semantics") and pinned isomorphically by the cross-language golden vectors
(``packages/adapter-tests/helper-vectors/eval-vectors.json``), shared with
the Go evaluator (bf.go) and the Perl evaluator -- same input -> same output.

The coercion below is JS-faithful (ToNumber / ToString / ToBoolean, strict
equality) and deliberately distinct from the divergent ``bf.string`` /
``bf.number`` helpers in ``runtime.py``, so the contract is unambiguous and
every template adapter stays byte-equal with each other and with Go.

Unlike the Perl port, this module does NOT need a separate SV-flag trick
(``B::svref_2object`` in Evaluator.pm) to tell the JS *string* "10" from the
JS *number* 10: Python's ``json.loads`` already decodes a JSON string to
``str`` and a JSON number to ``int``/``float``, so the type distinction is
native. ``bool`` is checked before the general numeric branch everywhere
below because Python's ``bool`` is a subclass of ``int``.

This module intentionally does NOT import ``runtime.py`` (and vice versa is
fine -- ``runtime.py`` imports this module for the ``*_eval`` helpers), to
mirror the Perl structure: ``Evaluator.pm`` is a standalone unit with no
dependency on ``BarefootJS.pm``.
"""

from __future__ import annotations

import functools
import json as _json
import math
import re
from typing import Any

# ---------------------------------------------------------------------------
# JS numeric-string grammar (mirrors Perl's Scalar::Util::looks_like_number).
# Exposed (not underscore-prefixed) so runtime.py's JS-`Number()`-diverging
# `number()` helper can reuse the exact same "does this string look like a
# number" classifier -- the two modules apply different coercion RULES
# (Evaluator is JS-faithful; runtime.number() deliberately returns NaN for
# undef/empty-string) but share the same underlying string grammar, just as
# both Perl modules share one imported `Scalar::Util::looks_like_number`.
# ---------------------------------------------------------------------------
_NUM_RE = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")
_INF_NAN_RE = re.compile(r"^[+-]?(inf(inity)?|nan)$", re.IGNORECASE)


def looks_like_number(s: str) -> bool:
    """Mirror Scalar::Util::looks_like_number for a (possibly padded) string."""
    t = s.strip()
    if t == "":
        return False
    return bool(_NUM_RE.match(t) or _INF_NAN_RE.match(t))


def parse_number_literal(s: str) -> float:
    """Parse a string already known to satisfy `looks_like_number` into a float."""
    t = s.strip()
    if _INF_NAN_RE.match(t):
        low = t.lower()
        if "nan" in low:
            return float("nan")
        return float("-inf") if low.startswith("-") else float("inf")
    return float(t)


# ---------------------------------------------------------------------------
# evaluate(node, env): evaluate a decoded ParsedExpr node (a dict keyed by
# `kind`) against the environment dict, returning a Python value (float, str,
# bool, None for null, list, dict). The matching JSON entry point is
# eval_json() below.
# ---------------------------------------------------------------------------


def evaluate(node: Any, env: dict) -> Any:
    if not isinstance(node, dict):
        return None
    kind = node.get("kind") or ""

    if kind == "literal":
        return node.get("value")
    if kind == "identifier":
        return env.get(node.get("name"))
    if kind == "binary":
        return _binary(
            node.get("op"),
            evaluate(node.get("left"), env),
            evaluate(node.get("right"), env),
        )
    if kind == "unary":
        return _unary(node.get("op"), evaluate(node.get("argument"), env))
    if kind == "logical":
        op = node.get("op")
        left = evaluate(node.get("left"), env)
        if op == "&&":
            return evaluate(node.get("right"), env) if _truthy(left) else left
        if op == "||":
            return left if _truthy(left) else evaluate(node.get("right"), env)
        # `??`
        return left if left is not None else evaluate(node.get("right"), env)
    if kind == "conditional":
        return (
            evaluate(node.get("consequent"), env)
            if _truthy(evaluate(node.get("test"), env))
            else evaluate(node.get("alternate"), env)
        )
    if kind == "member":
        return _read_property(evaluate(node.get("object"), env), node.get("property"))
    if kind == "index-access":
        return _read_index(
            evaluate(node.get("object"), env), evaluate(node.get("index"), env)
        )
    if kind == "call":
        name = _builtin_name(node.get("callee"))
        if not name:
            return None
        args = [evaluate(a, env) for a in node.get("args") or []]
        return _call_builtin(name, args)
    if kind == "template-literal":
        out = []
        for p in node.get("parts") or []:
            if (p.get("type") or "") == "string":
                out.append(p.get("value") or "")
            else:
                out.append(_to_string(evaluate(p.get("expr"), env)))
        return "".join(out)
    if kind == "array-literal":
        return [evaluate(e, env) for e in node.get("elements") or []]
    if kind == "object-literal":
        out: dict = {}
        for prop in node.get("properties") or []:
            out[prop.get("key")] = evaluate(prop.get("value"), env)
        return out
    if kind == "array-method" and (node.get("method") or "") == "includes":
        args = node.get("args") or []
        if len(args) == 1:
            # `.includes(x)` (#2075) -- the one `array-method` in the
            # evaluator subset, shared between `Array.prototype.includes`
            # (SameValueZero membership) and `String.prototype.includes`
            # (substring search), matching the receiver-type dispatch the SSR
            # template lowering does at runtime (`bf.includes`). Mirrors the
            # JS reference's `includes()` (eval-reference.ts) and the Perl
            # port's identical `array-method`/`includes` arm
            # (Evaluator.pm).
            obj = evaluate(node.get("object"), env)
            needle = evaluate(args[0], env)
            if isinstance(obj, list):
                return _bool(any(_same_value_zero(el, needle) for el in obj))
            if _is_string(obj):
                return _bool(_to_string(needle) in obj)
            # Any other receiver is not a JS `.includes` target -- degrade to
            # false rather than raising, mirroring the reference.
            return _bool(False)

    # arrow-fn / higher-order / unsupported array-method: a callback body
    # containing these is refused upstream (BF101); never reached here.
    return None


def eval_json(json_str: str, env: dict) -> Any:
    """Decode a ParsedExpr JSON string and evaluate it. Mirrors the Go EvalExpr
    entry point and Perl's eval_json."""
    return evaluate(_json.loads(json_str), env)


# ---------------------------------------------------------------------------
# JS value classification.
# ---------------------------------------------------------------------------


def _is_string(v: Any) -> bool:
    return isinstance(v, str)


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _nan() -> float:
    return float("nan")


# ---------------------------------------------------------------------------
# JS coercion primitives (ToNumber / ToString / ToBoolean).
# ---------------------------------------------------------------------------


def _to_number(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if _is_number(v):
        return float(v)
    if isinstance(v, str):
        t = v.strip()
        if t == "":
            return 0.0
        return parse_number_literal(t) if looks_like_number(t) else _nan()
    return _nan()  # list / dict


def _format_number(n: float) -> str:
    # Shortest round-trip repr with JS's integral-float spelling (`1.0` ->
    # `"1"`). Python's `repr(float)` has been shortest-round-trip since 3.1,
    # matching JS engines' digit sequences for the common range; very
    # large/small magnitudes can diverge in exponent-notation formatting --
    # the same documented divergence region the Go runtime's evalToString
    # carries (see bf.go / eval.go), not re-solved here either.
    if n == 0:
        return "0"
    if n == int(n) and abs(n) < 1e21:
        return str(int(n))
    return repr(n)


def _to_string(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if _is_number(v):
        n = float(v)
        if n != n:
            return "NaN"
        if n == float("inf"):
            return "Infinity"
        if n == float("-inf"):
            return "-Infinity"
        return _format_number(n)
    return str(v)


def _truthy(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        n = float(v)
        return n == n and n != 0  # nonzero and not NaN
    if isinstance(v, str):
        return v != ""  # incl. the truthy "0"
    return True  # arrays / objects are always truthy in JS


def _bool(t: Any) -> bool:
    return bool(t)


# ---------------------------------------------------------------------------
# Operators
# ---------------------------------------------------------------------------


def _binary(op: str, l: Any, r: Any) -> Any:
    if op == "+":
        # JS `+`: string concatenation once either operand is a string,
        # numeric addition otherwise.
        if _is_string(l) or _is_string(r):
            return _to_string(l) + _to_string(r)
        return _to_number(l) + _to_number(r)
    if op == "-":
        return _to_number(l) - _to_number(r)
    if op == "*":
        return _to_number(l) * _to_number(r)
    if op == "/":
        ln, rn = _to_number(l), _to_number(r)
        if rn == 0:
            if ln == 0 or ln != ln:
                return _nan()
            return float("inf") if ln > 0 else float("-inf")
        return ln / rn
    if op == "%":
        rn = _to_number(r)
        if rn == 0:
            return _nan()
        return math.fmod(_to_number(l), rn)
    if op in ("<", "<=", ">", ">="):
        return _relational(op, l, r)
    if op == "===":
        return _bool(_strict_eq(l, r))
    if op == "!==":
        return _bool(not _strict_eq(l, r))
    # Loose equality / bitwise / shift are out of the subset.
    return None


def _relational(op: str, l: Any, r: Any) -> bool:
    # JS Abstract Relational Comparison: both strings -> compare by code
    # unit; otherwise coerce both to numbers (a NaN operand makes it false).
    if _is_string(l) and _is_string(r):
        c = -1 if l < r else (1 if l > r else 0)
    else:
        ln, rn = _to_number(l), _to_number(r)
        if ln != ln or rn != rn:  # NaN -> false
            return _bool(False)
        c = -1 if ln < rn else (1 if ln > rn else 0)
    if op == "<":
        return _bool(c < 0)
    if op == "<=":
        return _bool(c <= 0)
    if op == ">":
        return _bool(c > 0)
    if op == ">=":
        return _bool(c >= 0)
    return _bool(False)


def _strict_eq(l: Any, r: Any) -> bool:
    # Strict `===`: equal JS type and value, no coercion.
    ln, rn = _is_number(l), _is_number(r)
    if ln and rn:
        lf, rf = float(l), float(r)
        if lf != lf or rf != rf:  # NaN
            return False
        return lf == rf
    if ln != rn:  # one numeric, one not
        return False
    if l is None:
        return r is None
    if r is None:
        return False
    lb, rb = isinstance(l, bool), isinstance(r, bool)
    if lb or rb:
        if not (lb and rb):
            return False
        return bool(l) == bool(r)
    if _is_string(l) and _is_string(r):
        return l == r
    return False


def _same_value_zero(l: Any, r: Any) -> bool:
    """`Array.prototype.includes` membership test -- `===` except `NaN`
    equals itself (and +0/-0 are not distinguished, which the JSON-decoded
    values here can't represent anyway). Reuses `_strict_eq`'s type/value
    rules and only special-cases the two-NaN case that `_strict_eq`
    (deliberately, for `===`) reports as unequal."""
    if _is_number(l) and _is_number(r):
        lf, rf = float(l), float(r)
        if lf != lf and rf != rf:  # NaN sameValueZero NaN
            return True
    return _strict_eq(l, r)


def _unary(op: str, v: Any) -> Any:
    if op == "!":
        return _bool(not _truthy(v))
    if op == "-":
        return -_to_number(v)
    if op == "+":
        return _to_number(v)
    return None


# ---------------------------------------------------------------------------
# Built-in calls (the deterministic allowlist). Locale-sensitive builtins
# (localeCompare) are deliberately excluded to keep the backends isomorphic.
# ---------------------------------------------------------------------------


def _builtin_name(callee: Any) -> str:
    """Resolve a `call` callee to its builtin name (e.g. "Math.max"), or ''
    when the callee is not an allowlisted builtin reference."""
    if not isinstance(callee, dict):
        return ""
    kind = callee.get("kind") or ""
    if kind == "identifier":
        return callee.get("name") or ""
    if kind == "member" and not callee.get("computed"):
        obj = callee.get("object")
        if not isinstance(obj, dict) or (obj.get("kind") or "") != "identifier":
            return ""
        return f"{obj.get('name') or ''}.{callee.get('property') or ''}"
    return ""


def _safe_floor(n: float) -> float:
    if n != n or n in (float("inf"), float("-inf")):
        return n
    return float(math.floor(n))


def _safe_ceil(n: float) -> float:
    if n != n or n in (float("inf"), float("-inf")):
        return n
    return float(math.ceil(n))


def _math_round(n: float) -> float:
    # Half rounds toward +Infinity (JS Math.round: 2.5 -> 3, -2.5 -> -2),
    # matching runtime.py's `round` helper rather than half-away-from-zero.
    if n != n or n in (float("inf"), float("-inf")):
        return n
    return float(math.floor(n + 0.5))


def _call_builtin(name: str, args: list) -> Any:
    def arg(i: int) -> Any:
        return args[i] if i < len(args) else None

    if name == "Math.max":
        m = float("-inf")  # JS Math.max() with no args is -Infinity
        for a in args:
            n = _to_number(a)
            if n != n:  # any NaN argument -> NaN (JS / Go / Perl)
                return n
            if n > m:
                m = n
        return m
    if name == "Math.min":
        m = float("inf")  # JS Math.min() with no args is +Infinity
        for a in args:
            n = _to_number(a)
            if n != n:
                return n
            if n < m:
                m = n
        return m
    if name == "Math.abs":
        return abs(_to_number(arg(0)))
    if name == "Math.floor":
        return _safe_floor(_to_number(arg(0)))
    if name == "Math.ceil":
        return _safe_ceil(_to_number(arg(0)))
    if name == "Math.round":
        return _math_round(_to_number(arg(0)))
    if name == "String":
        return _to_string(arg(0))
    if name == "Number":
        return _to_number(arg(0))
    if name == "Boolean":
        return _bool(_truthy(arg(0)))
    # Any other callee is outside the subset (refused upstream).
    return None


# ---------------------------------------------------------------------------
# Member / index access
# ---------------------------------------------------------------------------


def _read_property(obj: Any, key: Any) -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    if isinstance(obj, list):
        return len(obj) if key == "length" else None
    if isinstance(obj, str) and key == "length":
        # `.length` is a string property only -- a numeric scalar (123) has
        # no `.length` in the subset (JS `(123).length` is undefined ->
        # null); matches the Go/Perl evaluators (numbers fall through here).
        return len(obj)
    return None


def _read_index(obj: Any, index: Any) -> Any:
    if isinstance(obj, list):
        f = _to_number(index)
        if f != f or f in (float("inf"), float("-inf")):
            return None
        i = int(f)
        if i != f or i < 0 or i >= len(obj):
            return None
        return obj[i]
    if isinstance(obj, dict):
        return obj.get(_to_string(index))
    return None


# ---------------------------------------------------------------------------
# Evaluator-driven higher-order folds (the generalization of bf_reduce /
# bf_sort onto the evaluator).
# ---------------------------------------------------------------------------


def fold(
    items: Any,
    body: Any,
    acc_name: str,
    item_name: str,
    init: Any,
    direction: str = "left",
    base_env: dict | None = None,
) -> Any:
    """Fold a list into a value via the evaluator. `body` is a pure ParsedExpr
    node evaluated against `{acc_name: acc, item_name: item}` plus the
    captured free vars in `base_env` per element; `init` seeds the
    accumulator and `direction` is "left" (reduce) or "right" (reduceRight).
    Generalizes bf_reduce -- any reducer body, not just the +/* arithmetic
    catalogue, and acc may appear anywhere. Mirrors Go's FoldEval."""
    arr = list(items) if isinstance(items, list) else []
    if direction == "right":
        arr = list(reversed(arr))
    env = dict(base_env) if base_env else {}
    acc = init
    for item in arr:
        env[acc_name] = acc
        env[item_name] = item
        acc = evaluate(body, env)
    return acc


def sort_by(
    items: Any,
    cmp: Any,
    param_a: str,
    param_b: str,
    base_env: dict | None = None,
) -> list:
    """Return a new list ordered by a ParsedExpr comparator `cmp` evaluated
    against `{param_a: a, param_b: b}` plus the captured free vars in
    `base_env`, to a number (negative / zero / positive, like a JS
    comparator). Generalizes bf_sort -- any comparator body. Non-mutating.
    Stable: Python's `sorted` carries a formal stability guarantee, so
    (unlike the Perl port) no explicit original-index tie-break decoration
    is needed. Mirrors Go's SortEval."""
    if not isinstance(items, list):
        return []
    env = dict(base_env) if base_env else {}

    def cmp_fn(a: Any, b: Any) -> int:
        env[param_a] = a
        env[param_b] = b
        c = _to_number(evaluate(cmp, env))
        # NaN comparator result -> keep order (matches JS + the Go/Perl sign
        # test, which treat a NaN comparator result as "no reordering").
        if c != c:
            return 0
        return -1 if c < 0 else (1 if c > 0 else 0)

    return sorted(items, key=functools.cmp_to_key(cmp_fn))


def fold_json(
    items: Any,
    body_json: str,
    acc_name: str,
    item_name: str,
    init: Any,
    direction: str = "left",
    base_env: dict | None = None,
) -> Any:
    return fold(items, _json.loads(body_json), acc_name, item_name, init, direction, base_env)


def sort_by_json(
    items: Any,
    cmp_json: str,
    param_a: str,
    param_b: str,
    base_env: dict | None = None,
) -> list:
    return sort_by(items, _json.loads(cmp_json), param_a, param_b, base_env)


# ---------------------------------------------------------------------------
# Higher-order predicates (#2018, P2) -- the generalization of bf_filter /
# bf_find / bf_find_index / bf_every / bf_some onto the evaluator. Each
# mirrors the corresponding Go helper (FilterEval / EveryEval / SomeEval /
# FindEval / FindIndexEval).
# ---------------------------------------------------------------------------


def filter(items: Any, pred: Any, param: str, base_env: dict | None = None) -> list:
    if not isinstance(items, list):
        return []
    env = dict(base_env) if base_env else {}
    out = []
    for item in items:
        env[param] = item
        if _truthy(evaluate(pred, env)):
            out.append(item)
    return out


def every(items: Any, pred: Any, param: str, base_env: dict | None = None) -> bool:
    arr = items if isinstance(items, list) else []
    env = dict(base_env) if base_env else {}
    for item in arr:
        env[param] = item
        if not _truthy(evaluate(pred, env)):
            return False
    return True


def some(items: Any, pred: Any, param: str, base_env: dict | None = None) -> bool:
    arr = items if isinstance(items, list) else []
    env = dict(base_env) if base_env else {}
    for item in arr:
        env[param] = item
        if _truthy(evaluate(pred, env)):
            return True
    return False


def find(
    items: Any, pred: Any, param: str, forward: bool = True, base_env: dict | None = None
) -> Any:
    arr = items if isinstance(items, list) else []
    if not forward:
        arr = list(reversed(arr))
    env = dict(base_env) if base_env else {}
    for item in arr:
        env[param] = item
        if _truthy(evaluate(pred, env)):
            return item
    return None


def find_index(
    items: Any, pred: Any, param: str, forward: bool = True, base_env: dict | None = None
) -> int:
    arr = items if isinstance(items, list) else []
    env = dict(base_env) if base_env else {}
    idxs = range(len(arr)) if forward else range(len(arr) - 1, -1, -1)
    for i in idxs:
        env[param] = arr[i]
        if _truthy(evaluate(pred, env)):
            return i
    return -1


def flat_map(items: Any, proj: Any, param: str, base_env: dict | None = None) -> list:
    arr = items if isinstance(items, list) else []
    env = dict(base_env) if base_env else {}
    out = []
    for item in arr:
        env[param] = item
        v = evaluate(proj, env)
        if isinstance(v, list):
            out.extend(v)
        else:
            out.append(v)
    return out


def map_items(items: Any, proj: Any, param: str, base_env: dict | None = None) -> list:
    """Value-producing `.map(cb)` (#2073): project each element through
    `proj`, one result per element (no flatten). Named `map_items` (not
    `map`) so the Python builtin stays unshadowed -- mirrors the Perl port's
    `map_items` naming (Perl's rename was to keep its own `map` builtin
    unshadowed; Python has the identical concern for the `map` builtin)."""
    arr = items if isinstance(items, list) else []
    env = dict(base_env) if base_env else {}
    out = []
    for item in arr:
        env[param] = item
        out.append(evaluate(proj, env))
    return out


# ---------------------------------------------------------------------------
# JSON-string seams -- the adapters emit `bf.filter_eval(recv, '<json>', ...)`;
# the predicate body arrives as a JSON string here, decoded then handed to
# the helper above (mirroring fold_json / sort_by_json).
# ---------------------------------------------------------------------------


def filter_json(items: Any, pred_json: str, param: str, base_env: dict | None = None) -> list:
    return filter(items, _json.loads(pred_json), param, base_env)


def every_json(items: Any, pred_json: str, param: str, base_env: dict | None = None) -> bool:
    return every(items, _json.loads(pred_json), param, base_env)


def some_json(items: Any, pred_json: str, param: str, base_env: dict | None = None) -> bool:
    return some(items, _json.loads(pred_json), param, base_env)


def find_json(
    items: Any, pred_json: str, param: str, forward: bool = True, base_env: dict | None = None
) -> Any:
    return find(items, _json.loads(pred_json), param, forward, base_env)


def find_index_json(
    items: Any, pred_json: str, param: str, forward: bool = True, base_env: dict | None = None
) -> int:
    return find_index(items, _json.loads(pred_json), param, forward, base_env)


def flat_map_json(items: Any, proj_json: str, param: str, base_env: dict | None = None) -> list:
    return flat_map(items, _json.loads(proj_json), param, base_env)


def map_json(items: Any, proj_json: str, param: str, base_env: dict | None = None) -> list:
    return map_items(items, _json.loads(proj_json), param, base_env)
