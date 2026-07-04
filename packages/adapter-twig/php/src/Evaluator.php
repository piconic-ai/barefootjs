<?php

declare(strict_types=1);

namespace Barefoot;

/**
 * Port of packages/adapter-perl/lib/BarefootJS/Evaluator.pm (see also the
 * Python port packages/adapter-jinja/python/barefootjs/evaluator.py).
 *
 * Lightweight evaluator for the pure `ParsedExpr` subset, scoped to
 * higher-order callback bodies (reduce / sort / map / filter / find
 * `(...) => expr`) -- issue #2018. Templates cannot carry a lambda in
 * expression position, so the callback BODY rides as a pure `ParsedExpr`
 * subtree (the structured IR the compiler already produces) and is
 * evaluated here against an environment (`[acc, item, ...captured free
 * vars]`).
 *
 * ONE shared implementation for the Twig backend (mirroring the two Perl
 * backends sharing Evaluator.pm, and the Jinja Python port's evaluator.py).
 * The accepted subset and its semantics are documented in
 * spec/compiler.md ("ParsedExpr Evaluator Semantics") and pinned
 * isomorphically by the cross-language golden vectors
 * (packages/adapter-tests/vectors/eval-vectors.json), shared with the
 * Go, Perl and Python evaluators -- same input -> same output.
 *
 * Node access: unlike Perl/Python (whose JSON decoders always produce a
 * hashref/dict for a JSON object), PHP's canonical `json_decode($s)` (no
 * `assoc`) decodes a JSON object into `stdClass` so that `{}` and `[]`
 * round-trip distinctly (see the design doc's "canonical value convention").
 * `evaluate()` therefore accepts a ParsedExpr node as EITHER a decoded
 * `stdClass`/array value OR a hand-built PHP associative array (the
 * ergonomic shape `php/tests/test_evaluator.php` hand-builds, mirroring how
 * the Perl/Python ports hand-build hashref/dict trees) -- `get()` below is
 * the single point that tolerates both shapes for structural node access.
 * JSON *arrays* (`args`, `elements`, `parts`, `properties`, ...) always
 * decode as plain PHP lists regardless of the `assoc` flag, so no such
 * dual-shape handling is needed for those.
 */
final class Evaluator
{
    private function __construct()
    {
    }

    private const NUM_RE = '/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/';
    private const INF_NAN_RE = '/^[+-]?(inf(inity)?|nan)$/i';

    /** Mirrors Scalar::Util::looks_like_number / the Python `looks_like_number`. */
    public static function looksLikeNumber(string $s): bool
    {
        $t = trim($s);
        if ($t === '') {
            return false;
        }
        return (bool) preg_match(self::NUM_RE, $t) || (bool) preg_match(self::INF_NAN_RE, $t);
    }

    /** Parse a string already known to satisfy looksLikeNumber() into a float. */
    public static function parseNumberLiteral(string $s): float
    {
        $t = trim($s);
        if (preg_match(self::INF_NAN_RE, $t)) {
            $low = strtolower($t);
            if (str_contains($low, 'nan')) {
                return NAN;
            }
            return str_starts_with($low, '-') ? -INF : INF;
        }
        return (float) $t;
    }

    /**
     * Shared JS `Number.prototype.toString` formatting for a FINITE, non-NaN
     * float (callers handle NaN/Infinity first). Needed because PHP's plain
     * `(string)` cast on a float is lossy -- bounded by the `precision` ini
     * setting (default 14 significant digits) -- unlike Perl, whose native
     * stringification is already shortest-round-trip. `serialize_precision`
     * (default -1 since PHP 7.1, shortest round-trip, matching V8) is what
     * `var_export()`/`json_encode()` honour but plain `(string)` casts do
     * not, hence the explicit routine (mirrors runtime.py's
     * `_format_js_number` / this module's own `_format_number` in the
     * Python port -- two independent copies there too, not shared, since
     * runtime.py and evaluator.py are standalone modules; here it is
     * shared between BarefootJS::string() and self::toStringJs() since nothing
     * requires them to be independent implementations in PHP).
     */
    public static function formatNumber(float $n): string
    {
        if ($n === 0.0) {
            return '0'; // normalises -0.0 to JS's "0" spelling
        }
        if ($n == floor($n) && abs($n) < 1e21) {
            return sprintf('%.0f', $n);
        }
        // Shortest round-trip decimal representation (serialize_precision=-1).
        return var_export($n, true);
    }

