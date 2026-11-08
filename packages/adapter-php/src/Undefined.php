<?php

declare(strict_types=1);

namespace Barefoot;

/**
 * JS `undefined` (spec/js-undefined-value.md). PHP's `null` is JS `null`;
 * JS `undefined` is one singleton, `Undefined::value()` (also
 * `BarefootJS::UNDEF()` and `bf.undefined()` / `$bf->undefined()` in a
 * template), created only where JS reads one: a missing key, an
 * out-of-range index, `.at()` / `.find()` with no result, `?.` over a
 * nullish receiver, the `undefined` identifier, an omitted declared prop. No
 * decoded data is walked to convert anything.
 *
 * PHP sees it as an object, so:
 *
 * - it is TRUTHY under PHP's own `if` / `?:` / `!`, and `??` / `isset`
 *   treat it as set; every runtime and emitter site that means JS
 *   "nullish" tests through `Undefined::isNullish()` (`bf.is_nullish` in a
 *   template), never `??` / `isset` / `=== null` / `empty()`;
 * - `__toString()` is `''`, so a text or attribute position prints nothing,
 *   as JSX renders `undefined` there;
 * - `jsonSerialize()` is `null`, so a host encoder writes `null` (and keeps
 *   an object member holding it); the runtime's own JSON walk follows
 *   `JSON.stringify` instead (`Json::ready`);
 * - it has no public properties, so `foreach` over it and `(array)` of it
 *   read nothing.
 *
 * Identity is the class, not the instance: `is_undefined` is an
 * `instanceof` test, so a copy (`clone`, `unserialize`) still reads as
 * `undefined`.
 */
final class Undefined implements \JsonSerializable
{
    private static ?self $instance = null;

    private function __construct()
    {
    }

    /** The singleton. */
    public static function value(): self
    {
        return self::$instance ??= new self();
    }

    /** JS `v === undefined`. */
    public static function isUndefined($v): bool
    {
        return $v instanceof self;
    }

    /** JS `v === null`: PHP's `null`. */
    public static function isNull($v): bool
    {
        return $v === null;
    }

    /** JS `v == null`: `null` or `undefined`. */
    public static function isNullish($v): bool
    {
        return $v === null || $v instanceof self;
    }

    /**
     * Whether a JSON-decoded value (assoc array or stdClass) is the
     * `{"$undef": true}` sentinel, the manifest's (and the golden vectors')
     * spelling of JS `undefined` (spec/js-undefined-value.md, "JSON encoding
     * for vectors").
     */
    public static function isSentinel($v): bool
    {
        if ($v instanceof \stdClass) {
            $v = get_object_vars($v);
        }
        return is_array($v) && count($v) === 1 && array_key_exists('$undef', $v) && $v['$undef'] === true;
    }

    /**
     * `$v` with every sentinel, at any depth, replaced by the undefined
     * value; inside an object (or assoc array) it is a present key holding
     * `undefined`. The container kinds are kept.
     */
    public static function decode($v)
    {
        if (self::isSentinel($v)) {
            return self::value();
        }
        if (is_array($v)) {
            return array_map([self::class, 'decode'], $v);
        }
        if ($v instanceof \stdClass) {
            $out = new \stdClass();
            foreach (get_object_vars($v) as $k => $x) {
                $out->{$k} = self::decode($x);
            }
            return $out;
        }
        return $v;
    }

    public function __toString(): string
    {
        return '';
    }

    public function jsonSerialize(): mixed
    {
        return null;
    }
}
