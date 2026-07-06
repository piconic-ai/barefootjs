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
        $prepared = self::prepareForJson($data);
        $json = json_encode($prepared, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new \RuntimeException('encode_json failed: ' . json_last_error_msg());
        }
        return $json;
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