    private static function get($node, string $key)
    {
        if (is_array($node)) {
            return $node[$key] ?? null;
        }
        if (is_object($node)) {
            return $node->$key ?? null;
        }
        return null;
    }

    private static function kind($node): string
    {
        if (is_array($node)) {
            return (string) ($node['kind'] ?? '');
        }
        if (is_object($node)) {
            return (string) ($node->kind ?? '');
        }
        return '';
    }

    /** True for a JSON *array* value under the canonical value convention:
     * a plain PHP list (empty arrays count as lists -- see the design doc). */
    public static function isJsArray($v): bool
    {
        return is_array($v) && array_is_list($v);
    }

    /**
     * Evaluate a decoded ParsedExpr node against the environment array,
     * returning a PHP value (float, string, bool, null for JS null/undefined,
     * list array, stdClass). The matching JSON entry point is evalJson().
     */
    public static function evaluate($node, array $env)
    {
        if (!is_array($node) && !is_object($node)) {
            return null;
        }
        $kind = self::kind($node);

        if ($kind === 'literal') {
            return self::get($node, 'value');
        }
        if ($kind === 'identifier') {
            $name = self::get($node, 'name');
            return $env[$name] ?? null;
        }
        if ($kind === 'binary') {
            return self::binary(
                (string) self::get($node, 'op'),
                self::evaluate(self::get($node, 'left'), $env),
                self::evaluate(self::get($node, 'right'), $env)
            );
        }
        if ($kind === 'unary') {
            return self::unary((string) self::get($node, 'op'), self::evaluate(self::get($node, 'argument'), $env));
        }
        if ($kind === 'logical') {
            $op = self::get($node, 'op');
            $left = self::evaluate(self::get($node, 'left'), $env);
            if ($op === '&&') {
                return self::truthy($left) ? self::evaluate(self::get($node, 'right'), $env) : $left;
            }
            if ($op === '||') {
                return self::truthy($left) ? $left : self::evaluate(self::get($node, 'right'), $env);
            }
            // `??`
            return $left !== null ? $left : self::evaluate(self::get($node, 'right'), $env);
        }
        if ($kind === 'conditional') {
            return self::truthy(self::evaluate(self::get($node, 'test'), $env))
                ? self::evaluate(self::get($node, 'consequent'), $env)
                : self::evaluate(self::get($node, 'alternate'), $env);
        }
        if ($kind === 'member') {
            return self::readProperty(
                self::evaluate(self::get($node, 'object'), $env),
                self::get($node, 'property')
            );
        }
        if ($kind === 'index-access') {
            return self::readIndex(
                self::evaluate(self::get($node, 'object'), $env),
                self::evaluate(self::get($node, 'index'), $env)
            );
        }
        if ($kind === 'call') {
            $callback = self::arrayCallbackCall($node);
            if ($callback !== null) {
                [$method, $objectNode, $arrowNode] = $callback;
                return self::evalArrayCallback($method, $objectNode, $arrowNode, $env);
            }
            $name = self::builtinName(self::get($node, 'callee'));
            if ($name === '') {
                return null;
            }
            $argsNode = self::get($node, 'args');
            $args = [];
            foreach ((is_array($argsNode) ? $argsNode : []) as $a) {
                $args[] = self::evaluate($a, $env);
            }
            return self::callBuiltin($name, $args);
        }
        if ($kind === 'template-literal') {
            $out = '';
            $partsNode = self::get($node, 'parts');
            foreach ((is_array($partsNode) ? $partsNode : []) as $p) {
                $type = self::get($p, 'type') ?? '';
                if ($type === 'string') {
                    $out .= self::get($p, 'value') ?? '';
                } else {
                    $out .= self::toStringJs(self::evaluate(self::get($p, 'expr'), $env));
                }
            }
            return $out;
        }
        if ($kind === 'array-literal') {
            $out = [];
            $elementsNode = self::get($node, 'elements');
            foreach ((is_array($elementsNode) ? $elementsNode : []) as $e) {
                $out[] = self::evaluate($e, $env);
            }
            return $out;
        }
        if ($kind === 'object-literal') {
            $out = new \stdClass();
            $propsNode = self::get($node, 'properties');
            foreach ((is_array($propsNode) ? $propsNode : []) as $prop) {
                $key = (string) self::get($prop, 'key');
                $out->$key = self::evaluate(self::get($prop, 'value'), $env);
            }
            return $out;
        }
        if ($kind === 'array-method') {
            $method = (string) (self::get($node, 'method') ?? '');
            $argsNode = self::get($node, 'args');
            $argsArr = is_array($argsNode) ? $argsNode : [];
            if ($method === 'includes' && count($argsArr) === 1) {
                // `.includes(x)` (#2075) -- the one `array-method` in the
                // evaluator subset, shared between `Array.prototype.includes`
                // (SameValueZero membership) and `String.prototype.includes`
                // (substring search).
                $obj = self::evaluate(self::get($node, 'object'), $env);
                $needle = self::evaluate($argsArr[0], $env);
                if (self::isJsArray($obj)) {
                    foreach ($obj as $el) {
                        if (self::sameValueZero($el, $needle)) {
                            return true;
                        }
                    }
                    return false;
                }
                if (is_string($obj)) {
                    return str_contains($obj, self::toStringJs($needle));
                }
                // Any other receiver is not a JS `.includes` target -- degrade
                // to false rather than raising, mirroring the reference.
                return false;
            }
            if ($method === 'join' && count($argsArr) <= 1) {
                // `.join(sep?)` (#2094) -- default separator is `,`; a
                // `null`/`undefined` element joins as `''`, not the string
                // "null" (mirrors evalJoin in the Go reference).
                $sep = count($argsArr) === 1
                    ? self::toStringJs(self::evaluate($argsArr[0], $env))
                    : ',';
                $obj = self::evaluate(self::get($node, 'object'), $env);
                return self::evalJoin($obj, $sep);
            }
        }

        // arrow-fn / higher-order / unsupported array-method: a callback
        // body containing these is refused upstream (BF101); never reached.
        return null;
    }

