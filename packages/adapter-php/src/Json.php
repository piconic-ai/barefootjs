<?php

declare(strict_types=1);

namespace Barefoot;

/**
 * Canonical (sorted-key, JS-`JSON.stringify`-parity) JSON encoding, shared by
 * every engine backend (`TwigBackend`, and future `BladeBackend` et al.).
 * Extracted from `TwigBackend::defaultJsonEncoder` / `prepareForJson` so the
 * engine-agnostic runtime (`BarefootJS`) and any backend can depend on one
 * canonical encoder without depending on a specific template engine.
 */
final class Json
{
    /**
     * `sort_keys` parity with the Python backend's `default_json_encoder`
     * (`sort_keys=True`) / the Xslate backend's `JSON::PP->canonical`: keys
     * are recursively sorted so output is deterministic. `JSON_UNESCAPED_SLASHES`
     * matches `JSON.stringify`'s un-escaped `/`. Non-ASCII is `\uXXXX`-escaped
     * (PHP's default, matching Python's default `ensure_ascii`).
     */
    public static function canonicalEncode($data): string
    {
        $prepared = self::prepareForJson(self::ready($data));
        $json = json_encode($prepared, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new \RuntimeException('encode_json failed: ' . json_last_error_msg());
        }
        return $json;
    }

    /**
     * `$value` as `JSON.stringify` sees it, for any encoder (the canonical
     * one above, or a host's `json_encoder`): an object member holding JS
     * `undefined` (`Undefined`) is dropped, an `undefined` array element is
     * `null`, at any depth, and a top-level `undefined` is `null` (an
     * encoder must return a string; `BarefootJS::json` answers a top-level
     * `undefined` itself). The encoder never receives `Undefined`, whose
     * `jsonSerialize()` would keep the member as `null`. A non-list array
     * (a JS object) comes back as a `stdClass`, so it stays an object
     * whatever the drop leaves (`{}`, `{"0":"kept"}`), not a list.
     */
    public static function ready($value)
    {
        if ($value instanceof Undefined) {
            return null;
        }
        if ($value instanceof \stdClass) {
            $out = new \stdClass();
            foreach (get_object_vars($value) as $k => $v) {
                if (!($v instanceof Undefined)) {
                    $out->$k = self::ready($v);
                }
            }
            return $out;
        }
        if (is_array($value)) {
            if (array_is_list($value)) {
                return array_map([self::class, 'ready'], $value);
            }
            // A PHP array that is no list is a JS object, and stays one after
            // a drop: `[0 => 'kept', 'drop' => UNDEF]` is `{"0":"kept"}`, not
            // the list `["kept"]` a PHP array with the keys left would encode.
            $out = new \stdClass();
            foreach ($value as $k => $v) {
                if (!($v instanceof Undefined)) {
                    $out->{$k} = self::ready($v);
                }
            }
            return $out;
        }
        return $value;
    }

    /**
     * Recursively replace non-finite floats with `null` (JSON has no
     * NaN/Infinity -- matches `JSON.stringify(NaN)` at any depth) and sort
     * object keys (stdClass or a non-list/assoc array) for canonical,
     * deterministic output. List arrays are recursed element-wise without
     * reordering.
     */
    private static function prepareForJson($value)
    {
        if (is_float($value)) {
            return (is_nan($value) || is_infinite($value)) ? null : $value;
        }
        if ($value instanceof \stdClass) {
            $vars = get_object_vars($value);
            ksort($vars, SORT_STRING);
            $out = new \stdClass();
            foreach ($vars as $k => $v) {
                $out->$k = self::prepareForJson($v);
            }
            return $out;
        }
        if (is_array($value)) {
            if (array_is_list($value)) {
                return array_map([self::class, 'prepareForJson'], $value);
            }
            $out = [];
            foreach ($value as $k => $v) {
                $out[$k] = self::prepareForJson($v);
            }
            ksort($out, SORT_STRING);
            return $out;
        }
        return $value;
    }
}