    /**
     * Recognize a nested `.map(cb)` / `.filter(cb)` callback call inside a
     * `call` node (#2094): `callee` is a non-computed `member` node whose
     * `property` is `map`/`filter`, and the first argument is an `arrow`
     * node. Returns `[method, objectNode, arrowNode]` or `null` when the
     * shape doesn't match (mirrors Go's `evalArrayCallbackCall`). Everything
     * else nested (`.some`/`.find`/`.every`/`.sort`/`.reduce`/`.flat`/
     * `.flatMap`, standalone arrows) stays refused upstream (BF101) -- this
     * function only widens the two cases the compiler now allows to nest.
     */
    private static function arrayCallbackCall($node): ?array
    {
        $callee = self::get($node, 'callee');
        if ((!is_array($callee) && !is_object($callee)) || self::kind($callee) !== 'member') {
            return null;
        }
        if (self::get($callee, 'computed')) {
            return null;
        }
        $prop = (string) (self::get($callee, 'property') ?? '');
        if ($prop !== 'map' && $prop !== 'filter') {
            return null;
        }
        $argsNode = self::get($node, 'args');
        $argsArr = is_array($argsNode) ? $argsNode : [];
        if (count($argsArr) === 0) {
            return null;
        }
        $arrowNode = $argsArr[0];
        if ((!is_array($arrowNode) && !is_object($arrowNode)) || self::kind($arrowNode) !== 'arrow') {
            return null;
        }
        return [$prop, self::get($callee, 'object'), $arrowNode];
    }

    /**
     * Evaluate a nested `.map`/`.filter` callback call: evaluate the
     * receiver, then invoke the arrow body once per element against a FRESH
     * CHILD ENV (a copy of the parent env with the param(s) bound) --
     * `$env` is passed by value here, and PHP arrays are copy-on-write, so
     * mutating `$inner` never leaks back into the caller's `$env`. The
     * arrow's 1st param binds the element, the 2nd (if present) binds the
     * integer index -- mirrors Go's `evalArrayCallback`.
     */
    private static function evalArrayCallback(string $method, $objectNode, $arrowNode, array $env)
    {
        $arr = self::evaluate($objectNode, $env);
        if (!self::isJsArray($arr)) {
            return null;
        }
        $paramsNode = self::get($arrowNode, 'params');
        $params = [];
        foreach ((is_array($paramsNode) ? $paramsNode : []) as $p) {
            $params[] = (string) $p;
        }
        $body = self::get($arrowNode, 'body');
        $callCb = function ($item, int $index) use ($body, $params, $env) {
            $inner = $env; // copy: fresh child scope per invocation
            if (count($params) > 0) {
                $inner[$params[0]] = $item;
            }
            if (count($params) > 1) {
                $inner[$params[1]] = $index;
            }
            return self::evaluate($body, $inner);
        };
        if ($method === 'map') {
            $out = [];
            $i = 0;
            foreach ($arr as $item) {
                $out[] = $callCb($item, $i);
                ++$i;
            }
            return $out;
        }
        $out = [];
        $i = 0;
        foreach ($arr as $item) {
            if (self::truthy($callCb($item, $i))) {
                $out[] = $item;
            }
            ++$i;
        }
        return $out;
    }

    /** `Array.prototype.join(sep?)` -- default separator `,`; a `null`
     * element joins as `''`, not the string "null" (#2094). */
    private static function evalJoin($obj, string $sep): string
    {
        if (!self::isJsArray($obj)) {
            return '';
        }
        $parts = [];
        foreach ($obj as $el) {
            $parts[] = $el === null ? '' : self::toStringJs($el);
        }
        return implode($sep, $parts);
    }

    /** Decode a ParsedExpr JSON string and evaluate it. Mirrors the Go
     * EvalExpr entry point and Perl/Python's eval_json. */
    public static function evalJson(string $json, array $env)
    {
        return self::evaluate(json_decode($json), $env);
    }

    // -----------------------------------------------------------------
    // JS coercion primitives (ToNumber / ToString / ToBoolean).
    // -----------------------------------------------------------------

    private static function toNumber($v): float
    {
        if ($v === null) {
            return 0.0;
        }
        if (is_bool($v)) {
            return $v ? 1.0 : 0.0;
        }
        if (is_int($v) || is_float($v)) {
            return (float) $v;
        }
        if (is_string($v)) {
            $t = trim($v);
            if ($t === '') {
                return 0.0;
            }
            return self::looksLikeNumber($t) ? self::parseNumberLiteral($t) : NAN;
        }
        return NAN; // array / object
    }

    private static function toStringJs($v): string
    {
        if ($v === null) {
            return 'null';
        }
        if (is_bool($v)) {
            return $v ? 'true' : 'false';
        }
        if (is_int($v) || is_float($v)) {
            $n = (float) $v;
            if (is_nan($n)) {
                return 'NaN';
            }
            if ($n === INF) {
                return 'Infinity';
            }
            if ($n === -INF) {
                return '-Infinity';
            }
            return self::formatNumber($n);
        }
        if (is_string($v)) {
            return $v;
        }
        return ''; // arrays/objects -- not exercised by the evaluator subset's tested paths
    }

    /** Public JS truthiness -- shared by BarefootJS::truthy() so both the
     * evaluator and the runtime helper agree on one implementation. */
    public static function truthy($v): bool
    {
        if ($v === null || $v === false) {
            return false;
        }
        if ($v === true) {
            return true;
        }
        if (is_int($v) || is_float($v)) {
            $n = (float) $v;
            return $n === $n && $n != 0.0; // not NaN, and nonzero
        }
        if (is_string($v)) {
            return $v !== ''; // incl. the JS-truthy "0"
        }
        return true; // arrays / objects are always truthy in JS
    }

    // -----------------------------------------------------------------
    // Operators
    // -----------------------------------------------------------------

    private static function binary(string $op, $l, $r)
    {
        if ($op === '+') {
            // JS `+`: string concatenation once either operand is a string,
            // numeric addition otherwise.
            if (is_string($l) || is_string($r)) {
                return self::toStringJs($l) . self::toStringJs($r);
            }
            return self::toNumber($l) + self::toNumber($r);
        }
        if ($op === '-') {
            return self::toNumber($l) - self::toNumber($r);
        }
        if ($op === '*') {
            return self::toNumber($l) * self::toNumber($r);
        }
        if ($op === '/') {
            $ln = self::toNumber($l);
            $rn = self::toNumber($r);
            if ($rn === 0.0) {
                if ($ln === 0.0 || is_nan($ln)) {
                    return NAN;
                }
                return $ln > 0 ? INF : -INF;
            }
            return $ln / $rn;
        }
        if ($op === '%') {
            $rn = self::toNumber($r);
            if ($rn === 0.0) {
                return NAN;
            }
            return fmod(self::toNumber($l), $rn);
        }
        if ($op === '<' || $op === '<=' || $op === '>' || $op === '>=') {
            return self::relational($op, $l, $r);
        }
        if ($op === '===') {
            return self::strictEq($l, $r);
        }
        if ($op === '!==') {
            return !self::strictEq($l, $r);
        }
        // Loose equality / bitwise / shift are out of the subset.
        return null;
    }

    private static function relational(string $op, $l, $r): bool
    {
        // JS Abstract Relational Comparison: both strings -> compare by code
        // unit; otherwise coerce both to numbers (a NaN operand -> false).
        // MUST use strcmp(), not PHP's `<=>`/`<` operators: PHP applies
        // "smart" numeric-string comparison when both operands look
        // numeric ("10" <=> "9" compares 10 > 9 numerically), which would
        // silently defeat the eval-vectors.json pin that two numeric
        // strings compare LEXICALLY under JS `<` (see the golden vector
        // "two numeric strings compare lexically, not numerically").
        // strcmp() always does a raw byte comparison.
        if (is_string($l) && is_string($r)) {
            $c = strcmp($l, $r) <=> 0;
        } else {
            $ln = self::toNumber($l);
            $rn = self::toNumber($r);
            if (is_nan($ln) || is_nan($rn)) {
                return false;
            }
            $c = $ln <=> $rn;
        }
        return match ($op) {
            '<' => $c < 0,
            '<=' => $c <= 0,
            '>' => $c > 0,
            '>=' => $c >= 0,
            default => false,
        };
    }

    /** Strict `===`: equal JS type and value, no coercion. Also the shared
     * semantics behind `BarefootJS::eq()`/`neq()` (design doc "NEW helpers"
     * section) -- int/float unify numerically (JS has one number type),
     * bool/null strict, NaN !== NaN, arrays/objects fall back to PHP `===`
     * (value-equality for arrays, identity for stdClass -- a documented
     * divergence, same territory as the Perl port's refaddr comparison). */
    public static function strictEq($l, $r): bool
    {
        $ln = is_int($l) || is_float($l);
        $rn = is_int($r) || is_float($r);
        if ($ln && $rn) {
            $lf = (float) $l;
            $rf = (float) $r;
            if (is_nan($lf) || is_nan($rf)) {
                return false;
            }
            return $lf === $rf;
        }
        if ($ln !== $rn) {
            return false; // one numeric, one not
        }
        if ($l === null) {
            return $r === null;
        }
        if ($r === null) {
            return false;
        }
        $lb = is_bool($l);
        $rb = is_bool($r);
        if ($lb || $rb) {
            if (!($lb && $rb)) {
                return false;
            }
            return $l === $r;
        }
        if (is_string($l) && is_string($r)) {
            return $l === $r;
        }
        // arrays/objects: PHP `===` fallback (see docstring above).
        return $l === $r;
    }

    /** `Array.prototype.includes` membership test -- `===` except `NaN`
     * equals itself. Reuses strictEq()'s type/value rules and only
     * special-cases the two-NaN case strictEq (deliberately, for `===`)
     * reports as unequal. */
    public static function sameValueZero($l, $r): bool
    {
        if ((is_int($l) || is_float($l)) && (is_int($r) || is_float($r))) {
            $lf = (float) $l;
            $rf = (float) $r;
            if (is_nan($lf) && is_nan($rf)) {
                return true;
            }
        }
        return self::strictEq($l, $r);
    }

    private static function unary(string $op, $v)
    {
        if ($op === '!') {
            return !self::truthy($v);
        }
        if ($op === '-') {
            return -self::toNumber($v);
        }
        if ($op === '+') {
            return self::toNumber($v);
        }
        return null;
    }

    // -----------------------------------------------------------------
    // Built-in calls (the deterministic allowlist). Locale-sensitive
    // builtins (localeCompare) are deliberately excluded to keep the
    // backends isomorphic.
    // -----------------------------------------------------------------

    private static function builtinName($callee): string
    {
        if (!is_array($callee) && !is_object($callee)) {
            return '';
        }
        $kind = self::get($callee, 'kind') ?? '';
        if ($kind === 'identifier') {
            return (string) (self::get($callee, 'name') ?? '');
        }
        if ($kind === 'member' && !self::get($callee, 'computed')) {
            $obj = self::get($callee, 'object');
            if ((!is_array($obj) && !is_object($obj)) || self::get($obj, 'kind') !== 'identifier') {
                return '';
            }
            return (string) (self::get($obj, 'name') ?? '') . '.' . (string) (self::get($callee, 'property') ?? '');
        }
        return '';
    }

    private static function safeFloor(float $n): float
    {
        return (is_nan($n) || is_infinite($n)) ? $n : floor($n);
    }

    private static function safeCeil(float $n): float
    {
        return (is_nan($n) || is_infinite($n)) ? $n : ceil($n);
    }

    /** Half rounds toward +Infinity (JS Math.round: 2.5 -> 3, -2.5 -> -2). */
    private static function mathRound(float $n): float
    {
        return (is_nan($n) || is_infinite($n)) ? $n : floor($n + 0.5);
    }

    private static function callBuiltin(string $name, array $args)
    {
        $arg = fn (int $i) => $args[$i] ?? null;

        if ($name === 'Math.max') {
            $m = -INF; // JS Math.max() with no args is -Infinity
            foreach ($args as $a) {
                $n = self::toNumber($a);
                if (is_nan($n)) {
                    return $n; // any NaN argument -> NaN
                }
                if ($n > $m) {
                    $m = $n;
                }
            }
            return $m;
        }
        if ($name === 'Math.min') {
            $m = INF; // JS Math.min() with no args is +Infinity
            foreach ($args as $a) {
                $n = self::toNumber($a);
                if (is_nan($n)) {
                    return $n;
                }
                if ($n < $m) {
                    $m = $n;
                }
            }
            return $m;
        }
        if ($name === 'Math.abs') {
            return abs(self::toNumber($arg(0)));
        }
        if ($name === 'Math.floor') {
            return self::safeFloor(self::toNumber($arg(0)));
        }
        if ($name === 'Math.ceil') {
            return self::safeCeil(self::toNumber($arg(0)));
        }
        if ($name === 'Math.round') {
            return self::mathRound(self::toNumber($arg(0)));
        }
        if ($name === 'String') {
            return self::toStringJs($arg(0));
        }
        if ($name === 'Number') {
            return self::toNumber($arg(0));
        }
        if ($name === 'Boolean') {
            return self::truthy($arg(0));
        }
        // Any other callee is outside the subset (refused upstream).
        return null;
    }

    // -----------------------------------------------------------------
    // Member / index access
    // -----------------------------------------------------------------

    /** Read a property from a JS-shaped value. Per the canonical value
     * convention, an "object" is a stdClass OR a non-list (associative)
     * PHP array -- both are treated as objects for member access. */
    private static function readProperty($obj, $key)
    {
        if ($obj === null) {
            return null;
        }
        if ($obj instanceof \stdClass) {
            return property_exists($obj, $key) ? $obj->$key : null;
        }
        if (is_array($obj)) {
            if (array_is_list($obj)) {
                return $key === 'length' ? count($obj) : null;
            }
            return array_key_exists($key, $obj) ? $obj[$key] : null;
        }
        if (is_string($obj) && $key === 'length') {
            // `.length` is a string property only -- a numeric scalar has
            // no `.length` in the subset (matches the Go/Perl/Python
            // evaluators). Code-point length (mirrors BarefootJS::length()).
            return mb_strlen($obj, 'UTF-8');
        }
        return null;
    }

    private static function readIndex($obj, $index)
    {
        if (is_array($obj) && array_is_list($obj)) {
            $f = self::toNumber($index);
            if (is_nan($f) || is_infinite($f)) {
                return null;
            }
            $i = (int) $f;
            if ((float) $i !== $f || $i < 0 || $i >= count($obj)) {
                return null;
            }
            return $obj[$i];
        }
        if ($obj instanceof \stdClass) {
            $k = self::toStringJs($index);
            return property_exists($obj, $k) ? $obj->$k : null;
        }
        if (is_array($obj)) { // assoc, treated as object
            $k = self::toStringJs($index);
            return array_key_exists($k, $obj) ? $obj[$k] : null;
        }
        return null;
    }

    // -----------------------------------------------------------------
    // Evaluator-driven higher-order folds / predicates (#2018).
    // -----------------------------------------------------------------

    /** Fold an array into a value via the evaluator. Non-array receiver ->
     * the seed `$init` unchanged (mirrors the Perl/Python nil-tolerant
     * convention -- an empty fold degenerates to the seed). */
    public static function fold($items, $body, string $accName, string $itemName, $init, string $direction = 'left', array $baseEnv = [])
    {
        $arr = self::isJsArray($items) ? $items : [];
        if ($direction === 'right') {
            $arr = array_reverse($arr);
        }
        $env = $baseEnv;
        $acc = $init;
        foreach ($arr as $item) {
            $env[$accName] = $acc;
            $env[$itemName] = $item;
            $acc = self::evaluate($body, $env);
        }
        return $acc;
    }

    /** Return a new array ordered by a ParsedExpr comparator. Non-mutating,
     * stable (PHP's usort() is a stable sort as of PHP 8.0; an original-index
     * tie-break is decorated in anyway for defensiveness/portability,
     * mirroring the Perl port). */
    public static function sortBy($items, $cmp, string $paramA, string $paramB, array $baseEnv = []): array
    {
        if (!self::isJsArray($items)) {
            return [];
        }
        $env = $baseEnv;
        $decorated = [];
        foreach (array_values($items) as $i => $v) {
            $decorated[] = [$i, $v];
        }
        usort($decorated, function ($a, $b) use ($cmp, $paramA, $paramB, &$env) {
            $env[$paramA] = $a[1];
            $env[$paramB] = $b[1];
            $c = self::toNumber(self::evaluate($cmp, $env));
            if (is_nan($c)) {
                return $a[0] <=> $b[0]; // NaN comparator result -> keep input order
            }
            $sign = $c <=> 0.0;
            return $sign !== 0 ? $sign : ($a[0] <=> $b[0]);
        });
        return array_map(fn ($d) => $d[1], $decorated);
    }

    public static function filter($items, $pred, string $param, array $baseEnv = []): array
    {
        if (!self::isJsArray($items)) {
            return [];
        }
        $env = $baseEnv;
        $out = [];
        foreach ($items as $item) {
            $env[$param] = $item;
            if (self::truthy(self::evaluate($pred, $env))) {
                $out[] = $item;
            }
        }
        return $out;
    }

    public static function every($items, $pred, string $param, array $baseEnv = []): bool
    {
        $arr = self::isJsArray($items) ? $items : [];
        $env = $baseEnv;
        foreach ($arr as $item) {
            $env[$param] = $item;
            if (!self::truthy(self::evaluate($pred, $env))) {
                return false;
            }
        }
        return true;
    }

    public static function some($items, $pred, string $param, array $baseEnv = []): bool
    {
        $arr = self::isJsArray($items) ? $items : [];
        $env = $baseEnv;
        foreach ($arr as $item) {
            $env[$param] = $item;
            if (self::truthy(self::evaluate($pred, $env))) {
                return true;
            }
        }
        return false;
    }

    public static function find($items, $pred, string $param, bool $forward = true, array $baseEnv = [])
    {
        $arr = self::isJsArray($items) ? $items : [];
        if (!$forward) {
            $arr = array_reverse($arr);
        }
        $env = $baseEnv;
        foreach ($arr as $item) {
            $env[$param] = $item;
            if (self::truthy(self::evaluate($pred, $env))) {
                return $item;
            }
        }
        return null;
    }

    public static function findIndex($items, $pred, string $param, bool $forward = true, array $baseEnv = []): int
    {
        $arr = self::isJsArray($items) ? array_values($items) : [];
        $n = count($arr);
        if ($n === 0) {
            return -1;
        }
        $env = $baseEnv;
        $indices = $forward ? range(0, $n - 1) : range($n - 1, 0);
        foreach ($indices as $i) {
            $env[$param] = $arr[$i];
            if (self::truthy(self::evaluate($pred, $env))) {
                return $i;
            }
        }
        return -1;
    }

    public static function flatMap($items, $proj, string $param, array $baseEnv = []): array
    {
        $arr = self::isJsArray($items) ? $items : [];
        $env = $baseEnv;
        $out = [];
        foreach ($arr as $item) {
            $env[$param] = $item;
            $v = self::evaluate($proj, $env);
            if (self::isJsArray($v)) {
                foreach ($v as $x) {
                    $out[] = $x;
                }
            } else {
                $out[] = $v;
            }
        }
        return $out;
    }

    /** Value-producing `.map(cb)` (#2073): project each element, one result
     * per element (no flatten). */
    public static function mapItems($items, $proj, string $param, array $baseEnv = []): array
    {
        $arr = self::isJsArray($items) ? $items : [];
        $env = $baseEnv;
        $out = [];
        foreach ($arr as $item) {
            $env[$param] = $item;
            $out[] = self::evaluate($proj, $env);
        }
        return $out;
    }

    // -----------------------------------------------------------------
    // JSON-string seams -- the adapter emits `bf.filter_eval(recv, '<json>', ...)`;
    // the predicate body arrives as a JSON string, decoded then handed to
    // the helper above.
    // -----------------------------------------------------------------

    public static function foldJson($items, string $bodyJson, string $accName, string $itemName, $init, string $direction = 'left', array $baseEnv = [])
    {
        return self::fold($items, json_decode($bodyJson), $accName, $itemName, $init, $direction, $baseEnv);
    }

    public static function sortByJson($items, string $cmpJson, string $paramA, string $paramB, array $baseEnv = []): array
    {
        return self::sortBy($items, json_decode($cmpJson), $paramA, $paramB, $baseEnv);
    }

    public static function filterJson($items, string $predJson, string $param, array $baseEnv = []): array
    {
        return self::filter($items, json_decode($predJson), $param, $baseEnv);
    }

    public static function everyJson($items, string $predJson, string $param, array $baseEnv = []): bool
    {
        return self::every($items, json_decode($predJson), $param, $baseEnv);
    }

    public static function someJson($items, string $predJson, string $param, array $baseEnv = []): bool
    {
        return self::some($items, json_decode($predJson), $param, $baseEnv);
    }

    public static function findJson($items, string $predJson, string $param, bool $forward = true, array $baseEnv = [])
    {
        return self::find($items, json_decode($predJson), $param, $forward, $baseEnv);
    }

    public static function findIndexJson($items, string $predJson, string $param, bool $forward = true, array $baseEnv = []): int
    {
        return self::findIndex($items, json_decode($predJson), $param, $forward, $baseEnv);
    }

    public static function flatMapJson($items, string $projJson, string $param, array $baseEnv = []): array
    {
        return self::flatMap($items, json_decode($projJson), $param, $baseEnv);
    }

    public static function mapJson($items, string $projJson, string $param, array $baseEnv = []): array
    {
        return self::mapItems($items, json_decode($projJson), $param, $baseEnv);
    }
}
